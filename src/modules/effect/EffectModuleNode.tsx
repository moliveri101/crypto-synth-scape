import { Position } from "reactflow";
import StereoHandles from "@/modules/base/StereoHandles";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import ModuleHeader from "@/modules/base/ModuleHeader";
import {
  Waves,
  Clock,
  Wind,
  Zap,
  CircleDot,
  Layers,
  Gauge,
  Shrink,
  DoorClosed,
  Mic,
  Sliders,
  Filter,
  TrendingUp,
  TrendingDown,
  Disc,
  Hash,
  Sparkles,
  Radio,
  Volume2,
  BarChart3,
  Music4,
  Move,
  Maximize2,
  Headphones,
  type LucideIcon,
} from "lucide-react";
import { useModuleActions } from "@/modules/base/ModuleContext";

// ---------------------------------------------------------------------------
// EFFECT_INFO -- exported so descriptors / menus can reference it
// ---------------------------------------------------------------------------

interface EffectParam {
  name: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

interface EffectMeta {
  label: string;
  icon: LucideIcon;
  color: string;
  params: EffectParam[];
}

export const EFFECT_INFO: Record<string, EffectMeta> = {
  // ---------- Time-Based Effects ----------
  reverb: {
    label: "Reverb",
    icon: Waves,
    color: "text-blue-400",
    params: [
      { name: "size", min: 0.1, max: 1, step: 0.01 },
      { name: "decay", min: 0.1, max: 15, step: 0.1, unit: "s" },
      { name: "damping", min: 0, max: 1, step: 0.01 },
      { name: "predelay", min: 0, max: 200, step: 1, unit: "ms" },
      { name: "shimmer", min: 0, max: 1, step: 0.01 },
      { name: "modulation", min: 0, max: 1, step: 0.01 },
    ],
  },
  delay: {
    label: "Delay",
    icon: Clock,
    color: "text-cyan-400",
    params: [
      { name: "time", min: 0.01, max: 2, step: 0.01, unit: "s" },
      { name: "feedback", min: 0, max: 0.98, step: 0.01 },
      { name: "filterFreq", min: 100, max: 12000, step: 100, unit: "Hz" },
      { name: "pingpong", min: 0, max: 1, step: 0.01 },
      { name: "tape", min: 0, max: 1, step: 0.01 },
    ],
  },
  "ping-pong-delay": {
    label: "Ping-Pong Delay",
    icon: Clock,
    color: "text-sky-400",
    params: [
      { name: "time", min: 0.01, max: 2, step: 0.01, unit: "s" },
      { name: "feedback", min: 0, max: 0.98, step: 0.01 },
      { name: "spread", min: 0, max: 1, step: 0.01 },
      { name: "filterFreq", min: 100, max: 12000, step: 100, unit: "Hz" },
    ],
  },
  chorus: {
    label: "Chorus",
    icon: Wind,
    color: "text-teal-400",
    params: [
      { name: "rate", min: 0.1, max: 8, step: 0.1, unit: "Hz" },
      { name: "depth", min: 0, max: 1, step: 0.01 },
      { name: "voices", min: 1, max: 4, step: 1 },
      { name: "detune", min: 0, max: 50, step: 1, unit: "cents" },
      { name: "feedback", min: -0.7, max: 0.7, step: 0.01 },
    ],
  },
  flanger: {
    label: "Flanger",
    icon: CircleDot,
    color: "text-emerald-400",
    params: [
      { name: "rate", min: 0.01, max: 15, step: 0.01, unit: "Hz" },
      { name: "depth", min: 0, max: 1, step: 0.01 },
      { name: "feedback", min: -0.95, max: 0.95, step: 0.01 },
      { name: "manual", min: 0.1, max: 20, step: 0.1, unit: "ms" },
      { name: "resonance", min: 0, max: 1, step: 0.01 },
    ],
  },
  phaser: {
    label: "Phaser",
    icon: Layers,
    color: "text-green-400",
    params: [
      { name: "rate", min: 0.05, max: 12, step: 0.05, unit: "Hz" },
      { name: "depth", min: 0, max: 1, step: 0.01 },
      { name: "feedback", min: -0.9, max: 0.9, step: 0.01 },
      { name: "stages", min: 2, max: 12, step: 1 },
      { name: "frequency", min: 200, max: 8000, step: 100, unit: "Hz" },
    ],
  },

  // ---------- Dynamic Effects ----------
  compressor: {
    label: "Compressor",
    icon: Gauge,
    color: "text-orange-400",
    params: [
      { name: "threshold", min: -60, max: 0, step: 1, unit: "dB" },
      { name: "ratio", min: 1, max: 20, step: 0.5 },
      { name: "attack", min: 0.001, max: 1, step: 0.001, unit: "s" },
      { name: "release", min: 0.01, max: 2, step: 0.01, unit: "s" },
      { name: "knee", min: 0, max: 40, step: 1, unit: "dB" },
      { name: "makeup", min: 0, max: 30, step: 0.5, unit: "dB" },
    ],
  },
  limiter: {
    label: "Limiter",
    icon: Shrink,
    color: "text-orange-300",
    params: [
      { name: "threshold", min: -30, max: 0, step: 0.5, unit: "dB" },
      { name: "release", min: 0.01, max: 1, step: 0.01, unit: "s" },
      { name: "knee", min: 0, max: 10, step: 0.5, unit: "dB" },
    ],
  },
  gate: {
    label: "Noise Gate",
    icon: DoorClosed,
    color: "text-yellow-500",
    params: [
      { name: "threshold", min: -80, max: 0, step: 1, unit: "dB" },
      { name: "attack", min: 0.001, max: 0.5, step: 0.001, unit: "s" },
      { name: "release", min: 0.01, max: 2, step: 0.01, unit: "s" },
      { name: "range", min: -80, max: 0, step: 1, unit: "dB" },
    ],
  },
  "de-esser": {
    label: "De-Esser",
    icon: Mic,
    color: "text-yellow-300",
    params: [
      { name: "frequency", min: 2000, max: 12000, step: 100, unit: "Hz" },
      { name: "threshold", min: -40, max: 0, step: 1, unit: "dB" },
      { name: "ratio", min: 1, max: 10, step: 0.5 },
      { name: "range", min: 0, max: 20, step: 0.5, unit: "dB" },
    ],
  },

  // ---------- EQ / Filter Effects ----------
  eq3: {
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
      { name: "highGain", min: -24, max: 24, step: 0.5, unit: "dB" },
    ],
  },
  lowpass: {
    label: "Low-Pass Filter",
    icon: TrendingDown,
    color: "text-indigo-400",
    params: [
      { name: "cutoff", min: 20, max: 20000, step: 10, unit: "Hz" },
      { name: "resonance", min: 0.1, max: 40, step: 0.1 },
      { name: "drive", min: 0, max: 1, step: 0.01 },
      { name: "envAmount", min: 0, max: 1, step: 0.01 },
    ],
  },
  highpass: {
    label: "High-Pass Filter",
    icon: TrendingUp,
    color: "text-violet-400",
    params: [
      { name: "cutoff", min: 20, max: 20000, step: 10, unit: "Hz" },
      { name: "resonance", min: 0.1, max: 40, step: 0.1 },
      { name: "drive", min: 0, max: 1, step: 0.01 },
      { name: "slope", min: 12, max: 48, step: 12, unit: "dB/oct" },
    ],
  },
  bandpass: {
    label: "Band-Pass Filter",
    icon: Filter,
    color: "text-fuchsia-400",
    params: [
      { name: "frequency", min: 20, max: 20000, step: 10, unit: "Hz" },
      { name: "Q", min: 0.1, max: 50, step: 0.1 },
      { name: "gain", min: 0, max: 2, step: 0.01 },
    ],
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
      { name: "type", min: 0, max: 1, step: 1 },
    ],
  },

  // ---------- Distortion Effects ----------
  overdrive: {
    label: "Overdrive",
    icon: Disc,
    color: "text-amber-400",
    params: [
      { name: "drive", min: 0, max: 1, step: 0.01 },
      { name: "tone", min: 0, max: 1, step: 0.01 },
      { name: "level", min: 0, max: 2, step: 0.01 },
      { name: "presence", min: 0, max: 1, step: 0.01 },
      { name: "bite", min: 0, max: 1, step: 0.01 },
    ],
  },
  distortion: {
    label: "Distortion",
    icon: Zap,
    color: "text-orange-500",
    params: [
      { name: "amount", min: 0, max: 1, step: 0.01 },
      { name: "tone", min: 0, max: 1, step: 0.01 },
      { name: "level", min: 0, max: 2, step: 0.01 },
      { name: "scoop", min: 0, max: 1, step: 0.01 },
      { name: "saturation", min: 0, max: 1, step: 0.01 },
    ],
  },
  fuzz: {
    label: "Fuzz",
    icon: Hash,
    color: "text-red-500",
    params: [
      { name: "fuzz", min: 0, max: 1, step: 0.01 },
      { name: "tone", min: 0, max: 1, step: 0.01 },
      { name: "octave", min: 0, max: 1, step: 0.01 },
      { name: "bias", min: 0, max: 1, step: 0.01 },
      { name: "gate", min: 0, max: 1, step: 0.01 },
    ],
  },
  bitcrusher: {
    label: "Bitcrusher",
    icon: Hash,
    color: "text-gray-400",
    params: [
      { name: "bits", min: 1, max: 16, step: 1 },
      { name: "sampleRate", min: 0.01, max: 1, step: 0.01 },
      { name: "crush", min: 0, max: 1, step: 0.01 },
    ],
  },
  "tape-saturation": {
    label: "Tape Saturation",
    icon: Disc,
    color: "text-amber-500",
    params: [
      { name: "drive", min: 0, max: 1, step: 0.01 },
      { name: "warmth", min: 0, max: 1, step: 0.01 },
      { name: "flutter", min: 0, max: 1, step: 0.01 },
      { name: "noise", min: 0, max: 0.5, step: 0.01 },
    ],
  },

  // ---------- Modulation Effects ----------
  tremolo: {
    label: "Tremolo",
    icon: Volume2,
    color: "text-blue-500",
    params: [
      { name: "rate", min: 0.5, max: 25, step: 0.1, unit: "Hz" },
      { name: "depth", min: 0, max: 1, step: 0.01 },
      { name: "shape", min: 0, max: 1, step: 0.01 },
      { name: "phase", min: 0, max: 180, step: 1, unit: "deg" },
    ],
  },
  "auto-pan": {
    label: "Auto-Pan",
    icon: Move,
    color: "text-cyan-500",
    params: [
      { name: "rate", min: 0.1, max: 10, step: 0.1, unit: "Hz" },
      { name: "depth", min: 0, max: 1, step: 0.01 },
      { name: "shape", min: 0, max: 1, step: 0.01 },
    ],
  },
  vibrato: {
    label: "Vibrato",
    icon: Sparkles,
    color: "text-pink-400",
    params: [
      { name: "rate", min: 0.5, max: 15, step: 0.1, unit: "Hz" },
      { name: "depth", min: 0, max: 1, step: 0.01 },
      { name: "pitch", min: 0, max: 50, step: 1, unit: "cents" },
    ],
  },
  "ring-modulator": {
    label: "Ring Modulator",
    icon: Radio,
    color: "text-yellow-400",
    params: [
      { name: "frequency", min: 20, max: 5000, step: 10, unit: "Hz" },
      { name: "mix", min: 0, max: 1, step: 0.01 },
      { name: "octave", min: -2, max: 2, step: 1 },
    ],
  },

  // ---------- Pitch Effects ----------
  "pitch-shifter": {
    label: "Pitch Shifter",
    icon: TrendingUp,
    color: "text-lime-400",
    params: [
      { name: "semitones", min: -24, max: 24, step: 1, unit: "st" },
      { name: "cents", min: -50, max: 50, step: 1, unit: "cents" },
      { name: "window", min: 0.01, max: 0.5, step: 0.01, unit: "s" },
    ],
  },
  octaver: {
    label: "Octaver",
    icon: Music4,
    color: "text-lime-500",
    params: [
      { name: "sub1", min: 0, max: 1, step: 0.01 },
      { name: "sub2", min: 0, max: 1, step: 0.01 },
      { name: "direct", min: 0, max: 1, step: 0.01 },
    ],
  },

  // ---------- Spectral / Special Effects ----------
  granular: {
    label: "Granular",
    icon: Sparkles,
    color: "text-emerald-500",
    params: [
      { name: "grainSize", min: 0.01, max: 0.5, step: 0.01, unit: "s" },
      { name: "density", min: 1, max: 50, step: 1 },
      { name: "spread", min: 0, max: 1, step: 0.01 },
      { name: "pitch", min: -12, max: 12, step: 0.5, unit: "st" },
      { name: "randomness", min: 0, max: 1, step: 0.01 },
    ],
  },
  vocoder: {
    label: "Vocoder",
    icon: BarChart3,
    color: "text-violet-500",
    params: [
      { name: "bands", min: 4, max: 32, step: 1 },
      { name: "attack", min: 0.001, max: 0.5, step: 0.001, unit: "s" },
      { name: "release", min: 0.01, max: 1, step: 0.01, unit: "s" },
      { name: "shift", min: -12, max: 12, step: 1 },
    ],
  },
  "stereo-widener": {
    label: "Stereo Widener",
    icon: Maximize2,
    color: "text-sky-500",
    params: [
      { name: "width", min: 0, max: 2, step: 0.01 },
      { name: "center", min: 0, max: 1, step: 0.01 },
      { name: "sides", min: 0, max: 2, step: 0.01 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Fallback info for unknown types
// ---------------------------------------------------------------------------

const FALLBACK_INFO: EffectMeta = {
  label: "Effect",
  icon: Sliders,
  color: "text-primary",
  params: [],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface EffectModuleNodeProps {
  id: string;
  data: {
    type: string;
    intensity: number;
    mix: number;
    isActive: boolean;
    collapsed: boolean;
    parameters: Record<string, number>;
  };
}

const EffectModuleNode = ({ data, id }: EffectModuleNodeProps) => {
  const { onRemove, onToggleCollapse, onUpdateParameter, onAction, onStart, onStop } = useModuleActions();
  const info = EFFECT_INFO[data.type] ?? FALLBACK_INFO;
  const Icon = info.icon;

  /** Human-readable value for display */
  const fmt = (value: number, step: number, unit?: string) => {
    const display = step >= 1 ? value.toFixed(0) : value.toFixed(2);
    return unit ? `${display} ${unit}` : display;
  };

  return (
    <Card className="min-w-[280px] bg-card/95 backdrop-blur-sm border-border shadow-lg">
      <StereoHandles type="target" position={Position.Left} />

      <div className="p-4 space-y-4">
        {/* --- Header --- */}
        <ModuleHeader
          id={id}
          title={info.label}
          icon={<Icon className={`w-5 h-5 ${info.color}`} />}
          collapsed={data.collapsed}
          onToggleCollapse={onToggleCollapse}
          onRemove={onRemove}
        >
          <Switch
            checked={data.isActive}
            onCheckedChange={(checked) =>
              onUpdateParameter(id, "isActive", checked)
            }
            aria-label={data.isActive ? "Deactivate effect" : "Activate effect"}
          />
        </ModuleHeader>

        {/* --- Sliders (hidden when collapsed) --- */}
        {!data.collapsed && (
          <div className="space-y-3">
            {/* Intensity */}
            <div>
              <Label className="text-xs text-muted-foreground">
                Intensity: {(data.intensity * 100).toFixed(0)}%
              </Label>
              <Slider
                value={[data.intensity]}
                onValueChange={([v]) =>
                  onUpdateParameter(id, "intensity", v)
                }
                min={0}
                max={1}
                step={0.01}
                className="mt-1"
                disabled={!data.isActive}
                aria-label="Intensity"
              />
            </div>

            {/* Mix */}
            <div>
              <Label className="text-xs text-muted-foreground">
                Mix: {(data.mix * 100).toFixed(0)}%
              </Label>
              <Slider
                value={[data.mix]}
                onValueChange={([v]) =>
                  onUpdateParameter(id, "mix", v)
                }
                min={0}
                max={1}
                step={0.01}
                className="mt-1"
                disabled={!data.isActive}
                aria-label="Dry/wet mix"
              />
            </div>

            {/* Dynamic params from EFFECT_INFO */}
            {info.params.map((param) => {
              const value = data.parameters[param.name] ?? param.min;
              return (
                <div key={param.name}>
                  <Label className="text-xs text-muted-foreground capitalize">
                    {param.name.replace(/([A-Z])/g, " $1").trim()}:{" "}
                    {fmt(value, param.step, param.unit)}
                  </Label>
                  <Slider
                    value={[value]}
                    onValueChange={([v]) =>
                      onUpdateParameter(id, param.name, v)
                    }
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    className="mt-1"
                    disabled={!data.isActive}
                    aria-label={param.name}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <StereoHandles type="source" position={Position.Right} />
    </Card>
  );
};

export default EffectModuleNode;
