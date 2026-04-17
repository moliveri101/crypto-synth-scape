import { registerModule } from "../registry";
import { EnvelopeModule, ENV_KNOBS } from "./EnvelopeModule";
import EnvelopeNode from "./EnvelopeNode";

// Channel 0 is the trigger; channels 1..4 are A/D/S/R knobs.
const ENV_INPUTS: Array<{ id: string; label: string }> = [
  { id: "in-trigger", label: "Trigger" },
  ...ENV_KNOBS.map((k) => ({ id: "in-" + k, label: k })),
];

registerModule({
  type: "chop-envelope",
  category: "source",
  label: "Envelope",
  hasInput: true,
  hasOutput: true,
  inputHandles: () => ENV_INPUTS,
  defaultData: () => ({
    attack: 0.1, decay: 0.25, sustain: 0.6, release: 0.4,
  }),
  createAudio: (ctx, data) => {
    const m = new EnvelopeModule(ctx);
    for (const k of ENV_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    return m;
  },
  component: EnvelopeNode,
});
