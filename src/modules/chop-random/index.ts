import { registerModule } from "../registry";
import { RandomModule, RANDOM_KNOBS } from "./RandomModule";
import RandomNode from "./RandomNode";

const RANDOM_INPUTS: Array<{ id: string; label: string }> = RANDOM_KNOBS.map((k) => ({
  id: "in-" + k,
  label: k,
}));

registerModule({
  type: "chop-random",
  category: "source",
  label: "Random",
  hasInput: true,
  hasOutput: true,
  inputHandles: () => RANDOM_INPUTS,
  defaultData: () => ({
    rate: 0.3,
    smooth: 0,
    min: 0,
    max: 1,
  }),
  createAudio: (ctx, data) => {
    const m = new RandomModule(ctx);
    for (const k of RANDOM_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    return m;
  },
  component: RandomNode,
});
