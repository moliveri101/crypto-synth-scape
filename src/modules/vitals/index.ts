import { registerModule } from "../registry";
import { VitalsModule } from "./VitalsModule";
import VitalsModuleNode from "./VitalsModuleNode";

// Per-vital output handles. Each handle id `out-<field>` carries only that
// single normalized value when patched into a downstream consumer.
const VITAL_OUTPUTS: Array<{ id: string; label: string }> = [
  { id: "out-all",         label: "ALL" },
  { id: "out-heart_rate",  label: "HR" },
  { id: "out-hrv",         label: "HRV" },
  { id: "out-breathing",   label: "Breath" },
  { id: "out-temperature", label: "Temp" },
  { id: "out-spo2",        label: "SpO₂" },
  { id: "out-stress",      label: "Stress" },
  { id: "out-recovery",    label: "Recov" },
  { id: "out-activity",    label: "Activity" },
];

registerModule({
  type: "vitals",
  category: "source",
  label: "Vitals (Hume Health)",
  hasInput: false,
  hasOutput: true,
  outputHandles: () => VITAL_OUTPUTS,
  defaultData: () => ({
    activityLevel: "resting" as const,
    apiKey: "",
  }),
  createAudio: (ctx, data) => {
    const m = new VitalsModule(ctx);
    if (data.activityLevel) m.setParameter("activityLevel", data.activityLevel);
    return m;
  },
  component: VitalsModuleNode,
});
