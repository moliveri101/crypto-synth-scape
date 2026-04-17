import { registerModule } from "../registry";
import { RadioSignalsModule } from "./RadioSignalsModule";
import RadioSignalsModuleNode from "./RadioSignalsModuleNode";

// Each `out-<field>` handle carries one normalized 0..1 value. Downstream
// translators auto-pick the matching field by handle id.
const RADIO_OUTPUTS: Array<{ id: string; label: string }> = [
  { id: "out-all",          label: "ALL" },
  { id: "out-wind_speed",   label: "Wind Speed" },
  { id: "out-wind_density", label: "Density" },
  { id: "out-wind_temp",    label: "Wind Temp" },
  { id: "out-bt",           label: "Bt" },
  { id: "out-bz",           label: "Bz" },
  { id: "out-bz_south",     label: "Bz South" },
  { id: "out-kp",           label: "Kp" },
  { id: "out-xray_flux",    label: "X-ray" },
  { id: "out-f107",         label: "F10.7" },
];

registerModule({
  type: "radio-signals",
  category: "source",
  label: "Radio Signals",
  hasInput: false,
  hasOutput: true,
  outputHandles: () => RADIO_OUTPUTS,
  defaultData: () => ({ volume: 0.4 }),
  createAudio: (ctx, data) => {
    const m = new RadioSignalsModule(ctx);
    if (typeof data.volume === "number") m.setParameter("volume", data.volume);
    return m;
  },
  component: RadioSignalsModuleNode,
});
