import { registerModule } from "../registry";
import { ShaderToyModule, SHADER_KNOBS } from "./ShaderToyModule";
import ShaderToyNode from "./ShaderToyNode";

const SHADER_INPUTS: Array<{ id: string; label: string }> = SHADER_KNOBS.map((k) => ({
  id: "in-" + k,
  label: k,
}));

registerModule({
  type: "visualizer-shadertoy",
  category: "output",
  label: "Shader Toy",
  hasInput: true,
  hasOutput: false,
  inputHandles: () => SHADER_INPUTS,
  defaultData: () => ({
    speed: 0.5, zoom: 0.5, warp: 0.4,
    intensity: 0.7, color: 0.4, detail: 0.5,
    preset: "plasma",
  }),
  createAudio: (ctx, data) => {
    const m = new ShaderToyModule(ctx);
    for (const k of SHADER_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    if (data.preset) m.setParameter("preset", data.preset);
    return m;
  },
  component: ShaderToyNode,
});
