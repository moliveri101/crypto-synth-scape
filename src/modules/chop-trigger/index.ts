import { registerModule } from "../registry";
import { TriggerModule, TRIGGER_KNOBS } from "./TriggerModule";
import TriggerNode from "./TriggerNode";

const TRIGGER_INPUTS: Array<{ id: string; label: string }> = [
  { id: "in-signal", label: "Signal" },
  ...TRIGGER_KNOBS.map((k) => ({ id: "in-" + k, label: k })),
];

registerModule({
  type: "chop-trigger",
  category: "source",
  label: "Trigger",
  hasInput: true,
  hasOutput: true,
  inputHandles: () => TRIGGER_INPUTS,
  defaultData: () => ({ threshold: 0.5, length: 0.1 }),
  createAudio: (ctx, data) => {
    const m = new TriggerModule(ctx);
    for (const k of TRIGGER_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    return m;
  },
  component: TriggerNode,
});
