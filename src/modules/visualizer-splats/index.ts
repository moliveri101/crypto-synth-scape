import { registerModule } from "../registry";
import { SplatsModule, SPLATS_KNOBS } from "./SplatsModule";
import SplatsNode from "./SplatsNode";

const SPLATS_INPUTS: Array<{ id: string; label: string }> = SPLATS_KNOBS.map((k) => ({
  id: "in-" + k,
  label: k,
}));

registerModule({
  type: "visualizer-splats",
  category: "output",
  label: "Video Splats",
  hasInput: true,
  hasOutput: false,
  inputHandles: () => SPLATS_INPUTS,
  defaultData: () => ({
    // Default to a pristine passthrough — the user sees themselves clearly
    // in the webcam feed, then dials Clean down to reveal the splat effect.
    clean: 1.0,
    density: 0.4,
    size: 0.5,
    brightness: 0.8,
    saturation: 1.0,
    jitter: 0.1,
    hue: 0,
    trail: 0.3,
    warp: 0.05,
  }),
  createAudio: (ctx, data) => {
    const m = new SplatsModule(ctx);
    for (const k of SPLATS_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    return m;
  },
  component: SplatsNode,
});
