import { registerModule } from "../registry";
import { StrobeModule, STROBE_KNOBS } from "./StrobeModule";
import StrobeNode from "./StrobeNode";

const STROBE_INPUTS: Array<{ id: string; label: string }> = STROBE_KNOBS.map((k) => ({
  id: "in-" + k,
  label: k,
}));

registerModule({
  type: "visualizer-strobe",
  category: "output",
  label: "Strobe",
  hasInput: true,
  hasOutput: false,
  inputHandles: () => STROBE_INPUTS,
  defaultData: () => ({
    rate: 0.15,
    duty: 0.15,
    intensity: 0.9,
    hue: 0,
    colorCycle: 0.2,
    jitter: 0,
    trigger: 0,
    pattern: "solid" as const,
    envelope: "square" as const,
  }),
  createAudio: (ctx, data) => {
    const m = new StrobeModule(ctx);
    for (const k of STROBE_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    if (data.pattern) m.setParameter("pattern", data.pattern);
    if (data.envelope) m.setParameter("envelope", data.envelope);
    return m;
  },
  component: StrobeNode,
});
