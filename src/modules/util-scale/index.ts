import { registerModule } from "../registry";
import { ScaleModule, SCALE_KNOBS } from "./ScaleModule";
import ScaleNode from "./ScaleNode";

const SCALE_INPUTS: Array<{ id: string; label: string }> = [
  { id: "in-signal", label: "Signal" },
  ...SCALE_KNOBS.map((k) => ({ id: "in-" + k, label: k })),
];

registerModule({
  type: "util-scale",
  category: "processor",
  label: "Scale",
  hasInput: true,
  hasOutput: true,
  inputHandles: () => SCALE_INPUTS,
  defaultData: () => ({ outMin: 0, outMax: 1, curve: 0.5, invert: false }),
  createAudio: (ctx, data) => {
    const m = new ScaleModule(ctx);
    for (const k of SCALE_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    if (typeof data.invert === "boolean") m.setParameter("invert", data.invert);
    return m;
  },
  component: ScaleNode,
});
