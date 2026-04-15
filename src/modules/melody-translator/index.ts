import { registerModule } from "../registry";
import { MelodyTranslator } from "./MelodyTranslator";
import MelodyTranslatorNode from "./MelodyTranslatorNode";

// Per-control input handles. Each one modulates a specific parameter when
// connected. Labels appear in the UI next to each row.
const MELODY_INPUTS: Array<{ id: string; label: string }> = [
  { id: "in-note",   label: "Note" },
  { id: "in-volume", label: "Volume" },
  { id: "in-glide",  label: "Glide" },
  { id: "in-pitch",  label: "Pitch" },
  { id: "in-octave", label: "Octave" },
  { id: "in-scale",  label: "Scale" },
  { id: "in-root",   label: "Root" },
];

registerModule({
  type: "melody-translator",
  category: "processor",
  label: "Melody Translator",
  hasInput: true,
  hasOutput: true,
  inputHandles: () => MELODY_INPUTS,
  defaultData: () => ({
    field: null as string | null,
    waveform: "sine" as OscillatorType,
    scale: "major" as const,
    rootNote: "C",
    octave: 4,
    pitch: 0,
    volume: 0.6,
    smoothing: 0.05,
  }),
  createAudio: (ctx, data) => {
    const m = new MelodyTranslator(ctx);
    if (data.waveform) m.setParameter("waveform", data.waveform);
    if (data.scale) m.setParameter("scale", data.scale);
    if (data.rootNote) m.setParameter("rootNote", data.rootNote);
    if (typeof data.octave === "number") m.setParameter("octave", data.octave);
    if (typeof data.pitch === "number") m.setParameter("pitch", data.pitch);
    if (typeof data.volume === "number") m.setParameter("volume", data.volume);
    if (typeof data.smoothing === "number") m.setParameter("smoothing", data.smoothing);
    return m;
  },
  component: MelodyTranslatorNode,
});
