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

const EFFECT_INFO: Record<string, { label: string; icon: any; color: string; params?: { name: string; min: number; max: number; step: number }[] }> = {
  // Time-Based
  "reverb": { label: "Reverb", icon: Waves, color: "text-blue-400", params: [{ name: "size", min: 0, max: 1, step: 0.01 }, { name: "decay", min: 0.1, max: 10, step: 0.1 }] },
  "delay": { label: "Delay", icon: Clock, color: "text-cyan-400", params: [{ name: "time", min: 0.1, max: 2, step: 0.01 }, { name: "feedback", min: 0, max: 0.9, step: 0.01 }] },
  "chorus": { label: "Chorus", icon: Wind, color: "text-teal-400", params: [{ name: "rate", min: 0.1, max: 10, step: 0.1 }, { name: "depth", min: 0, max: 1, step: 0.01 }] },
  "flanger": { label: "Flanger", icon: CircleDot, color: "text-emerald-400", params: [{ name: "rate", min: 0.1, max: 10, step: 0.1 }, { name: "depth", min: 0, max: 1, step: 0.01 }] },
  "phaser": { label: "Phaser", icon: Layers, color: "text-green-400", params: [{ name: "rate", min: 0.1, max: 10, step: 0.1 }, { name: "stages", min: 2, max: 12, step: 1 }] },
  "pingpong-delay": { label: "Ping-Pong Delay", icon: Zap, color: "text-blue-300", params: [{ name: "time", min: 0.1, max: 2, step: 0.01 }] },
  
  // Dynamic
  "compressor": { label: "Compressor", icon: Gauge, color: "text-orange-400", params: [{ name: "threshold", min: -60, max: 0, step: 1 }, { name: "ratio", min: 1, max: 20, step: 0.5 }] },
  "limiter": { label: "Limiter", icon: Shrink, color: "text-red-400", params: [{ name: "threshold", min: -30, max: 0, step: 1 }] },
  "gate": { label: "Gate", icon: DoorClosed, color: "text-yellow-400", params: [{ name: "threshold", min: -60, max: 0, step: 1 }] },
  "de-esser": { label: "De-esser", icon: Mic, color: "text-pink-400", params: [{ name: "frequency", min: 2000, max: 10000, step: 100 }] },
  
  // EQ/Filter
  "eq": { label: "EQ", icon: Sliders, color: "text-purple-400", params: [{ name: "low", min: -12, max: 12, step: 0.5 }, { name: "mid", min: -12, max: 12, step: 0.5 }, { name: "high", min: -12, max: 12, step: 0.5 }] },
  "lpf": { label: "Low-Pass Filter", icon: TrendingDown, color: "text-indigo-400", params: [{ name: "cutoff", min: 20, max: 20000, step: 10 }, { name: "resonance", min: 0, max: 20, step: 0.1 }] },
  "hpf": { label: "High-Pass Filter", icon: TrendingUp, color: "text-violet-400", params: [{ name: "cutoff", min: 20, max: 20000, step: 10 }, { name: "resonance", min: 0, max: 20, step: 0.1 }] },
  "bandpass": { label: "Band-Pass Filter", icon: Filter, color: "text-fuchsia-400", params: [{ name: "frequency", min: 20, max: 20000, step: 10 }, { name: "Q", min: 0.1, max: 20, step: 0.1 }] },
  "resonant-filter": { label: "Resonant Filter", icon: CircleDot, color: "text-rose-400", params: [{ name: "cutoff", min: 20, max: 20000, step: 10 }, { name: "resonance", min: 0, max: 30, step: 0.1 }] },
  
  // Distortion
  "overdrive": { label: "Overdrive", icon: Disc, color: "text-amber-400", params: [{ name: "drive", min: 0, max: 1, step: 0.01 }] },
  "distortion": { label: "Distortion", icon: Zap, color: "text-orange-500", params: [{ name: "amount", min: 0, max: 1, step: 0.01 }] },
  "fuzz": { label: "Fuzz", icon: Hash, color: "text-red-500", params: [{ name: "fuzz", min: 0, max: 1, step: 0.01 }] },
  "bitcrusher": { label: "Bitcrusher", icon: Hash, color: "text-gray-400", params: [{ name: "bits", min: 1, max: 16, step: 1 }, { name: "rate", min: 0.1, max: 1, step: 0.01 }] },
  "tape-saturation": { label: "Tape Saturation", icon: Radio, color: "text-brown-400", params: [{ name: "drive", min: 0, max: 1, step: 0.01 }] },
  
  // Modulation
  "vibrato": { label: "Vibrato", icon: Waves, color: "text-sky-400", params: [{ name: "rate", min: 0.1, max: 20, step: 0.1 }, { name: "depth", min: 0, max: 1, step: 0.01 }] },
  "tremolo": { label: "Tremolo", icon: Volume2, color: "text-blue-500", params: [{ name: "rate", min: 0.1, max: 20, step: 0.1 }, { name: "depth", min: 0, max: 1, step: 0.01 }] },
  "ring-mod": { label: "Ring Modulator", icon: CircleDot, color: "text-indigo-500", params: [{ name: "frequency", min: 20, max: 2000, step: 10 }] },
  "pitch-shifter": { label: "Pitch Shifter", icon: Music4, color: "text-purple-500", params: [{ name: "shift", min: -24, max: 24, step: 1 }] },
  "octaver": { label: "Octaver", icon: BarChart3, color: "text-violet-500", params: [{ name: "octave", min: -2, max: 2, step: 1 }] },
  
  // Advanced
  "granular": { label: "Granular", icon: Sparkles, color: "text-pink-500", params: [{ name: "grainSize", min: 10, max: 500, step: 10 }, { name: "overlap", min: 0, max: 1, step: 0.01 }] },
  "vocoder": { label: "Vocoder", icon: Mic, color: "text-cyan-500", params: [{ name: "bands", min: 4, max: 32, step: 1 }] },
  "auto-pan": { label: "Auto-Pan", icon: Move, color: "text-teal-500", params: [{ name: "rate", min: 0.1, max: 10, step: 0.1 }, { name: "depth", min: 0, max: 1, step: 0.01 }] },
  "stereo-widener": { label: "Stereo Widener", icon: Maximize2, color: "text-emerald-500", params: [{ name: "width", min: 0, max: 2, step: 0.01 }] },
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

          {info.params?.map((param) => (
            <div key={param.name}>
              <Label className="text-sm text-muted-foreground capitalize">
                {param.name}: {data.parameters[param.name]?.toFixed(2) ?? param.min}
              </Label>
              <Slider
                value={[data.parameters[param.name] ?? param.min]}
                onValueChange={([v]) => data.onParameterChange?.(param.name, v)}
                min={param.min}
                max={param.max}
                step={param.step}
                className="mt-2"
                disabled={!data.isActive}
              />
            </div>
          ))}
        </div>
        )}
      </div>

      <Handle id="out" type="source" position={Position.Right} className="!bg-primary" />
    </Card>
  );
};

export default EffectModuleNode;
