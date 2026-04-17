import { registerModule } from "../registry";
import { LagModule } from "./LagModule";
import LagNode from "./LagNode";

registerModule({
  type: "util-lag",
  category: "processor",
  label: "Lag",
  hasInput: true,
  hasOutput: true,
  inputHandles: () => [
    { id: "in-signal", label: "Signal" },
    { id: "in-time",   label: "Time" },
  ],
  defaultData: () => ({ time: 0.3 }),
  createAudio: (ctx, data) => {
    const m = new LagModule(ctx);
    if (typeof data.time === "number") m.setParameter("time", data.time);
    return m;
  },
  component: LagNode,
});
