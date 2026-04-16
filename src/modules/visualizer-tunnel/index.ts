import { registerModule } from "../registry";
import { TunnelModule, TUNNEL_KNOBS } from "./TunnelModule";
import TunnelNode from "./TunnelNode";

const TUNNEL_INPUTS: Array<{ id: string; label: string }> = TUNNEL_KNOBS.map((k) => ({
  id: "in-" + k,
  label: k,
}));

registerModule({
  type: "visualizer-tunnel",
  category: "output",
  label: "Tunnel",
  hasInput: true,
  hasOutput: false,
  inputHandles: () => TUNNEL_INPUTS,
  defaultData: () => ({
    speed: 0.5,
    twist: 0.2,
    rings: 0.4,
    stripes: 0.5,
    warp: 0.15,
    flare: 0.5,
    color: 0.65,
    contrast: 0.6,
  }),
  createAudio: (ctx, data) => {
    const m = new TunnelModule(ctx);
    for (const k of TUNNEL_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    return m;
  },
  component: TunnelNode,
});
