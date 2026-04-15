import { registerModule } from "../registry";
import { SequencerModule } from "./SequencerModule";
import SequencerModuleNode from "./SequencerModuleNode";

registerModule({
  type: "sequencer",
  category: "processor",
  label: "Sequencer",
  hasInput: true,
  hasOutput: true,
  defaultData: () => ({
    bpm: 120,
    steps: [
      true, false, false, false,
      true, false, false, false,
      true, false, false, false,
      true, false, false, false,
    ],
    currentStep: 0,
    volume: 0.8,
    pitch: 0,
  }),
  createAudio: (ctx, data) => {
    const m = new SequencerModule(ctx);
    if (data.steps) m.setParameter("steps", data.steps);
    if (data.bpm) m.setParameter("bpm", data.bpm);
    if (data.volume != null) m.setParameter("volume", data.volume);
    return m;
  },
  component: SequencerModuleNode,
});
