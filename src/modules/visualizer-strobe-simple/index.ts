import { registerModule } from "../registry";
import { SimpleStrobeModule, SIMPLE_STROBE_KNOBS } from "./SimpleStrobeModule";
import SimpleStrobeNode from "./SimpleStrobeNode";

const SIMPLE_STROBE_INPUTS: Array<{ id: string; label: string }> = SIMPLE_STROBE_KNOBS.map((k) => ({
  id: "in-" + k,
  label: k,
}));

registerModule({
  type: "visualizer-strobe-simple",
  category: "output",
  label: "Simple Strobe",
  hasInput: true,
  hasOutput: false,
  inputHandles: () => SIMPLE_STROBE_INPUTS,
  defaultData: () => ({
    speed: 0.2,
    density: 0.2,
  }),
  createAudio: (ctx, data) => {
    const m = new SimpleStrobeModule(ctx);
    for (const k of SIMPLE_STROBE_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    return m;
  },
  component: SimpleStrobeNode,
});
