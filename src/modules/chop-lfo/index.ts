import { registerModule } from "../registry";
import { LfoModule, LFO_KNOBS } from "./LfoModule";
import LfoNode from "./LfoNode";

const LFO_INPUTS: Array<{ id: string; label: string }> = LFO_KNOBS.map((k) => ({
  id: "in-" + k,
  label: k,
}));

registerModule({
  type: "chop-lfo",
  category: "source",
  label: "LFO",
  hasInput: true,
  hasOutput: true,
  inputHandles: () => LFO_INPUTS,
  defaultData: () => ({
    frequency: 0.3,
    amplitude: 0.5,
    bias: 0.5,
    phase: 0,
    waveform: "sine" as const,
  }),
  createAudio: (ctx, data) => {
    const m = new LfoModule(ctx);
    for (const k of LFO_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    if (data.waveform) m.setParameter("waveform", data.waveform);
    return m;
  },
  component: LfoNode,
});
