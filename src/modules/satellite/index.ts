import { registerModule } from "../registry";
import { SatelliteModule } from "./SatelliteModule";
import SatelliteModuleNode from "./SatelliteModuleNode";

registerModule({
  type: "satellite",
  category: "source",
  label: "Satellite",
  hasInput: false,
  hasOutput: true,
  defaultData: (extra) => ({
    satellite: extra?.satellite ?? null,
    volume: 0.5,
    waveform: "sine" as OscillatorType,
    speed: 0,
    altitude: 0,
    latitude: 0,
    longitude: 0,
  }),
  createAudio: (ctx, data) => {
    const m = new SatelliteModule(ctx);
    if (data.satellite) m.setSatellite(data.satellite);
    return m;
  },
  component: SatelliteModuleNode,
});
