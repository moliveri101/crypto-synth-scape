import { registerModule } from "../registry";
import { NoiseModule, NOISE_KNOBS } from "./NoiseModule";
import NoiseNode from "./NoiseNode";

const NOISE_INPUTS: Array<{ id: string; label: string }> = NOISE_KNOBS.map((k) => ({
  id: "in-" + k,
  label: k,
}));

registerModule({
  type: "chop-noise",
  category: "source",
  label: "Noise",
  hasInput: true,
  hasOutput: true,
  inputHandles: () => NOISE_INPUTS,
  defaultData: () => ({
    speed: 0.3,
    detail: 0.4,
    bias: 0.5,
    amp: 0.5,
  }),
  createAudio: (ctx, data) => {
    const m = new NoiseModule(ctx);
    for (const k of NOISE_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    return m;
  },
  component: NoiseNode,
});
