import { registerModule } from "../registry";
import { ToneTranslator } from "./ToneTranslator";
import ToneTranslatorNode from "./ToneTranslatorNode";

// Per-control input handles — same pattern as Melody Translator.
// `note` is the primary pitch-drive input; the rest modulate their controls.
const TONE_INPUTS: Array<{ id: string; label: string }> = [
  { id: "in-note",     label: "Note" },
  { id: "in-baseFreq", label: "Base Freq" },
  { id: "in-range",    label: "Range" },
  { id: "in-volume",   label: "Volume" },
  { id: "in-glide",    label: "Glide" },
];

registerModule({
  type: "tone-translator",
  category: "processor",
  label: "Tone Translator",
  hasInput: true,
  hasOutput: true,
  inputHandles: () => TONE_INPUTS,
  defaultData: () => ({
    field: null as string | null,
    waveform: "sine" as OscillatorType,
    baseFreq: 110,
    rangeOctaves: 3,
    curve: "linear" as const,
    volume: 0.5,
    smoothing: 0.1,
  }),
  createAudio: (ctx, data) => {
    const m = new ToneTranslator(ctx);
    if (data.field) m.setParameter("field", data.field);
    if (data.waveform) m.setParameter("waveform", data.waveform);
    if (typeof data.baseFreq === "number") m.setParameter("baseFreq", data.baseFreq);
    if (typeof data.rangeOctaves === "number") m.setParameter("rangeOctaves", data.rangeOctaves);
    if (data.curve) m.setParameter("curve", data.curve);
    if (typeof data.volume === "number") m.setParameter("volume", data.volume);
    if (typeof data.smoothing === "number") m.setParameter("smoothing", data.smoothing);
    return m;
  },
  component: ToneTranslatorNode,
});
