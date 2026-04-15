import { registerModule } from "../registry";
import { VisualizerModule, VISUALIZER_KNOBS } from "./VisualizerModule";
import VisualizerNode from "./VisualizerNode";

const VISUALIZER_INPUTS: Array<{ id: string; label: string }> = VISUALIZER_KNOBS.map((k) => ({
  id: `in-${k}`,
  label: k,
}));

registerModule({
  type: "visualizer",
  category: "output",
  label: "Fractal Visualizer",
  hasInput: true,
  hasOutput: false,
  inputHandles: () => VISUALIZER_INPUTS,
  defaultData: () => ({
    shapeX: -0.7,
    shapeY: 0.27015,
    zoom: 1.0,
    rotation: 0,
    color: 0,
    detail: 96,
  }),
  createAudio: (ctx, data) => {
    const m = new VisualizerModule(ctx);
    for (const k of VISUALIZER_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    return m;
  },
  component: VisualizerNode,
});
