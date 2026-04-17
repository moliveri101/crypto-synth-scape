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
import { Play, Square, Music } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { SCALE_NAMES, type Scale, MelodyTranslator as MelodyTranslatorClass } from "./MelodyTranslator";

interface MelodyTranslatorData {
  type: "melody-translator";
  field: string | null;
  waveform: OscillatorType;
  scale: Scale;
  rootNote: string;
  octave: number;
  pitch: number;
  volume: number;
  smoothing: number;
  isPlaying: boolean;
  collapsed: boolean;
  connectedVoices?: number[]; // indices of inputs currently patched (from router)
}

const WAVEFORMS: OscillatorType[] = ["sine", "square", "sawtooth", "triangle"];
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const OCTAVES = [1, 2, 3, 4, 5, 6, 7];

function MelodyTranslatorNode({ data, id }: NodeProps<MelodyTranslatorData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter, onStart, onStop } = useModuleActions();
  const {
    waveform, scale, rootNote, octave, pitch, volume, smoothing,
    isPlaying, collapsed, connectedVoices,
  } = data;

  const connected = new Set(connectedVoices ?? []);
  // Map from input index (in MELODY_INPUTS descriptor) → whether a cable is plugged in
  const isPatched = (ctlIdx: number) => connected.has(ctlIdx);

  // Subscribe to live modulation values so sliders animate when patched.
  // modVals[name] is 0..1 if a cable is driving that control, else null.
  const [modVals, setModVals] = useState<Record<string, number | null>>({});
  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as MelodyTranslatorClass | undefined;
    if (!mod) return;
    const update = () => setModVals(mod.getModValues() as Record<string, number | null>);
    mod.setOnModUpdate(update);
    update();
    return () => { mod.setOnModUpdate(null); };
  }, [id]);

  // Effective slider values — when patched, the normalized 0..1 mod value is
  // mapped into the control's native range so the thumb visibly animates.
  const effVolume   = typeof modVals.volume === "number"  ? modVals.volume * 100            : volume * 100;
  const effGlide    = typeof modVals.glide === "number"   ? 0.01 + modVals.glide * 1.99     : smoothing;
  const effPitch    = typeof modVals.pitch === "number"   ? -24 + modVals.pitch * 48        : pitch;
  const effOctave   = typeof modVals.octave === "number"  ? Math.round(1 + modVals.octave * 6) : octave;
  const effScaleIdx = typeof modVals.scale === "number"   ? Math.min(SCALE_NAMES.length - 1, Math.floor(modVals.scale * SCALE_NAMES.length)) : -1;
  const effScale    = effScaleIdx >= 0 ? SCALE_NAMES[effScaleIdx] : scale;
  const effRootIdx  = typeof modVals.root === "number"    ? Math.min(NOTES.length - 1, Math.floor(modVals.root * NOTES.length)) : -1;
  const effRoot     = effRootIdx >= 0 ? NOTES[effRootIdx] : rootNote;

  return (
    <Card
      className="bg-background border border-fuchsia-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 320 }}
    >
      {/* Stereo L/R outputs stay on the right edge */}
      <StereoHandles type="source" position={Position.Right} className="!bg-fuchsia-400" />

      <div className="p-3 space-y-2 pr-5">
        <ModuleHeader
          id={id}
          title="MELODY TRANSLATOR"
          icon={<Music className="w-5 h-5 text-fuchsia-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        >
          <Button
            size="sm"
            variant={isPlaying ? "destructive" : "default"}
            className="h-7 px-3"
            aria-label={isPlaying ? "Stop" : "Play"}
            onClick={() => (isPlaying ? onStop(id) : onStart(id))}
          >
            {isPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </Button>
        </ModuleHeader>

        {!collapsed && (
          <>
            {/* Row 0: Note (drives the melody) */}
            <ControlRow handleId="in-note" label="Note" patched={isPatched(0)}>
              {isPatched(0) ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-fuchsia-400 transition-all duration-75"
                      style={{ width: `${(typeof modVals.note === "number" ? modVals.note : 0) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-fuchsia-300 w-10 text-right">
                    {((typeof modVals.note === "number" ? modVals.note : 0) * 100).toFixed(0)}%
                  </span>
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground italic">
                  Patch a data field to play
                </div>
              )}
            </ControlRow>

            {/* Row 1: Volume */}
            <ControlRow handleId="in-volume" label="Volume" patched={isPatched(1)}>
              <div className="flex items-center gap-2">
                <Slider
                  value={[effVolume]}
                  onValueChange={([v]) => !isPatched(1) && onUpdateParameter(id, "volume", v / 100)}
                  max={200}
                  step={1}
                  className={`flex-1 ${isPatched(1) ? "pointer-events-none [&_[role=slider]]:bg-fuchsia-400 [&_[role=slider]]:border-fuchsia-300" : ""}`}
                  aria-label="Volume"
                />
                <span className={`text-[10px] w-10 text-right ${isPatched(1) ? "text-fuchsia-300 font-bold" : "text-muted-foreground"}`}>
                  {Math.round(effVolume)}%
                </span>
              </div>
            </ControlRow>

            {/* Row 2: Glide */}
            <ControlRow handleId="in-glide" label="Glide" patched={isPatched(2)}>
              <div className="flex items-center gap-2">
                <Slider
                  value={[effGlide]}
                  onValueChange={([v]) => !isPatched(2) && onUpdateParameter(id, "smoothing", v)}
                  min={0.01}
                  max={2}
                  step={0.01}
                  className={`flex-1 ${isPatched(2) ? "pointer-events-none [&_[role=slider]]:bg-fuchsia-400 [&_[role=slider]]:border-fuchsia-300" : ""}`}
                  aria-label="Glide"
                />
                <span className={`text-[10px] w-10 text-right ${isPatched(2) ? "text-fuchsia-300 font-bold" : "text-muted-foreground"}`}>
                  {effGlide.toFixed(2)}s
                </span>
              </div>
            </ControlRow>

            {/* Row 3: Pitch */}
            <ControlRow handleId="in-pitch" label="Pitch" patched={isPatched(3)}>
              <div className="flex items-center gap-2">
                <Slider
                  value={[effPitch]}
                  min={-24}
                  max={24}
                  step={1}
                  onValueChange={([v]) => !isPatched(3) && onUpdateParameter(id, "pitch", v)}
                  className={`flex-1 ${isPatched(3) ? "pointer-events-none [&_[role=slider]]:bg-fuchsia-400 [&_[role=slider]]:border-fuchsia-300" : ""}`}
                  aria-label="Pitch"
                />
                <span className={`text-[10px] w-10 text-right ${isPatched(3) ? "text-fuchsia-300 font-bold" : "text-muted-foreground"}`}>
                  {effPitch >= 0 ? `+${Math.round(effPitch)}` : Math.round(effPitch)} st
                </span>
              </div>
            </ControlRow>

            {/* Row 4: Octave */}
            <ControlRow handleId="in-octave" label="Octave" patched={isPatched(4)}>
              <Select
                value={String(effOctave)}
                onValueChange={(v) => !isPatched(4) && onUpdateParameter(id, "octave", parseInt(v, 10))}
              >
                <SelectTrigger
                  className={`h-7 text-[11px] ${isPatched(4) ? "pointer-events-none text-fuchsia-300 font-bold border-fuchsia-400/60" : ""}`}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OCTAVES.map((o) => <SelectItem key={o} value={String(o)}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </ControlRow>

            {/* Row 5: Scale */}
            <ControlRow handleId="in-scale" label="Scale" patched={isPatched(5)}>
              <Select value={effScale} onValueChange={(v) => !isPatched(5) && onUpdateParameter(id, "scale", v)}>
                <SelectTrigger
                  className={`h-7 text-[11px] ${isPatched(5) ? "pointer-events-none text-fuchsia-300 font-bold border-fuchsia-400/60" : ""}`}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCALE_NAMES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ControlRow>

            {/* Row 6: Root */}
            <ControlRow handleId="in-root" label="Root" patched={isPatched(6)}>
              <Select value={effRoot} onValueChange={(v) => !isPatched(6) && onUpdateParameter(id, "rootNote", v)}>
                <SelectTrigger
                  className={`h-7 text-[11px] ${isPatched(6) ? "pointer-events-none text-fuchsia-300 font-bold border-fuchsia-400/60" : ""}`}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTES.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </ControlRow>

            {/* Waveform (manual only — can't be patched) */}
            <div className="pt-2 border-t border-border nodrag nopan">
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
          </>
        )}
      </div>

    </Card>
  );
}

/**
 * Row wrapper: renders its own input Handle inside the row (with
 * position:relative) so the handle auto-aligns with the row's vertical
 * center regardless of how tall the row actually ends up. Replaces the
 * brittle "top: 110 + i * 44" absolute-positioning hack.
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
          patched ? "!bg-fuchsia-300" : "!bg-fuchsia-400"
        }`}
        style={{ left: -18 }}
      />
      <div className="w-14 shrink-0 flex items-center gap-1">
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide ${
            patched ? "text-fuchsia-300" : "text-muted-foreground"
          }`}
        >
          {label}
        </span>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export default MelodyTranslatorNode;
