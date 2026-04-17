import { registerModule } from "../registry";
import { PlasmaModule, PLASMA_KNOBS } from "./PlasmaModule";
import PlasmaNode from "./PlasmaNode";

const INPUTS: Array<{ id: string; label: string }> = PLASMA_KNOBS.map((k) => ({
  id: "in-" + k, label: k,
}));

registerModule({
  type: "top-plasma",
  category: "output",
  label: "Plasma",
  hasInput: true,
  hasOutput: false,
  inputHandles: () => INPUTS,
  defaultData: () => ({
    speed: 0.3, scale: 0.4, palette: 0.6, spread: 0.5, brightness: 0.55,
  }),
  createAudio: (ctx, data) => {
    const m = new PlasmaModule(ctx);
    for (const k of PLASMA_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    return m;
  },
  component: PlasmaNode,
});
