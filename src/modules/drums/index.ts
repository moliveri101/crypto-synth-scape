import { registerModule } from "../registry";
import { DrumsModule } from "./DrumsModule";
import DrumsModuleNode from "./DrumsModuleNode";

registerModule({
  type: "drums",
  category: "processor",
  label: "Drums",
  hasInput: true,
  hasOutput: true,
  defaultData: () => ({
    selectedDrum: "kick",
    volume: 1.0,
    pitch: 0,
  }),
  createAudio: (ctx) => new DrumsModule(ctx),
  component: DrumsModuleNode,
});
