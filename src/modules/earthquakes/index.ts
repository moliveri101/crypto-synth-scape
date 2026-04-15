import { registerModule } from "../registry";
import { EarthquakesModule } from "./EarthquakesModule";
import EarthquakesModuleNode from "./EarthquakesModuleNode";

registerModule({
  type: "earthquakes",
  category: "source",
  label: "Earthquakes",
  hasInput: false,
  hasOutput: true,
  defaultData: () => ({
    window: "hour" as const,
    minMagnitude: 2.5,
  }),
  createAudio: (ctx, data) => {
    const m = new EarthquakesModule(ctx);
    if (data.window) m.setParameter("window", data.window);
    if (typeof data.minMagnitude === "number") m.setParameter("minMagnitude", data.minMagnitude);
    return m;
  },
  component: EarthquakesModuleNode,
});
