import React, { useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import StereoHandles from "@/modules/base/StereoHandles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play, Square, Volume2, VolumeX, Sparkles } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import {
  DRUM_VOICES,
  type TrackConfig,
  type Step,
  type DataAlgorithm,
} from "./DataDrumMachine";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DataDrumData {
  type: "data-drum-machine";
  bpm: number;
  swing: number;
  tracks: TrackConfig[];
  currentStep: number;
  isPlaying: boolean;
  collapsed: boolean;
  dataValues: Record<string, number>;
  /** Indices of voices with an edge currently connected to their input. */
  connectedVoices?: number[];
}

const VOICE_LABELS: Record<string, string> = {
  kick: "KICK",
  snare: "SNARE",
  "hihat-closed": "HH-C",
  "hihat-open": "HH-O",
  clap: "CLAP",
  tom: "TOM",
  ride: "RIDE",
  cowbell: "COWB",
};

const ALGORITHMS: { value: DataAlgorithm; label: string }[] = [
  { value: "euclidean", label: "Euclidean" },
  { value: "threshold", label: "Threshold" },
  { value: "probability", label: "Probability" },
  { value: "velocity", label: "Velocity" },
];

// ─── Track Row (memoized) ───────────────────────────────────────────────────

interface TrackRowProps {
  nodeId: string;
  trackIndex: number;
  track: TrackConfig;
  currentStep: number;
  isPlaying: boolean;
  isConnected: boolean;
}

const TrackRow = React.memo(({ nodeId, trackIndex, track, currentStep, isPlaying, isConnected }: TrackRowProps) => {
  const { onUpdateParameter, onAction } = useModuleActions();
  const label = VOICE_LABELS[track.voice] ?? track.voice;

  const toggleStep = (stepIndex: number) => {
    onUpdateParameter(nodeId, "trackStep", {
      trackIndex,
      stepIndex,
      step: { active: !track.steps[stepIndex].active },
    });
  };

  const toggleMute = () => {
    onUpdateParameter(nodeId, "trackConfig", { trackIndex, mute: !track.mute });
  };

  const toggleSolo = () => {
    onUpdateParameter(nodeId, "trackConfig", { trackIndex, solo: !track.solo });
  };

  const preview = () => {
    onAction(nodeId, "trigger", { trackIndex });
  };

  return (
    <div className="flex items-center gap-1 relative">
      {/* Per-voice input handle — one dot per track on the left edge of the node */}
      <Handle
        id={`in-${trackIndex}`}
        type="target"
        position={Position.Left}
        className={`!w-2.5 !h-2.5 !border-2 !border-background ${
          isConnected ? "!bg-green-400" : "!bg-green-500/50"
        }`}
        style={{ top: "50%", transform: "translate(-50%, -50%)" }}
      />

      {/* Voice label — clickable for preview. Green glow when externally connected. */}
      <button
        className={`w-10 text-[9px] font-mono font-bold truncate text-left ${
          isConnected ? "text-green-400" : "text-muted-foreground hover:text-foreground"
        }`}
        onClick={preview}
        aria-label={`Preview ${label}`}
      >
        {label}
      </button>

      {/* Mute / Solo */}
      <button
        className={`w-5 h-5 text-[8px] font-bold rounded ${
          track.mute ? "bg-red-500/80 text-white" : "bg-secondary text-muted-foreground"
        }`}
        onClick={toggleMute}
        aria-label={track.mute ? `Unmute ${label}` : `Mute ${label}`}
      >
        M
      </button>
      <button
        className={`w-5 h-5 text-[8px] font-bold rounded ${
          track.solo ? "bg-yellow-500/80 text-black" : "bg-secondary text-muted-foreground"
        }`}
        onClick={toggleSolo}
        aria-label={track.solo ? `Unsolo ${label}` : `Solo ${label}`}
      >
        S
      </button>

      {/* Step buttons */}
      <div className="flex gap-[2px] nodrag">
        {track.steps.map((step, si) => {
          const isCurrent = isPlaying && si === currentStep;
          const opacity = step.active ? 0.3 + step.velocity * 0.7 : 0;
          return (
            <button
              key={si}
              className={`w-5 h-5 rounded-sm border transition-all nodrag ${
                step.active
                  ? "border-green-500"
                  : "border-border"
              } ${
                isCurrent ? "ring-1 ring-primary ring-offset-1 ring-offset-background" : ""
              } ${
                step.probability < 1 && step.active ? "border-dashed" : ""
              } ${
                si % 4 === 0 ? "ml-[2px]" : ""
              }`}
              style={{
                backgroundColor: step.active
                  ? `rgba(34, 197, 94, ${opacity})`
                  : undefined,
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                toggleStep(si);
              }}
              aria-label={`Step ${si + 1} ${step.active ? "on" : "off"}`}
            />
          );
        })}
      </div>
    </div>
  );
});
TrackRow.displayName = "TrackRow";

// ─── Main Component ─────────────────────────────────────────────────────────

function DataDrumMachineNode({ data, id }: NodeProps<DataDrumData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter, onAction, onStart, onStop } = useModuleActions();
  const { bpm, swing, tracks, currentStep, isPlaying, collapsed, dataValues, connectedVoices } = data;
  const [showDataPanel, setShowDataPanel] = useState(false);

  // Available data fields from connected sources (keys of dataValues)
  const availableFields = Object.keys(dataValues ?? {});
  const connectedSet = new Set(connectedVoices ?? []);

  return (
    <Card className="bg-background border border-green-500/40 shadow-lg rounded-xl overflow-hidden" style={{ minWidth: 520 }}>
      {/* Per-voice input handles are rendered inside each TrackRow on the left.
          The right side still exposes a single stereo pair for audio output. */}
      <StereoHandles type="source" position={Position.Right} className="!bg-green-500" />

      <div className="p-3 space-y-2">
        <ModuleHeader
          id={id}
          title="DATA DRUM MACHINE"
          icon={<Sparkles className="w-5 h-5 text-green-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        >
          {/* Play/Stop in header */}
          <Button
            size="sm"
            variant={isPlaying ? "destructive" : "default"}
            className="h-7 px-3"
            aria-label={isPlaying ? "Stop drum machine" : "Play drum machine"}
            onClick={() => (isPlaying ? onStop(id) : onStart(id))}
          >
            {isPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </Button>
        </ModuleHeader>

        {!collapsed && (
          <>
            {/* Global controls */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Label className="text-[10px] text-muted-foreground">
                  BPM: {bpm}
                </Label>
                <Slider
                  value={[bpm]}
                  onValueChange={([v]) => onUpdateParameter(id, "bpm", v)}
                  min={40}
                  max={300}
                  step={1}
                  aria-label="BPM"
                />
              </div>
              <div className="w-24">
                <Label className="text-[10px] text-muted-foreground">
                  Swing: {Math.round(swing * 100)}%
                </Label>
                <Slider
                  value={[swing]}
                  onValueChange={([v]) => onUpdateParameter(id, "swing", v)}
                  min={0}
                  max={1}
                  step={0.01}
                  aria-label="Swing"
                />
              </div>
            </div>

            {/* Step number ruler */}
            <div className="flex items-center gap-1 pl-[88px]">
              <div className="flex gap-[2px]">
                {Array.from({ length: 16 }, (_, i) => (
                  <div
                    key={i}
                    className={`w-5 text-center text-[7px] font-mono ${
                      i % 4 === 0 ? "text-foreground ml-[2px]" : "text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>

            {/* Track rows */}
            <div className="space-y-[2px]">
              {tracks.map((track, ti) => (
                <TrackRow
                  key={track.voice}
                  nodeId={id}
                  trackIndex={ti}
                  track={track}
                  currentStep={currentStep}
                  isPlaying={isPlaying}
                  isConnected={connectedSet.has(ti)}
                />
              ))}
            </div>

            {/* Data mapping toggle */}
            <Button
              size="sm"
              variant="ghost"
              className="w-full text-[10px] text-muted-foreground h-6"
              onClick={() => setShowDataPanel(!showDataPanel)}
            >
              {showDataPanel ? "Hide Data Mapping" : "Show Data Mapping"}
            </Button>

            {showDataPanel && (
              <div className="space-y-1 border-t border-border pt-2 nodrag nopan nowheel">
                <Label className="text-[10px] text-muted-foreground font-semibold">
                  Data → Pattern Mapping
                  {availableFields.length > 0 && (
                    <span className="ml-2 text-green-400">
                      ({availableFields.length} fields from connected source)
                    </span>
                  )}
                  {availableFields.length === 0 && (
                    <span className="ml-2 text-yellow-400">
                      Connect a data source via patch cord
                    </span>
                  )}
                </Label>
                {tracks.map((track, ti) => (
                  <div key={track.voice} className="flex items-center gap-2">
                    <span className="w-10 text-[9px] font-mono text-muted-foreground">
                      {VOICE_LABELS[track.voice]}
                    </span>
                    <Select
                      value={track.dataField ?? "__none"}
                      onValueChange={(v) =>
                        onUpdateParameter(id, "trackConfig", {
                          trackIndex: ti,
                          dataField: v === "__none" ? null : v,
                        })
                      }
                    >
                      <SelectTrigger className="flex-1 h-6 text-[10px]" onPointerDown={e => e.stopPropagation()}>
                        <SelectValue placeholder="select field..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— none —</SelectItem>
                        {availableFields.map((f) => (
                          <SelectItem key={f} value={f}>{f}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={track.dataAlgorithm}
                      onValueChange={(v) =>
                        onUpdateParameter(id, "trackConfig", {
                          trackIndex: ti,
                          dataAlgorithm: v as DataAlgorithm,
                        })
                      }
                    >
                      <SelectTrigger className="w-24 h-6 text-[10px]" onPointerDown={e => e.stopPropagation()}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALGORITHMS.map((a) => (
                          <SelectItem key={a.value} value={a.value}>
                            {a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

export default DataDrumMachineNode;
