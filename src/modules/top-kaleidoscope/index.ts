import { registerModule } from "../registry";
import { KaleidoscopeModule, KALEIDO_KNOBS } from "./KaleidoscopeModule";
import KaleidoscopeNode from "./KaleidoscopeNode";

const INPUTS: Array<{ id: string; label: string }> = KALEIDO_KNOBS.map((k) => ({
  id: "in-" + k, label: k,
}));

registerModule({
  type: "top-kaleidoscope",
  category: "output",
  label: "Kaleidoscope",
  hasInput: true,
  hasOutput: false,
  inputHandles: () => INPUTS,
  defaultData: () => ({
    segments: 0.35, rotation: 0, zoom: 0.3, offsetX: 0.5, offsetY: 0.5,
  }),
  createAudio: (ctx, data) => {
    const m = new KaleidoscopeModule(ctx);
    for (const k of KALEIDO_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    return m;
  },
  component: KaleidoscopeNode,
});
