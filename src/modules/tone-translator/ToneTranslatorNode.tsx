import { useEffect, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import StereoHandles from "@/modules/base/StereoHandles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Play, Square, Waves } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { ToneTranslator, type Curve } from "./ToneTranslator";

interface ToneTranslatorData {
  type: "tone-translator";
  field: string | null;
  waveform: OscillatorType;
  baseFreq: number;
  rangeOctaves: number;
  curve: Curve;
  volume: number;
  smoothing: number;
  isPlaying: boolean;
  collapsed: boolean;
  connectedVoices?: number[];
  dataValues?: Record<string, number>;
}

const WAVEFORMS: OscillatorType[] = ["sine", "square", "sawtooth", "triangle"];
const CURVES: { value: Curve; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "exponential", label: "Exponential" },
  { value: "logarithmic", label: "Logarithmic" },
];

function ToneTranslatorNode({ data, id }: NodeProps<ToneTranslatorData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter, onStart, onStop } = useModuleActions();
  const {
    field, waveform, baseFreq, rangeOctaves, curve, volume, smoothing,
    isPlaying, collapsed, connectedVoices, dataValues,
  } = data;

  const availableFields = Object.keys(dataValues ?? {});
  const connected = new Set(connectedVoices ?? []);
  const isPatched = (ctlIdx: number) => connected.has(ctlIdx);

  // Subscribe to modulation updates for live slider animation
  const [modVals, setModVals] = useState<Record<string, number | null>>({});
  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as ToneTranslator | undefined;
    if (!mod) return;
    const update = () => setModVals(mod.getModValues() as Record<string, number | null>);
    mod.setOnModUpdate(update);
    update();
    return () => { mod.setOnModUpdate(null); };
  }, [id]);

  const effBaseFreq = typeof modVals.baseFreq === "number" ? 20 * Math.pow(2, modVals.baseFreq * 6.6) : baseFreq;
  const effRange    = typeof modVals.range === "number"    ? modVals.range * 8                       : rangeOctaves;
  const effVolume   = typeof modVals.volume === "number"   ? modVals.volume                          : volume;
  const effGlide    = typeof modVals.glide === "number"    ? 0.001 + modVals.glide * 1.999           : smoothing;

  return (
    <Card
      className="bg-background border border-violet-500/40 shadow-lg rounded-xl overflow-hidden relative"
      style={{ minWidth: 320 }}
    >
      {/* Stereo audio output on the right */}
      <StereoHandles type="source" position={Position.Right} className="!bg-violet-400" />

      <div className="p-3 space-y-2 pr-5">
        <ModuleHeader
          id={id}
          title="TONE TRANSLATOR"
          icon={<Waves className="w-5 h-5 text-violet-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        >
          <Button
            size="sm"
            variant={isPlaying ? "destructive" : "default"}
            className="h-7 px-3"
            aria-label={isPlaying ? "Stop tone" : "Play tone"}
            onClick={() => (isPlaying ? onStop(id) : onStart(id))}
          >
            {isPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </Button>
        </ModuleHeader>

        {!collapsed && (
          <>
            {/* Row 0: Note (primary input) — shows the incoming value */}
            <ControlRow label="Note" patched={isPatched(0)} handleId="in-note">
              {isPatched(0) ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-400 transition-all duration-75"
                      style={{ width: `${(typeof modVals.note === "number" ? modVals.note : 0) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-violet-300 w-10 text-right">
                    {((typeof modVals.note === "number" ? modVals.note : 0) * 100).toFixed(0)}%
                  </span>
                </div>
              ) : (
                <Select
                  value={field ?? "__none"}
                  onValueChange={(v) => onUpdateParameter(id, "field", v === "__none" ? null : v)}
                >
                  <SelectTrigger className="h-7 text-[11px]" onPointerDown={(e) => e.stopPropagation()}>
                    <SelectValue placeholder="pick field..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— none —</SelectItem>
                    {availableFields.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </ControlRow>

            {/* Row 1: Base Freq */}
            <ControlRow label="Base" patched={isPatched(1)} handleId="in-baseFreq">
              <div className="flex items-center gap-2">
                <Slider
                  value={[effBaseFreq]}
                  onValueChange={([v]) => !isPatched(1) && onUpdateParameter(id, "baseFreq", v)}
                  min={20}
                  max={2000}
                  step={1}
                  className={`flex-1 ${isPatched(1) ? "pointer-events-none [&_[role=slider]]:bg-violet-400 [&_[role=slider]]:border-violet-300" : ""}`}
                  aria-label="Base frequency"
                />
                <span className={`text-[10px] w-12 text-right ${isPatched(1) ? "text-violet-300 font-bold" : "text-muted-foreground"}`}>
                  {Math.round(effBaseFreq)}Hz
                </span>
              </div>
            </ControlRow>

            {/* Row 2: Range */}
            <ControlRow label="Range" patched={isPatched(2)} handleId="in-range">
              <div className="flex items-center gap-2">
                <Slider
                  value={[effRange]}
                  onValueChange={([v]) => !isPatched(2) && onUpdateParameter(id, "rangeOctaves", v)}
                  min={0}
                  max={8}
                  step={0.1}
                  className={`flex-1 ${isPatched(2) ? "pointer-events-none [&_[role=slider]]:bg-violet-400 [&_[role=slider]]:border-violet-300" : ""}`}
                  aria-label="Range"
                />
                <span className={`text-[10px] w-12 text-right ${isPatched(2) ? "text-violet-300 font-bold" : "text-muted-foreground"}`}>
                  ±{effRange.toFixed(1)}oct
                </span>
              </div>
            </ControlRow>

            {/* Row 3: Volume */}
            <ControlRow label="Volume" patched={isPatched(3)} handleId="in-volume">
              <div className="flex items-center gap-2">
                <Slider
                  value={[effVolume]}
                  onValueChange={([v]) => !isPatched(3) && onUpdateParameter(id, "volume", v)}
                  min={0}
                  max={1}
                  step={0.01}
                  className={`flex-1 ${isPatched(3) ? "pointer-events-none [&_[role=slider]]:bg-violet-400 [&_[role=slider]]:border-violet-300" : ""}`}
                  aria-label="Volume"
                />
                <span className={`text-[10px] w-12 text-right ${isPatched(3) ? "text-violet-300 font-bold" : "text-muted-foreground"}`}>
                  {Math.round(effVolume * 100)}%
                </span>
              </div>
            </ControlRow>

            {/* Row 4: Glide */}
            <ControlRow label="Glide" patched={isPatched(4)} handleId="in-glide">
              <div className="flex items-center gap-2">
                <Slider
                  value={[effGlide]}
                  onValueChange={([v]) => !isPatched(4) && onUpdateParameter(id, "smoothing", v)}
                  min={0.01}
                  max={2}
                  step={0.01}
                  className={`flex-1 ${isPatched(4) ? "pointer-events-none [&_[role=slider]]:bg-violet-400 [&_[role=slider]]:border-violet-300" : ""}`}
                  aria-label="Glide"
                />
                <span className={`text-[10px] w-12 text-right ${isPatched(4) ? "text-violet-300 font-bold" : "text-muted-foreground"}`}>
                  {effGlide.toFixed(2)}s
                </span>
              </div>
            </ControlRow>

            {/* Waveform + Curve — manual only */}
            <div className="pt-2 border-t border-border nodrag nopan space-y-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Waveform</Label>
                <div className="grid grid-cols-4 gap-1 mt-1">
                  {WAVEFORMS.map((w) => (
                    <Button
                      key={w}
                      size="sm"
                      variant={waveform === w ? "default" : "outline"}
                      className="h-6 text-[10px] capitalize"
                      onClick={() => onUpdateParameter(id, "waveform", w)}
                    >
                      {w.slice(0, 3)}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Curve</Label>
                <Select
                  value={curve}
                  onValueChange={(v) => onUpdateParameter(id, "curve", v)}
                >
                  <SelectTrigger className="h-7 text-[11px]" onPointerDown={(e) => e.stopPropagation()}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURVES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}
      </div>

    </Card>
  );
}

/**
 * A single control row. The ReactFlow Handle is rendered INSIDE the row with
 * `position: relative` on the row itself, so the handle automatically aligns
 * with the row's vertical center regardless of how tall the row actually ends
 * up. This avoids the brittle "fixed offset + index × row height" hack.
 */
function ControlRow({
  label, patched, handleId, children,
}: {
  label: string;
  patched: boolean;
  handleId: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative flex items-center gap-2 nodrag nopan"
      style={{ minHeight: 36 }}
    >
      <Handle
        id={handleId}
        type="target"
        position={Position.Left}
        className={`!border-2 !border-background !w-3.5 !h-3.5 !top-1/2 !-translate-y-1/2 ${
          patched ? "!bg-violet-300" : "!bg-violet-400"
        }`}
        style={{ left: -18 }}
      />
      <div className="w-14 shrink-0 flex items-center gap-1">
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide ${
            patched ? "text-violet-300" : "text-muted-foreground"
          }`}
        >
          {label}
        </span>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export default ToneTranslatorNode;
