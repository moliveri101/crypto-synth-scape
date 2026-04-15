import { registerModule } from "../registry";
import { PulseTranslator } from "./PulseTranslator";
import PulseTranslatorNode from "./PulseTranslatorNode";

registerModule({
  type: "pulse-translator",
  category: "processor",
  label: "Pulse Translator",
  hasInput: true,
  hasOutput: true,
  defaultData: () => ({
    field: null as string | null,
    mode: "threshold" as const,
    threshold: 0.5,
    delta: 0.1,
    maxRate: 8,
    pitch: 100,
    decay: 0.1,
    volume: 0.7,
  }),
  createAudio: (ctx, data) => {
    const m = new PulseTranslator(ctx);
    if (data.field) m.setParameter("field", data.field);
    if (data.mode) m.setParameter("mode", data.mode);
    if (typeof data.threshold === "number") m.setParameter("threshold", data.threshold);
    if (typeof data.delta === "number") m.setParameter("delta", data.delta);
    if (typeof data.maxRate === "number") m.setParameter("maxRate", data.maxRate);
    if (typeof data.pitch === "number") m.setParameter("pitch", data.pitch);
    if (typeof data.decay === "number") m.setParameter("decay", data.decay);
    if (typeof data.volume === "number") m.setParameter("volume", data.volume);
    return m;
  },
  component: PulseTranslatorNode,
});
