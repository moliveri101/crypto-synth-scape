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
import { Play, Square, Zap } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { PulseTranslator, type TriggerMode } from "./PulseTranslator";

interface PulseTranslatorData {
  type: "pulse-translator";
  field: string | null;
  mode: TriggerMode;
  threshold: number;
  delta: number;
  maxRate: number;
  pitch: number;
  decay: number;
  volume: number;
  isPlaying: boolean;
  collapsed: boolean;
  connectedVoices?: number[];
  dataValues?: Record<string, number>;
}

const MODES: { value: TriggerMode; label: string }[] = [
  { value: "threshold", label: "Threshold" },
  { value: "rate", label: "Rate" },
  { value: "onChange", label: "On-Change" },
];

function PulseTranslatorNode({ data, id }: NodeProps<PulseTranslatorData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter, onAction, onStart, onStop } = useModuleActions();
  const {
    field, mode, threshold, delta, maxRate, pitch, decay, volume,
    isPlaying, collapsed, connectedVoices, dataValues,
  } = data;

  const availableFields = Object.keys(dataValues ?? {});
  const connected = new Set(connectedVoices ?? []);
  const isPatched = (ctlIdx: number) => connected.has(ctlIdx);

  // Subscribe to modulation values for live slider animation
  const [modVals, setModVals] = useState<Record<string, number | null>>({});
  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as PulseTranslator | undefined;
    if (!mod) return;
    const update = () => setModVals(mod.getModValues() as Record<string, number | null>);
    mod.setOnModUpdate(update);
    update();
    return () => { mod.setOnModUpdate(null); };
  }, [id]);

  const effThreshold = typeof modVals.threshold === "number" ? modVals.threshold                  : threshold;
  const effDelta     = typeof modVals.delta     === "number" ? 0.001 + modVals.delta * 0.999      : delta;
  const effMaxRate   = typeof modVals.maxRate   === "number" ? 0.1 + modVals.maxRate * 49.9       : maxRate;
  const effPitch     = typeof modVals.pitch     === "number" ? 20 * Math.pow(2, modVals.pitch * 8.6) : pitch;
  const effDecay     = typeof modVals.decay     === "number" ? 0.01 + modVals.decay * 1.99        : decay;
  const effVolume    = typeof modVals.volume    === "number" ? modVals.volume                      : volume;

  return (
    <Card
      className="bg-background border border-yellow-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 320 }}
    >
      {/* Stereo audio output on the right */}
      <StereoHandles type="source" position={Position.Right} className="!bg-yellow-400" />

      <div className="p-3 space-y-2 pr-5">
        <ModuleHeader
          id={id}
          title="PULSE TRANSLATOR"
          icon={<Zap className="w-5 h-5 text-yellow-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        >
          <Button
            size="sm"
            variant={isPlaying ? "destructive" : "default"}
            className="h-7 px-3"
            aria-label={isPlaying ? "Stop" : "Start"}
            onClick={() => (isPlaying ? onStop(id) : onStart(id))}
          >
            {isPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </Button>
        </ModuleHeader>

        {!collapsed && (
          <>
            {/* Row 0: Trigger */}
            <ControlRow label="Trigger" patched={isPatched(0)} handleId="in-trigger">
              {isPatched(0) ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-400 transition-all duration-75"
                      style={{ width: `${(typeof modVals.trigger === "number" ? modVals.trigger : 0) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-yellow-300 w-10 text-right">
                    {((typeof modVals.trigger === "number" ? modVals.trigger : 0) * 100).toFixed(0)}%
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

            {/* Row 1: Threshold */}
            <ControlRow label="Thresh" patched={isPatched(1)} handleId="in-threshold">
              <div className="flex items-center gap-2">
                <Slider
                  value={[effThreshold]}
                  onValueChange={([v]) => !isPatched(1) && onUpdateParameter(id, "threshold", v)}
                  min={0} max={1} step={0.01}
                  className={`flex-1 ${isPatched(1) ? "pointer-events-none [&_[role=slider]]:bg-yellow-400 [&_[role=slider]]:border-yellow-300" : ""}`}
                  aria-label="Threshold"
                />
                <span className={`text-[10px] w-12 text-right ${isPatched(1) ? "text-yellow-300 font-bold" : "text-muted-foreground"}`}>
                  {effThreshold.toFixed(2)}
                </span>
              </div>
            </ControlRow>

            {/* Row 2: Delta */}
            <ControlRow label="Delta" patched={isPatched(2)} handleId="in-delta">
              <div className="flex items-center gap-2">
                <Slider
                  value={[effDelta]}
                  onValueChange={([v]) => !isPatched(2) && onUpdateParameter(id, "delta", v)}
                  min={0.001} max={1} step={0.001}
                  className={`flex-1 ${isPatched(2) ? "pointer-events-none [&_[role=slider]]:bg-yellow-400 [&_[role=slider]]:border-yellow-300" : ""}`}
                  aria-label="Delta"
                />
                <span className={`text-[10px] w-12 text-right ${isPatched(2) ? "text-yellow-300 font-bold" : "text-muted-foreground"}`}>
                  {effDelta.toFixed(3)}
                </span>
              </div>
            </ControlRow>

            {/* Row 3: Max Rate */}
            <ControlRow label="Rate" patched={isPatched(3)} handleId="in-maxRate">
              <div className="flex items-center gap-2">
                <Slider
                  value={[effMaxRate]}
                  onValueChange={([v]) => !isPatched(3) && onUpdateParameter(id, "maxRate", v)}
                  min={0.1} max={50} step={0.1}
                  className={`flex-1 ${isPatched(3) ? "pointer-events-none [&_[role=slider]]:bg-yellow-400 [&_[role=slider]]:border-yellow-300" : ""}`}
                  aria-label="Max rate"
                />
                <span className={`text-[10px] w-12 text-right ${isPatched(3) ? "text-yellow-300 font-bold" : "text-muted-foreground"}`}>
                  {effMaxRate.toFixed(1)}Hz
                </span>
              </div>
            </ControlRow>

            {/* Row 4: Pitch */}
            <ControlRow label="Pitch" patched={isPatched(4)} handleId="in-pitch">
              <div className="flex items-center gap-2">
                <Slider
                  value={[effPitch]}
                  onValueChange={([v]) => !isPatched(4) && onUpdateParameter(id, "pitch", v)}
                  min={20} max={2000} step={1}
                  className={`flex-1 ${isPatched(4) ? "pointer-events-none [&_[role=slider]]:bg-yellow-400 [&_[role=slider]]:border-yellow-300" : ""}`}
                  aria-label="Pulse pitch"
                />
                <span className={`text-[10px] w-12 text-right ${isPatched(4) ? "text-yellow-300 font-bold" : "text-muted-foreground"}`}>
                  {Math.round(effPitch)}Hz
                </span>
              </div>
            </ControlRow>

            {/* Row 5: Decay */}
            <ControlRow label="Decay" patched={isPatched(5)} handleId="in-decay">
              <div className="flex items-center gap-2">
                <Slider
                  value={[effDecay]}
                  onValueChange={([v]) => !isPatched(5) && onUpdateParameter(id, "decay", v)}
                  min={0.01} max={2} step={0.01}
                  className={`flex-1 ${isPatched(5) ? "pointer-events-none [&_[role=slider]]:bg-yellow-400 [&_[role=slider]]:border-yellow-300" : ""}`}
                  aria-label="Decay"
                />
                <span className={`text-[10px] w-12 text-right ${isPatched(5) ? "text-yellow-300 font-bold" : "text-muted-foreground"}`}>
                  {effDecay.toFixed(2)}s
                </span>
              </div>
            </ControlRow>

            {/* Row 6: Volume */}
            <ControlRow label="Volume" patched={isPatched(6)} handleId="in-volume">
              <div className="flex items-center gap-2">
                <Slider
                  value={[effVolume]}
                  onValueChange={([v]) => !isPatched(6) && onUpdateParameter(id, "volume", v)}
                  min={0} max={1} step={0.01}
                  className={`flex-1 ${isPatched(6) ? "pointer-events-none [&_[role=slider]]:bg-yellow-400 [&_[role=slider]]:border-yellow-300" : ""}`}
                  aria-label="Volume"
                />
                <span className={`text-[10px] w-12 text-right ${isPatched(6) ? "text-yellow-300 font-bold" : "text-muted-foreground"}`}>
                  {Math.round(effVolume * 100)}%
                </span>
              </div>
            </ControlRow>

            {/* Mode + Test — manual only */}
            <div className="pt-2 border-t border-border nodrag nopan space-y-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Trigger Mode</Label>
                <Select
                  value={mode}
                  onValueChange={(v) => onUpdateParameter(id, "mode", v)}
                >
                  <SelectTrigger className="h-7 text-[11px]" onPointerDown={(e) => e.stopPropagation()}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full h-7 text-[10px] gap-1"
                onClick={() => onAction(id, "triggerPulse")}
              >
                <Zap className="w-3 h-3" />
                Test Pulse
              </Button>
            </div>
          </>
        )}
      </div>

    </Card>
  );
}

/**
 * Single row that renders its own Handle inside, auto-aligning with the
 * row's vertical center no matter the actual row height.
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
          patched ? "!bg-yellow-300" : "!bg-yellow-400"
        }`}
        style={{ left: -18 }}
      />
      <div className="w-14 shrink-0 flex items-center gap-1">
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide ${
            patched ? "text-yellow-300" : "text-muted-foreground"
          }`}
        >
          {label}
        </span>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export default PulseTranslatorNode;
