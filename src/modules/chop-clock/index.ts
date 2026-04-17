import { registerModule } from "../registry";
import { ClockModule, CLOCK_KNOBS } from "./ClockModule";
import ClockNode from "./ClockNode";

const CLOCK_INPUTS: Array<{ id: string; label: string }> = CLOCK_KNOBS.map((k) => ({
  id: "in-" + k,
  label: k,
}));

registerModule({
  type: "chop-clock",
  category: "source",
  label: "Clock",
  hasInput: true,
  hasOutput: true,
  inputHandles: () => CLOCK_INPUTS,
  defaultData: () => ({
    bpm: 0.37,
    gateLen: 0.1,
    swing: 0,
    division: "1/4",
  }),
  createAudio: (ctx, data) => {
    const m = new ClockModule(ctx);
    for (const k of CLOCK_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    if (data.division) m.setParameter("division", data.division);
    return m;
  },
  component: ClockNode,
});
