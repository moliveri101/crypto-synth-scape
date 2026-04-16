import { registerModule } from "../registry";
import { MandelbulbModule, MANDELBULB_KNOBS } from "./MandelbulbModule";
import MandelbulbNode from "./MandelbulbNode";

const MANDELBULB_INPUTS: Array<{ id: string; label: string }> = MANDELBULB_KNOBS.map((k) => ({
  id: `in-${k}`,
  label: k,
}));

registerModule({
  type: "visualizer-mandelbulb",
  category: "output",
  label: "Mandelbulb 3D",
  hasInput: true,
  hasOutput: false,
  inputHandles: () => MANDELBULB_INPUTS,
  defaultData: () => ({
    power: 8.0,
    iterations: 7,
    fold: 0,
    mirror: 1,
    copies: 1,
    spacing: 2.0,
    merge: 0.3,
    rotX: 0,
    rotY: 0.2,
    zoom: 3.0,
    color: 0,
    glow: 0.5,
  }),
  createAudio: (ctx, data) => {
    const m = new MandelbulbModule(ctx);
    for (const k of MANDELBULB_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    return m;
  },
  component: MandelbulbNode,
});
