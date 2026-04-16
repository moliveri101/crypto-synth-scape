import { registerModule } from "../registry";
import { PreampModule, PREAMP_KNOBS } from "./PreampModule";
import PreampNode from "./PreampNode";

// Input handle list — must match PreampModule.INPUT_HANDLE_IDS indexing.
// Indexes 0 and 1 are the L and R audio inputs; indexes 2..8 are per-knob
// modulation inputs.
const PREAMP_INPUTS: Array<{ id: string; label: string }> = [
  { id: "in-audio-L", label: "Audio L" },
  { id: "in-audio-R", label: "Audio R" },
  ...PREAMP_KNOBS.map((k) => ({ id: "in-" + k, label: k })),
];

registerModule({
  type: "preamp",
  // "processor" so the hook stores its knob values directly on `data` (like
  // mixers and translators). "effect" would route them through a nested
  // `data.parameters` map that the Preamp UI doesn't read from.
  category: "processor",
  label: "Preamp",
  hasInput: true,
  hasOutput: true,
  inputHandles: () => PREAMP_INPUTS,
  defaultData: () => ({
    gain: 6,      // dB
    drive: 0.2,   // 0..1
    body: 0,      // dB
    presence: 0,  // dB
    width: 0.4,   // 0..1 stereo spread
    output: 0,    // dB
    mix: 1.0,     // 0..1
  }),
  createAudio: (ctx, data) => {
    const m = new PreampModule(ctx);
    for (const k of PREAMP_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    return m;
  },
  component: PreampNode,
});
