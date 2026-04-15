import { registerModule } from "../registry";
import { MixerModule } from "./MixerModule";
import MixerModuleNode from "./MixerModuleNode";

const MIXER_SIZES = [4, 8, 16, 32] as const;

for (const size of MIXER_SIZES) {
  registerModule({
    type: `mixer-${size}`,
    category: "processor",
    label: `${size}-Track Mixer`,
    hasInput: true,
    hasOutput: true,
    inputHandles: () =>
      Array.from({ length: size }, (_, i) => ({
        id: `in-${i}`,
        label: `Ch ${i + 1}`,
      })),
    defaultData: () => ({
      masterVolume: 1.0,
      inputCount: 0,
      channels: Array.from({ length: size }, () => ({
        volume: 1.0,
        pan: 0,
        muted: false,
      })),
    }),
    createAudio: (ctx) => new MixerModule(ctx, size),
    component: MixerModuleNode,
  });
}
