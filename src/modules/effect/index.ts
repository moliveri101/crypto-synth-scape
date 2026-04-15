import { registerModule } from "../registry";
import { EffectModule, EFFECT_TYPES } from "./EffectModule";
import EffectModuleNode from "./EffectModuleNode";

const EFFECT_LABELS: Record<string, string> = {
  lowpass: "Low Pass",
  highpass: "High Pass",
  bandpass: "Band Pass",
  notch: "Notch",
  allpass: "All Pass",
  peaking: "Peaking EQ",
  lowshelf: "Low Shelf",
  highshelf: "High Shelf",
  delay: "Delay",
  "ping-pong-delay": "Ping Pong Delay",
  reverb: "Reverb",
  chorus: "Chorus",
  flanger: "Flanger",
  phaser: "Phaser",
  tremolo: "Tremolo",
  vibrato: "Vibrato",
  distortion: "Distortion",
  overdrive: "Overdrive",
  bitcrusher: "Bitcrusher",
  compressor: "Compressor",
  gate: "Gate",
  limiter: "Limiter",
  eq3: "3-Band EQ",
  "stereo-widener": "Stereo Widener",
  "auto-pan": "Auto Pan",
  "ring-modulator": "Ring Modulator",
  "frequency-shifter": "Frequency Shifter",
  "pitch-shifter": "Pitch Shifter",
  wavefolder: "Wavefolder",
};

for (const effectType of EFFECT_TYPES) {
  registerModule({
    type: effectType,
    category: "effect",
    label: EFFECT_LABELS[effectType] ?? effectType,
    hasInput: true,
    hasOutput: true,
    defaultData: () => ({
      intensity: 0.5,
      mix: 0.5,
      isActive: true,
      parameters: {},
    }),
    createAudio: (ctx) => new EffectModule(ctx, effectType),
    component: EffectModuleNode,
  });
}
