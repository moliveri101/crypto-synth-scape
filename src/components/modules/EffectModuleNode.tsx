import { Handle, Position } from "reactflow";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { 
  Waves, Clock, Wind, Zap, CircleDot, Layers,
  Gauge, Shrink, DoorClosed, Mic,
  Sliders, Filter, TrendingUp, TrendingDown,
  Disc, Hash, Sparkles, Radio, Volume2,
  BarChart3, Music4, Move, Maximize2, ChevronDown, ChevronUp, X
} from "lucide-react";

interface EffectModuleNodeProps {
  id: string;
  data: {
    type: string;
    intensity: number;
    mix: number;
    isActive: boolean;
    collapsed: boolean;
    parameters: Record<string, number>;
    onIntensityChange?: (intensity: number) => void;
    onMixChange?: (mix: number) => void;
    onToggleActive?: () => void;
    onParameterChange?: (param: string, value: number) => void;
    onToggleCollapse?: (id: string) => void;
    onRemove?: (id: string) => void;
  };
}

const EFFECT_INFO: Record<string, { label: string; icon: any; color: string; params?: { name: string; min: number; max: number; step: number; unit?: string }[] }> = {
  // Time-Based Effects - Hall/Room Style
  "reverb": { 
    label: "Reverb", 
    icon: Waves, 
    color: "text-blue-400", 
    params: [
      { name: "size", min: 0.1, max: 1, step: 0.01 },
      { name: "decay", min: 0.1, max: 15, step: 0.1, unit: "s" },
      { name: "damping", min: 0, max: 1, step: 0.01 },
      { name: "predelay", min: 0, max: 200, step: 1, unit: "ms" },
      { name: "shimmer", min: 0, max: 1, step: 0.01 },
      { name: "modulation", min: 0, max: 1, step: 0.01 }
    ]
  },
  "delay": { 
    label: "Delay", 
    icon: Clock, 
    color: "text-cyan-400", 
    params: [
      { name: "time", min: 0.01, max: 2, step: 0.01, unit: "s" },
      { name: "feedback", min: 0, max: 0.98, step: 0.01 },
      { name: "filterFreq", min: 100, max: 12000, step: 100, unit: "Hz" },
      { name: "pingpong", min: 0, max: 1, step: 0.01 },
      { name: "tape", min: 0, max: 1, step: 0.01 }
    ]
  },
  "chorus": { 
    label: "Chorus", 
    icon: Wind, 
    color: "text-teal-400", 
    params: [
      { name: "rate", min: 0.1, max: 8, step: 0.1, unit: "Hz" },
      { name: "depth", min: 0, max: 1, step: 0.01 },
      { name: "voices", min: 1, max: 4, step: 1 },
      { name: "detune", min: 0, max: 50, step: 1, unit: "cents" },
      { name: "feedback", min: -0.7, max: 0.7, step: 0.01 }
    ]
  },
  "flanger": { 
    label: "Flanger", 
    icon: CircleDot, 
    color: "text-emerald-400", 
    params: [
      { name: "rate", min: 0.01, max: 15, step: 0.01, unit: "Hz" },
      { name: "depth", min: 0, max: 1, step: 0.01 },
      { name: "feedback", min: -0.95, max: 0.95, step: 0.01 },
      { name: "manual", min: 0.1, max: 20, step: 0.1, unit: "ms" },
      { name: "resonance", min: 0, max: 1, step: 0.01 }
    ]
  },
  "phaser": { 
    label: "Phaser", 
    icon: Layers, 
    color: "text-green-400", 
    params: [
      { name: "rate", min: 0.05, max: 12, step: 0.05, unit: "Hz" },
      { name: "depth", min: 0, max: 1, step: 0.01 },
      { name: "feedback", min: -0.9, max: 0.9, step: 0.01 },
      { name: "stages", min: 2, max: 12, step: 1 },
      { name: "frequency", min: 200, max: 8000, step: 100, unit: "Hz" }
    ]
  },
  
  // Dynamic Effects - Studio Style
  "compressor": { 
    label: "Compressor", 
    icon: Gauge, 
    color: "text-orange-400", 
    params: [
      { name: "threshold", min: -60, max: 0, step: 1, unit: "dB" },
      { name: "ratio", min: 1, max: 20, step: 0.5 },
      { name: "attack", min: 0.001, max: 1, step: 0.001, unit: "s" },
      { name: "release", min: 0.01, max: 2, step: 0.01, unit: "s" },
      { name: "knee", min: 0, max: 40, step: 1, unit: "dB" },
      { name: "makeup", min: 0, max: 30, step: 0.5, unit: "dB" }
    ]
  },
  
  // EQ/Filter Effects - Vintage Style
  "eq": { 
    label: "3-Band EQ", 
    icon: Sliders, 
    color: "text-purple-400", 
    params: [
      { name: "lowFreq", min: 20, max: 500, step: 10, unit: "Hz" },
      { name: "lowGain", min: -24, max: 24, step: 0.5, unit: "dB" },
      { name: "midFreq", min: 200, max: 8000, step: 100, unit: "Hz" },
      { name: "midGain", min: -24, max: 24, step: 0.5, unit: "dB" },
      { name: "midQ", min: 0.3, max: 15, step: 0.1 },
      { name: "highFreq", min: 2000, max: 20000, step: 100, unit: "Hz" },
      { name: "highGain", min: -24, max: 24, step: 0.5, unit: "dB" }
    ]
  },
  "lpf": { 
    label: "Low-Pass Filter", 
    icon: TrendingDown, 
    color: "text-indigo-400", 
    params: [
      { name: "cutoff", min: 20, max: 20000, step: 10, unit: "Hz" },
      { name: "resonance", min: 0.1, max: 40, step: 0.1 },
      { name: "drive", min: 0, max: 1, step: 0.01 },
      { name: "envAmount", min: 0, max: 1, step: 0.01 }
    ]
  },
  "hpf": { 
    label: "High-Pass Filter", 
    icon: TrendingUp, 
    color: "text-violet-400", 
    params: [
      { name: "cutoff", min: 20, max: 20000, step: 10, unit: "Hz" },
      { name: "resonance", min: 0.1, max: 40, step: 0.1 },
      { name: "drive", min: 0, max: 1, step: 0.01 },
      { name: "slope", min: 12, max: 48, step: 12, unit: "dB/oct" }
    ]
  },
  "bandpass": { 
    label: "Band-Pass Filter", 
    icon: Filter, 
    color: "text-fuchsia-400", 
    params: [
      { name: "frequency", min: 20, max: 20000, step: 10, unit: "Hz" },
      { name: "Q", min: 0.1, max: 50, step: 0.1 },
      { name: "gain", min: 0, max: 2, step: 0.01 }
    ]
  },
  "resonant-filter": { 
    label: "Resonant Filter", 
    icon: CircleDot, 
    color: "text-rose-400", 
    params: [
      { name: "cutoff", min: 20, max: 20000, step: 10, unit: "Hz" },
      { name: "resonance", min: 0.1, max: 50, step: 0.1 },
      { name: "envAmount", min: 0, max: 1, step: 0.01 },
      { name: "drive", min: 0, max: 1, step: 0.01 },
      { name: "type", min: 0, max: 1, step: 1 }
    ]
  },
  
  // Distortion Effects - Pedal Style
  "overdrive": { 
    label: "Overdrive", 
    icon: Disc, 
    color: "text-amber-400", 
    params: [
      { name: "drive", min: 0, max: 1, step: 0.01 },
      { name: "tone", min: 0, max: 1, step: 0.01 },
      { name: "level", min: 0, max: 2, step: 0.01 },
      { name: "presence", min: 0, max: 1, step: 0.01 },
      { name: "bite", min: 0, max: 1, step: 0.01 }
    ]
  },
  "distortion": { 
    label: "Distortion", 
    icon: Zap, 
    color: "text-orange-500", 
    params: [
      { name: "amount", min: 0, max: 1, step: 0.01 },
      { name: "tone", min: 0, max: 1, step: 0.01 },
      { name: "level", min: 0, max: 2, step: 0.01 },
      { name: "scoop", min: 0, max: 1, step: 0.01 },
      { name: "saturation", min: 0, max: 1, step: 0.01 }
    ]
  },
  "fuzz": { 
    label: "Fuzz", 
    icon: Hash, 
    color: "text-red-500", 
    params: [
      { name: "fuzz", min: 0, max: 1, step: 0.01 },
      { name: "tone", min: 0, max: 1, step: 0.01 },
      { name: "octave", min: 0, max: 1, step: 0.01 },
      { name: "bias", min: 0, max: 1, step: 0.01 },
      { name: "gate", min: 0, max: 1, step: 0.01 }
    ]
  },
  "bitcrusher": { 
    label: "Bitcrusher", 
    icon: Hash, 
    color: "text-gray-400", 
    params: [
      { name: "bits", min: 1, max: 16, step: 1 },
      { name: "sampleRate", min: 0.01, max: 1, step: 0.01 },
      { name: "mix", min: 0, max: 1, step: 0.01 },
      { name: "crush", min: 0, max: 1, step: 0.01 }
    ]
  },
  
  // Modulation Effects - Vintage Pedals
  "tremolo": { 
    label: "Tremolo", 
    icon: Volume2, 
    color: "text-blue-500", 
    params: [
      { name: "rate", min: 0.5, max: 25, step: 0.1, unit: "Hz" },
      { name: "depth", min: 0, max: 1, step: 0.01 },
      { name: "shape", min: 0, max: 1, step: 0.01 },
      { name: "phase", min: 0, max: 180, step: 1, unit: "°" }
    ]
  },
  "autopan": { 
    label: "Auto-Pan", 
    icon: Move, 
    color: "text-cyan-500", 
    params: [
      { name: "rate", min: 0.1, max: 10, step: 0.1, unit: "Hz" },
      { name: "depth", min: 0, max: 1, step: 0.01 },
      { name: "shape", min: 0, max: 1, step: 0.01 }
    ]
  },
  "vibrato": { 
    label: "Vibrato", 
    icon: Sparkles, 
    color: "text-pink-400", 
    params: [
      { name: "rate", min: 0.5, max: 15, step: 0.1, unit: "Hz" },
      { name: "depth", min: 0, max: 1, step: 0.01 },
      { name: "pitch", min: 0, max: 50, step: 1, unit: "cents" }
    ]
  },
  "ringmod": { 
    label: "Ring Modulator", 
    icon: Radio, 
    color: "text-yellow-400", 
    params: [
      { name: "frequency", min: 20, max: 5000, step: 10, unit: "Hz" },
      { name: "mix", min: 0, max: 1, step: 0.01 },
      { name: "octave", min: -2, max: 2, step: 1 }
    ]
  }
};

const EffectModuleNode = ({ data, id }: EffectModuleNodeProps) => {
  const info = EFFECT_INFO[data.type] || { label: data.type, icon: Sliders, color: "text-primary" };
  const Icon = info.icon;

  return (
    <Card className={`min-w-[280px] bg-card/95 backdrop-blur-sm border-${info.color.replace('text-', '')}/20 shadow-glow`}>
      <Handle id="in" type="target" position={Position.Left} className="!bg-primary" />
      
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <div className="flex items-center gap-2">
            <Icon className={`w-5 h-5 ${info.color}`} />
            <h3 className="font-semibold text-foreground text-sm">{info.label}</h3>
          </div>
          <div className="flex gap-1 items-center">
            <Switch checked={data.isActive} onCheckedChange={data.onToggleActive} />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => data.onRemove?.(id)}
            >
              <X className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-accent"
              onClick={() => data.onToggleCollapse?.(id)}
            >
              {data.collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            </Button>
          </div>
        </div>

        {!data.collapsed && (
          <div className="space-y-3">
          <div>
            <Label className="text-sm text-muted-foreground">
              Intensity: {(data.intensity * 100).toFixed(0)}%
            </Label>
            <Slider
              value={[data.intensity]}
              onValueChange={([v]) => data.onIntensityChange?.(v)}
              min={0}
              max={1}
              step={0.01}
              className="mt-2"
              disabled={!data.isActive}
            />
          </div>

          <div>
            <Label className="text-sm text-muted-foreground">
              Mix: {(data.mix * 100).toFixed(0)}%
            </Label>
            <Slider
              value={[data.mix]}
              onValueChange={([v]) => data.onMixChange?.(v)}
              min={0}
              max={1}
              step={0.01}
              className="mt-2"
              disabled={!data.isActive}
            />
          </div>

          {info.params?.map((param) => {
            const value = data.parameters[param.name] ?? param.min;
            const displayValue = param.step >= 1 ? value.toFixed(0) : value.toFixed(2);
            return (
              <div key={param.name}>
                <Label className="text-sm text-muted-foreground capitalize">
                  {param.name.replace(/([A-Z])/g, ' $1').trim()}: {displayValue}{param.unit || ''}
                </Label>
                <Slider
                  value={[value]}
                  onValueChange={([v]) => data.onParameterChange?.(param.name, v)}
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  className="mt-2"
                  disabled={!data.isActive}
                />
              </div>
            );
          })}
        </div>
        )}
      </div>

      <Handle id="out" type="source" position={Position.Right} className="!bg-primary" />
    </Card>
  );
};

export default EffectModuleNode;
