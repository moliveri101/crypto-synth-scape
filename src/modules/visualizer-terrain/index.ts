import { registerModule } from "../registry";
import { TerrainModule, TERRAIN_KNOBS } from "./TerrainModule";
import TerrainNode from "./TerrainNode";

const TERRAIN_INPUTS: Array<{ id: string; label: string }> = TERRAIN_KNOBS.map((k) => ({
  id: "in-" + k,
  label: k,
}));

registerModule({
  type: "visualizer-terrain",
  category: "output",
  label: "Terrain",
  hasInput: true,
  hasOutput: false,
  inputHandles: () => TERRAIN_INPUTS,
  defaultData: () => ({
    ch1: 0, ch2: 0, ch3: 0, ch4: 0, ch5: 0, ch6: 0,
    amplitude: 0.5,
    depth: 0.5,
    scroll: 0.5,
    fill: 0.5,
    color: 0.3,
    glow: 0.5,
  }),
  createAudio: (ctx, data) => {
    const m = new TerrainModule(ctx);
    for (const k of TERRAIN_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    return m;
  },
  component: TerrainNode,
});
