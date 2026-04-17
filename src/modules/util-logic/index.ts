import { registerModule } from "../registry";
import { LogicModule } from "./LogicModule";
import LogicNode from "./LogicNode";

registerModule({
  type: "util-logic",
  category: "processor",
  label: "Logic",
  hasInput: true,
  hasOutput: true,
  inputHandles: () => [
    { id: "in-a", label: "A" },
    { id: "in-b", label: "B" },
  ],
  defaultData: () => ({ op: "and" }),
  createAudio: (ctx, data) => {
    const m = new LogicModule(ctx);
    if (data.op) m.setParameter("op", data.op);
    return m;
  },
  component: LogicNode,
});
