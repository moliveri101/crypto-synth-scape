import { registerModule } from "../registry";
import { PeakModule, PEAK_KNOBS } from "./PeakModule";
import PeakNode from "./PeakNode";

const PEAK_INPUTS: Array<{ id: string; label: string }> = [
  { id: "in-signal", label: "Signal" },
  ...PEAK_KNOBS.map((k) => ({ id: "in-" + k, label: k })),
];

registerModule({
  type: "util-peak",
  category: "processor",
  label: "Peak",
  hasInput: true,
  hasOutput: true,
  inputHandles: () => PEAK_INPUTS,
  defaultData: () => ({ attack: 0.05, release: 0.6 }),
  createAudio: (ctx, data) => {
    const m = new PeakModule(ctx);
    for (const k of PEAK_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    return m;
  },
  component: PeakNode,
});
