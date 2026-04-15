import { Position, NodeProps } from "reactflow";
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
import type { Curve } from "./ToneTranslator";

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
    isPlaying, collapsed, dataValues,
  } = data;

  const availableFields = Object.keys(dataValues ?? {});

  return (
    <Card className="bg-background border border-violet-500/40 shadow-lg rounded-xl overflow-hidden" style={{ minWidth: 280 }}>
      <StereoHandles type="target" position={Position.Left} className="!bg-violet-400" />
      <StereoHandles type="source" position={Position.Right} className="!bg-violet-400" />

      <div className="p-3 space-y-3">
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

            {/* Base frequency */}
            <div className="nodrag nopan">
              <Label className="text-[10px] text-muted-foreground">
                Base Frequency: {baseFreq.toFixed(0)} Hz
              </Label>
              <Slider
                value={[baseFreq]}
                onValueChange={([v]) => onUpdateParameter(id, "baseFreq", v)}
                min={20}
                max={2000}
                step={1}
                aria-label="Base frequency"
              />
            </div>

            {/* Range in octaves */}
            <div className="nodrag nopan">
              <Label className="text-[10px] text-muted-foreground">
                Range: ±{rangeOctaves.toFixed(1)} octaves
              </Label>
              <Slider
                value={[rangeOctaves]}
                onValueChange={([v]) => onUpdateParameter(id, "rangeOctaves", v)}
                min={0}
                max={6}
                step={0.1}
                aria-label="Range in octaves"
              />
            </div>

            {/* Volume */}
            <div className="nodrag nopan">
              <Label className="text-[10px] text-muted-foreground">
                Volume: {Math.round(volume * 100)}%
              </Label>
              <Slider
                value={[volume]}
                onValueChange={([v]) => onUpdateParameter(id, "volume", v)}
                min={0}
                max={1}
                step={0.01}
                aria-label="Volume"
              />
            </div>

            {/* Smoothing */}
            <div className="nodrag nopan">
              <Label className="text-[10px] text-muted-foreground">
                Smoothing: {smoothing.toFixed(2)}s
              </Label>
              <Slider
                value={[smoothing]}
                onValueChange={([v]) => onUpdateParameter(id, "smoothing", v)}
                min={0.01}
                max={2}
                step={0.01}
                aria-label="Smoothing"
              />
            </div>

            {/* Waveform */}
            <div className="nodrag nopan">
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
                    {w[0].toUpperCase() + w.slice(1, 3)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Curve */}
            <div className="nodrag nopan">
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

            <div className="text-[9px] text-muted-foreground italic border-t border-border pt-2">
              Translates a data field into a continuous tone. Connect a data source to the left input,
              pick a field, route output to a Mixer / Effect / Speakers.
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export default ToneTranslatorNode;
