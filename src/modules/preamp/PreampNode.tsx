import { useEffect, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import StereoHandles from "@/modules/base/StereoHandles";
import { Card } from "@/components/ui/card";
// StereoHandles is used for the audio OUTPUT only; the input is a single
// dedicated handle rendered inline as a ControlRow to avoid click-area
// conflicts with the slider rows.
import { Slider } from "@/components/ui/slider";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { Volume2 } from "lucide-react";
import { PreampModule, PREAMP_KNOBS, type PreampKnob } from "./PreampModule";

interface PreampData {
  type: "preamp";
  gain: number;
  drive: number;
  body: number;
  presence: number;
  width: number;
  output: number;
  mix: number;
  collapsed: boolean;
  connectedVoices?: number[];
}

type RowDef = {
  k: PreampKnob;
  label: string;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
};

// Slider rows in render order. Handle at index i = connectedVoices lookup index.
const ROWS: RowDef[] = [
  { k: "gain",     label: "Gain",     min: 0, max: 40, step: 0.1, fmt: (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "dB" },
  { k: "drive",    label: "Drive",    min: 0, max: 1,  step: 0.01, fmt: (v) => v.toFixed(2) },
  { k: "body",     label: "Body",     min: -12, max: 12, step: 0.1, fmt: (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "dB" },
  { k: "presence", label: "Presence", min: -12, max: 12, step: 0.1, fmt: (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "dB" },
  { k: "width",    label: "Width",    min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) + "%" },
  { k: "output",   label: "Output",   min: -24, max: 6,  step: 0.1, fmt: (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "dB" },
  { k: "mix",      label: "Mix",      min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) + "%" },
];

function PreampNode({ data, id }: NodeProps<PreampData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { gain, drive, body, presence, width, output, mix, collapsed, connectedVoices } = data;

  const connected = new Set(connectedVoices ?? []);
  const isPatched = (ctlIdx: number) => connected.has(ctlIdx);

  // Subscribe to live modulation so sliders animate when patched
  const [modVals, setModVals] = useState<Partial<Record<PreampKnob, number>>>({});
  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as PreampModule | undefined;
    if (!mod) return;
    const update = () => setModVals(mod.getSnapshot().values);
    mod.setOnModUpdate(update);
    update();
    return () => { mod.setOnModUpdate(null); };
  }, [id]);

  const manualMap: Record<PreampKnob, number> = { gain, drive, body, presence, width, output, mix };

  // connectedVoices indexes: 0 = audio L input, 1 = audio R input,
  // 2..8 = the 7 knobs.
  const audioLPatched = isPatched(0);
  const audioRPatched = isPatched(1);

  return (
    <Card
      className="bg-background border border-orange-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 320 }}
    >
      {/* Stereo audio output on the right. Audio INPUT is rendered inline as
          a dedicated row below so it doesn't overlap the slider click areas. */}
      <StereoHandles type="source" position={Position.Right} className="!bg-orange-400" />

      <div className="p-3 space-y-2 pr-5 pl-5">
        <ModuleHeader
          id={id}
          title="PREAMP"
          subtitle="Tube-style gain stage"
          icon={<Volume2 className="w-5 h-5 text-orange-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        />

        {!collapsed && (
          <>
            {/* Stereo audio input rows — two handles (L/R) stacked,
                matching the rest of the app's visual language. Both handles
                route to inputNode internally. */}
            <ControlRow label="Audio L" patched={audioLPatched} handleId="in-audio-L">
              <div className={`text-[10px] italic ${audioLPatched ? "text-orange-300" : "text-muted-foreground"}`}>
                {audioLPatched ? "connected" : "plug left channel"}
              </div>
            </ControlRow>
            <ControlRow label="Audio R" patched={audioRPatched} handleId="in-audio-R">
              <div className={`text-[10px] italic ${audioRPatched ? "text-orange-300" : "text-muted-foreground"}`}>
                {audioRPatched ? "connected" : "plug right channel"}
              </div>
            </ControlRow>
            {/* Separator between audio input rows and modulation slider rows */}
            <div className="h-px bg-orange-500/20 my-1" />

            {ROWS.map((row, i) => {
              // connectedVoices index for a knob row is its position + 2
              // (indexes 0 and 1 are reserved for L and R audio inputs)
              const patched = isPatched(i + 2);
              // When patched: the module's effective value (modulated); otherwise: the manual slider value
              const effective = patched ? (modVals[row.k] ?? manualMap[row.k]) : manualMap[row.k];
              return (
                <ControlRow
                  key={row.k}
                  label={row.label}
                  patched={patched}
                  handleId={"in-" + row.k}
                >
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[effective]}
                      onValueChange={([v]) => !patched && onUpdateParameter(id, row.k, v)}
                      min={row.min}
                      max={row.max}
                      step={row.step}
                      className={"flex-1 " + (patched ? "pointer-events-none [&_[role=slider]]:bg-orange-400 [&_[role=slider]]:border-orange-300" : "")}
                      aria-label={row.label}
                    />
                    <span
                      className={"text-[10px] font-mono tabular-nums w-14 text-right " + (patched ? "text-orange-300 font-bold" : "text-muted-foreground")}
                    >
                      {row.fmt(effective)}
                    </span>
                  </div>
                </ControlRow>
              );
            })}
          </>
        )}
      </div>
    </Card>
  );
}

/**
 * Per-row wrapper that renders its own input Handle inside the row. Using
 * position:relative on the row lets the handle auto-center on it regardless
 * of how the row's content grows.
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
          patched ? "!bg-orange-300" : "!bg-orange-400"
        }`}
        style={{ left: -18 }}
      />
      <div className="w-14 shrink-0 flex items-center gap-1">
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide ${
            patched ? "text-orange-300" : "text-muted-foreground"
          }`}
        >
          {label}
        </span>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export default PreampNode;
