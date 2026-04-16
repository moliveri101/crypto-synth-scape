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
    createAudio: (ctx, data) => {
      const m = new MixerModule(ctx, size);
      // Restore saved per-channel state (volume/pan/muted) onto the fresh
      // module — critical after zombie recovery so the user's slider values
      // actually take effect in audio instead of resetting to the module's
      // internal defaults.
      if (typeof data.masterVolume === "number") {
        m.setParameter("masterVolume", data.masterVolume);
      }
      if (Array.isArray(data.channels)) {
        data.channels.forEach((ch: any, i: number) => {
          if (typeof ch?.volume === "number") m.setParameter(`channel_${i}_volume`, ch.volume);
          if (typeof ch?.pan === "number") m.setParameter(`channel_${i}_pan`, ch.pan);
          if (typeof ch?.muted === "boolean") m.setParameter(`channel_${i}_muted`, ch.muted);
        });
      }
      return m;
    },
    component: MixerModuleNode,
  });
}
