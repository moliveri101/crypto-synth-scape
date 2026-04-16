import { registerModule } from "../registry";
import { StarfieldModule, STARFIELD_KNOBS } from "./StarfieldModule";
import StarfieldNode from "./StarfieldNode";

const STARFIELD_INPUTS: Array<{ id: string; label: string }> = STARFIELD_KNOBS.map((k) => ({
  id: "in-" + k,
  label: k,
}));

registerModule({
  type: "visualizer-starfield",
  category: "output",
  label: "Starfield",
  hasInput: true,
  hasOutput: false,
  inputHandles: () => STARFIELD_INPUTS,
  defaultData: () => ({
    count: 250,
    speed: 1.5,
    warp: 0.3,
    spread: 0.8,
    rotation: 0.1,
    twinkle: 0.4,
    color: 0.6,
    brightness: 0.8,
  }),
  createAudio: (ctx, data) => {
    const m = new StarfieldModule(ctx);
    for (const k of STARFIELD_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    return m;
  },
  component: StarfieldNode,
});
