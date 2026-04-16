import { registerModule } from "../registry";
import { LissajousModule, LISSAJOUS_KNOBS } from "./LissajousModule";
import LissajousNode from "./LissajousNode";

const LISSAJOUS_INPUTS: Array<{ id: string; label: string }> = LISSAJOUS_KNOBS.map((k) => ({
  id: "in-" + k,
  label: k,
}));

registerModule({
  type: "visualizer-lissajous",
  category: "output",
  label: "Lissajous",
  hasInput: true,
  hasOutput: false,
  inputHandles: () => LISSAJOUS_INPUTS,
  defaultData: () => ({
    freqX: 3,
    freqY: 2,
    phase: 0,
    speed: 1.0,
    density: 800,
    thickness: 1.5,
    trail: 0.85,
    color: 0.55,
  }),
  createAudio: (ctx, data) => {
    const m = new LissajousModule(ctx);
    for (const k of LISSAJOUS_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    return m;
  },
  component: LissajousNode,
});
