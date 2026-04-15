import { registerModule } from "../registry";
import { WeatherModule } from "./WeatherModule";
import WeatherModuleNode from "./WeatherModuleNode";

const WEATHER_OUTPUTS: Array<{ id: string; label: string }> = [
  { id: "out-all",           label: "ALL" },
  { id: "out-temperature",   label: "Temp" },
  { id: "out-humidity",      label: "Humidity" },
  { id: "out-wind",          label: "Wind" },
  { id: "out-pressure",      label: "Pressure" },
  { id: "out-clouds",        label: "Clouds" },
  { id: "out-precipitation", label: "Precip" },
];

registerModule({
  type: "weather",
  category: "source",
  label: "Weather",
  hasInput: false,
  hasOutput: true,
  outputHandles: () => WEATHER_OUTPUTS,
  defaultData: () => ({
    locationName: "London, UK",
    latitude: 51.5074,
    longitude: -0.1278,
    audioEnabled: false,
  }),
  createAudio: (ctx, data) => {
    const m = new WeatherModule(ctx);
    if (typeof data.latitude === "number" && typeof data.longitude === "number") {
      m.setParameter("location", {
        name: data.locationName ?? "Custom",
        latitude: data.latitude,
        longitude: data.longitude,
      });
    }
    if (data.audioEnabled) m.setParameter("audioEnabled", true);
    return m;
  },
  component: WeatherModuleNode,
});
