import { registerModule } from "../registry";
import { SequenceModule, SEQ_STEPS } from "./SequenceModule";
import SequenceNode from "./SequenceNode";

registerModule({
  type: "chop-sequence",
  category: "source",
  label: "Sequence",
  hasInput: true,
  hasOutput: true,
  inputHandles: () => [
    { id: "in-trigger", label: "Trigger" },
    { id: "in-reset",   label: "Reset" },
  ],
  defaultData: () => {
    const defaults: Record<string, number> = {};
    const seed = [0.2, 0.4, 0.3, 0.7, 0.5, 0.9, 0.4, 0.6];
    for (let i = 0; i < SEQ_STEPS; i++) defaults[`step${i}`] = seed[i];
    return defaults;
  },
  createAudio: (ctx, data) => {
    const m = new SequenceModule(ctx);
    for (let i = 0; i < SEQ_STEPS; i++) {
      const v = data[`step${i}`];
      if (typeof v === "number") m.setParameter(`step${i}`, v);
    }
    return m;
  },
  component: SequenceNode,
});
