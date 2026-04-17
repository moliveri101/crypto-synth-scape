import { registerModule } from "../registry";
import { FeedbackModule, FEEDBACK_KNOBS } from "./FeedbackModule";
import FeedbackNode from "./FeedbackNode";

const INPUTS: Array<{ id: string; label: string }> = FEEDBACK_KNOBS.map((k) => ({
  id: "in-" + k, label: k,
}));

registerModule({
  type: "top-feedback",
  category: "output",
  label: "Feedback",
  hasInput: true,
  hasOutput: false,
  inputHandles: () => INPUTS,
  defaultData: () => ({
    shapeX: 0.5, shapeY: 0.5, size: 0.2, hue: 0.5,
    feedback: 0.92, zoom: 0.52, rotation: 0.52,
  }),
  createAudio: (ctx, data) => {
    const m = new FeedbackModule(ctx);
    for (const k of FEEDBACK_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    return m;
  },
  component: FeedbackNode,
});
