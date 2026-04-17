import { registerModule } from "../registry";
import { SwitchModule } from "./SwitchModule";
import SwitchNode from "./SwitchNode";

registerModule({
  type: "util-switch",
  category: "processor",
  label: "Switch",
  hasInput: true,
  hasOutput: true,
  inputHandles: () => [
    { id: "in-a",      label: "A" },
    { id: "in-b",      label: "B" },
    { id: "in-select", label: "Select" },
    { id: "in-smooth", label: "Smooth" },
  ],
  defaultData: () => ({ smooth: 0 }),
  createAudio: (ctx, data) => {
    const m = new SwitchModule(ctx);
    if (typeof data.smooth === "number") m.setParameter("smooth", data.smooth);
    return m;
  },
  component: SwitchNode,
});
