import { registerModule } from "../registry";
import { ParticlesModule, PARTICLES_KNOBS } from "./ParticlesModule";
import ParticlesNode from "./ParticlesNode";

const PARTICLES_INPUTS: Array<{ id: string; label: string }> = PARTICLES_KNOBS.map((k) => ({
  id: "in-" + k,
  label: k,
}));

registerModule({
  type: "visualizer-particles",
  category: "output",
  label: "Particles",
  hasInput: true,
  hasOutput: false,
  inputHandles: () => PARTICLES_INPUTS,
  defaultData: () => ({
    count: 150,
    speed: 1.0,
    gravity: 0.3,
    turbulence: 0.4,
    trail: 0.7,
    size: 2.5,
    color: 0.5,
    spread: 0.6,
  }),
  createAudio: (ctx, data) => {
    const m = new ParticlesModule(ctx);
    for (const k of PARTICLES_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    return m;
  },
  component: ParticlesNode,
});
