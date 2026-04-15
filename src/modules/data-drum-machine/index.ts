import { registerModule } from "../registry";
import { DataDrumMachine, createDefaultTracks, DRUM_VOICES } from "./DataDrumMachine";
import DataDrumMachineNode from "./DataDrumMachineNode";

const VOICE_LABELS: Record<string, string> = {
  kick: "Kick",
  snare: "Snare",
  "hihat-closed": "HH-C",
  "hihat-open": "HH-O",
  clap: "Clap",
  tom: "Tom",
  ride: "Ride",
  cowbell: "Cowbell",
};

registerModule({
  type: "data-drum-machine",
  category: "source",
  label: "Data Drum Machine",
  hasInput: true,
  hasOutput: true,
  // Per-voice input handles — one per drum track
  inputHandles: () =>
    DRUM_VOICES.map((voice, i) => ({
      id: `in-${i}`,
      label: VOICE_LABELS[voice] ?? voice,
    })),
  defaultData: () => ({
    bpm: 120,
    swing: 0,
    tracks: createDefaultTracks(),
    currentStep: 0,
    dataValues: {},
    connectedVoices: [] as number[],
  }),
  createAudio: (ctx, data) => {
    const m = new DataDrumMachine(ctx);
    if (data.bpm) m.setParameter("bpm", data.bpm);
    if (data.swing) m.setParameter("swing", data.swing);
    if (data.tracks) m.setParameter("tracks", data.tracks);
    return m;
  },
  component: DataDrumMachineNode,
});
