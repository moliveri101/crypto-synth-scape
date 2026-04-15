import { registerModule } from "../registry";
import { OutputModule } from "./OutputModule";
import OutputModuleNode from "./OutputModuleNode";

const OUTPUT_TYPES = [
  { type: "output-speakers", label: "Speakers" },
  { type: "output-headphones", label: "Headphones" },
] as const;

for (const { type, label } of OUTPUT_TYPES) {
  registerModule({
    type,
    category: "output",
    label,
    hasInput: true,
    hasOutput: false,
    defaultData: () => ({
      volume: 0.9,
      isActive: false,
    }),
    createAudio: (ctx) => new OutputModule(ctx),
    component: OutputModuleNode,
  });
}
