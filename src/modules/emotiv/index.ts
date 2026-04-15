import { registerModule } from "../registry";
import { EmotivModule, EMOTIV_CHANNELS, EMOTIV_BANDS } from "./EmotivModule";
import EmotivModuleNode from "./EmotivModuleNode";

// Per-electrode and per-band output handles. Channel labels use the 10-20
// electrode names (AF3, F7, etc.); band labels use Greek-letter shorthand.
const EMOTIV_OUTPUTS: Array<{ id: string; label: string }> = [
  { id: "out-all", label: "ALL" },
  ...EMOTIV_CHANNELS.map((c) => ({ id: `out-${c}`, label: c })),
  ...EMOTIV_BANDS.map((b) => ({ id: `out-band_${b}`, label: b })),
  { id: "out-quality", label: "Quality" },
];

registerModule({
  type: "emotiv",
  category: "source",
  label: "Emotiv EEG (14-ch)",
  hasInput: false,
  hasOutput: true,
  outputHandles: () => EMOTIV_OUTPUTS,
  defaultData: () => ({
    mode: "simulated" as const,
    clientId: "",
    clientSecret: "",
  }),
  createAudio: (ctx, data) => {
    const m = new EmotivModule(ctx);
    if (data.mode) m.setParameter("mode", data.mode);
    if (data.clientId) m.setParameter("clientId", data.clientId);
    if (data.clientSecret) m.setParameter("clientSecret", data.clientSecret);
    return m;
  },
  component: EmotivModuleNode,
});
