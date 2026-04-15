import { registerModule } from "../registry";
import { SamplerModule } from "./SamplerModule";
import SamplerModuleNode from "./SamplerModuleNode";

registerModule({
  type: "sampler",
  category: "source",
  label: "Sampler",
  hasInput: true,
  hasOutput: true,
  defaultData: () => ({
    selectedPad: 0,
    pads: Array.from({ length: 8 }, () => ({
      hasSample: false,
      isPlaying: false,
      duration: 0,
      volume: 1,
      pitch: 1,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
    })),
    volume: 0.7,
    filterFreq: 20000,
    filterRes: 0,
  }),
  createAudio: (ctx) => new SamplerModule(ctx),
  component: SamplerModuleNode,
});
