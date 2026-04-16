import { registerModule } from "../registry";
import { NetworkModule, NETWORK_KNOBS } from "./NetworkModule";
import NetworkNode from "./NetworkNode";

const NETWORK_INPUTS: Array<{ id: string; label: string }> = NETWORK_KNOBS.map((k) => ({
  id: "in-" + k,
  label: k,
}));

registerModule({
  type: "visualizer-network",
  category: "output",
  label: "Network Graph",
  hasInput: true,
  hasOutput: false,
  inputHandles: () => NETWORK_INPUTS,
  defaultData: () => ({
    node1: 0, node2: 0, node3: 0, node4: 0,
    node5: 0, node6: 0, node7: 0, node8: 0,
    decay: 0.5,
    connections: 0.3,
    color: 0.55,
    glow: 0.6,
  }),
  createAudio: (ctx, data) => {
    const m = new NetworkModule(ctx);
    for (const k of NETWORK_KNOBS) {
      if (typeof data[k] === "number") m.setParameter(k, data[k]);
    }
    return m;
  },
  component: NetworkNode,
});
