import { registerModule } from "../registry";
import { CounterModule } from "./CounterModule";
import CounterNode from "./CounterNode";

registerModule({
  type: "chop-counter",
  category: "source",
  label: "Counter",
  hasInput: true,
  hasOutput: true,
  inputHandles: () => [
    { id: "in-trigger", label: "Trigger" },
    { id: "in-steps",   label: "Steps" },
    { id: "in-reset",   label: "Reset" },
  ],
  defaultData: () => ({ steps: 0.25 }),
  createAudio: (ctx, data) => {
    const m = new CounterModule(ctx);
    if (typeof data.steps === "number") m.setParameter("steps", data.steps);
    return m;
  },
  component: CounterNode,
});
