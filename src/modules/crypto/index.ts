import { registerModule } from "../registry";
import { CryptoModule } from "./CryptoModule";
import CryptoModuleNode from "./CryptoModuleNode";

registerModule({
  type: "crypto",
  category: "source",
  label: "Crypto",
  hasInput: false,
  hasOutput: true,
  defaultData: (extra) => ({
    crypto: extra?.crypto ?? null,
    volume: 1.0,
    waveform: "sine" as OscillatorType,
    scale: "major",
    rootNote: "C",
    octave: 4,
    pitch: 0,
  }),
  createAudio: (ctx, data) => new CryptoModule(ctx, data.crypto),
  component: CryptoModuleNode,
});
