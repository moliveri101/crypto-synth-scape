import { Position, NodeProps } from "reactflow";
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
import type { TriggerMode } from "./PulseTranslator";

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
  dataValues?: Record<string, number>;
}

const MODES: { value: TriggerMode; label: string; hint: string }[] = [
  { value: "threshold", label: "Threshold", hint: "Fire on rising edge above level" },
  { value: "rate", label: "Rate", hint: "Continuous pulses, rate = value × max" },
  { value: "onChange", label: "On-Change", hint: "Fire when value changes by ≥ delta" },
];

function PulseTranslatorNode({ data, id }: NodeProps<PulseTranslatorData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter, onAction, onStart, onStop } = useModuleActions();
  const {
    field, mode, threshold, delta, maxRate, pitch, decay, volume,
    isPlaying, collapsed, dataValues,
  } = data;

  const availableFields = Object.keys(dataValues ?? {});
  const modeInfo = MODES.find((m) => m.value === mode);

  return (
    <Card className="bg-background border border-yellow-500/40 shadow-lg rounded-xl overflow-hidden" style={{ minWidth: 280 }}>
      <StereoHandles type="target" position={Position.Left} className="!bg-yellow-400" />
      <StereoHandles type="source" position={Position.Right} className="!bg-yellow-400" />

      <div className="p-3 space-y-3">
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
            {/* Field selector */}
            <div className="nodrag nopan">
              <Label className="text-[10px] text-muted-foreground">
                Data Field {availableFields.length === 0 && <span className="text-yellow-400">(connect a source)</span>}
              </Label>
              <Select
                value={field ?? "__none"}
                onValueChange={(v) => onUpdateParameter(id, "field", v === "__none" ? null : v)}
              >
                <SelectTrigger className="h-7 text-[11px]" onPointerDown={(e) => e.stopPropagation()}>
                  <SelectValue placeholder="select field..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— none —</SelectItem>
                  {availableFields.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Trigger mode */}
            <div className="nodrag nopan">
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
              {modeInfo && (
                <div className="text-[9px] text-muted-foreground italic mt-1">{modeInfo.hint}</div>
              )}
            </div>

            {/* Mode-specific control */}
            {mode === "threshold" && (
              <div className="nodrag nopan">
                <Label className="text-[10px] text-muted-foreground">
                  Threshold: {threshold.toFixed(2)}
                </Label>
                <Slider
                  value={[threshold]}
                  onValueChange={([v]) => onUpdateParameter(id, "threshold", v)}
                  min={0} max={1} step={0.01}
                  aria-label="Threshold"
                />
              </div>
            )}
            {mode === "onChange" && (
              <div className="nodrag nopan">
                <Label className="text-[10px] text-muted-foreground">
                  Delta: {delta.toFixed(2)}
                </Label>
                <Slider
                  value={[delta]}
                  onValueChange={([v]) => onUpdateParameter(id, "delta", v)}
                  min={0.001} max={1} step={0.001}
                  aria-label="Delta"
                />
              </div>
            )}
            {mode === "rate" && (
              <div className="nodrag nopan">
                <Label className="text-[10px] text-muted-foreground">
                  Max Rate: {maxRate.toFixed(1)} Hz (at value=1)
                </Label>
                <Slider
                  value={[maxRate]}
                  onValueChange={([v]) => onUpdateParameter(id, "maxRate", v)}
                  min={0.1} max={30} step={0.1}
                  aria-label="Max rate"
                />
              </div>
            )}

            {/* Pulse character */}
            <div className="border-t border-border pt-2 space-y-2">
              <div className="nodrag nopan">
                <Label className="text-[10px] text-muted-foreground">Pulse Pitch: {Math.round(pitch)} Hz</Label>
                <Slider
                  value={[pitch]}
                  onValueChange={([v]) => onUpdateParameter(id, "pitch", v)}
                  min={20} max={2000} step={1}
                  aria-label="Pulse pitch"
                />
              </div>
              <div className="nodrag nopan">
                <Label className="text-[10px] text-muted-foreground">Decay: {decay.toFixed(2)}s</Label>
                <Slider
                  value={[decay]}
                  onValueChange={([v]) => onUpdateParameter(id, "decay", v)}
                  min={0.01} max={1} step={0.01}
                  aria-label="Decay"
                />
              </div>
              <div className="nodrag nopan">
                <Label className="text-[10px] text-muted-foreground">Volume: {Math.round(volume * 100)}%</Label>
                <Slider
                  value={[volume]}
                  onValueChange={([v]) => onUpdateParameter(id, "volume", v)}
                  min={0} max={1} step={0.01}
                  aria-label="Volume"
                />
              </div>
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

            <div className="text-[9px] text-muted-foreground italic border-t border-border pt-2">
              Translates a data field into pulses. Patch into a Drum voice input to trigger drums,
              or directly to a Mixer / Speakers.
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export default PulseTranslatorNode;
