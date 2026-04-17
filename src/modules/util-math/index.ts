import { registerModule } from "../registry";
import { MathModule } from "./MathModule";
import MathNode from "./MathNode";

registerModule({
  type: "util-math",
  category: "processor",
  label: "Math",
  hasInput: true,
  hasOutput: true,
  inputHandles: () => [
    { id: "in-a", label: "A" },
    { id: "in-b", label: "B" },
  ],
  defaultData: () => ({ op: "add" }),
  createAudio: (ctx, data) => {
    const m = new MathModule(ctx);
    if (data.op) m.setParameter("op", data.op);
    return m;
  },
  component: MathNode,
});
