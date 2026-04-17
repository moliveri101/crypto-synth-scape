import { Node, Edge } from "reactflow";
import { getDescriptor } from "@/modules/registry";

/**
 * Curated example layouts shipped with the app. These demonstrate how
 * different module families fit together so new users have a working
 * starting point for each pattern (audio chain, data → sound, visual
 * sync, etc.).
 *
 * Loading a preset fires `onLoad(nodes, edges)` on the LayoutsMenu — the
 * same path user-saved layouts use — which clears the canvas and lets
 * zombie-recovery rebuild the audio modules from the node data.
 */

export interface PresetLayout {
  id: string;
  name: string;
  difficulty: "Easy" | "Medium" | "Advanced";
  description: string;
  nodes: Node[];
  edges: Edge[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Build a node with the correct data shape. Merges the module's
 * defaultData with any overrides, so the preset only has to specify
 * what's different from defaults.
 */
function makeNode(
  id: string,
  type: string,
  x: number,
  y: number,
  overrides: Record<string, any> = {},
): Node {
  const desc = getDescriptor(type);
  const base = desc ? desc.defaultData(overrides) : {};
  return {
    id,
    type,
    position: { x, y },
    data: { ...base, ...overrides, type, isPlaying: false, collapsed: false },
  };
}

function makeEdge(
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string,
): Edge {
  const idParts = [source, sourceHandle ?? "", target, targetHandle ?? ""].join("-");
  return {
    id: `e-${idParts}`,
    source,
    target,
    sourceHandle: sourceHandle ?? null,
    targetHandle: targetHandle ?? null,
    type: "custom",
    animated: true,
    style: { stroke: "hsl(188, 95%, 58%)", strokeWidth: 2 },
    data: {},
  };
}

// ─── Preset builders ─────────────────────────────────────────────────────

/** Heartbeat → drum-like pulse → speakers. The simplest "data becomes sound" patch. */
function heartbeatPulse(): PresetLayout {
  const vitalsId = "preset-vitals";
  const pulseId = "preset-pulse";
  const mixerId = "preset-mixer";
  const spkId = "preset-spk";

  return {
    id: "heartbeat-pulse",
    name: "Heartbeat Pulse",
    difficulty: "Easy",
    description:
      "Vitals → Pulse Translator → Mixer → Speakers. " +
      "Your heart rate becomes a low kick drum. Start by pressing Play on the " +
      "Vitals module, then on the Pulse Translator (set mode to Rate), then on Speakers.",
    nodes: [
      makeNode(vitalsId, "vitals", 80, 120, { activityLevel: "light" }),
      makeNode(pulseId, "pulse-translator", 520, 120, {
        mode: "rate", pitch: 80, decay: 0.35, volume: 0.8, maxRate: 2,
      }),
      makeNode(mixerId, "mixer-4", 900, 120, {}),
      makeNode(spkId, "output-speakers", 1350, 120, {}),
    ],
    edges: [
      makeEdge(vitalsId, pulseId, "out-heart_rate", "in-trigger"),
      makeEdge(pulseId, mixerId, "out-L", "in-0"),
      makeEdge(pulseId, mixerId, "out-R", "in-0"),
      makeEdge(mixerId, spkId, "out-L", "in-L"),
      makeEdge(mixerId, spkId, "out-R", "in-R"),
    ],
  };
}

/** Stock price → Melody Translator → Preamp → Mixer → Speakers, plus morphing Mandelbulb. */
function marketMelody(): PresetLayout {
  const stockId = "preset-stock";
  const melodyId = "preset-melody";
  const preId = "preset-preamp";
  const mixId = "preset-mix";
  const spkId = "preset-spk";
  const bulbId = "preset-bulb";

  return {
    id: "market-melody",
    name: "Market Melody",
    difficulty: "Medium",
    description:
      "Live AAPL stock drives a melody translator in a minor scale, with " +
      "volatility controlling the fractal shape. Tube preamp adds warmth.",
    nodes: [
      makeNode(stockId, "stock", 60, 60, { mode: "live" }),
      makeNode(melodyId, "melody-translator", 500, 60, {
        scale: "minor", rootNote: "A", octave: 3, smoothing: 1.2,
      }),
      makeNode(preId, "preamp", 950, 60, { gain: 4, drive: 0.3, body: 3 }),
      makeNode(mixId, "mixer-4", 1380, 60, {}),
      makeNode(spkId, "output-speakers", 1800, 60, {}),
      makeNode(bulbId, "visualizer-mandelbulb", 60, 560, {}),
    ],
    edges: [
      // Musical chain
      makeEdge(stockId, melodyId, "out-change_24h", "in-note"),
      makeEdge(stockId, melodyId, "out-volatility", "in-pitch"),
      makeEdge(melodyId, preId, "out-L", "in-audio-L"),
      makeEdge(melodyId, preId, "out-R", "in-audio-R"),
      makeEdge(preId, mixId, "out-L", "in-0"),
      makeEdge(preId, mixId, "out-R", "in-0"),
      makeEdge(mixId, spkId, "out-L", "in-L"),
      makeEdge(mixId, spkId, "out-R", "in-R"),
      // Visual chain
      makeEdge(stockId, bulbId, "out-volatility", "in-power"),
      makeEdge(stockId, bulbId, "out-change_24h", "in-color"),
      makeEdge(stockId, bulbId, "out-volume", "in-copies"),
    ],
  };
}

/** Emotiv EEG → Tone + Strobe. Brain state becomes tone + light. */
function brainSignal(): PresetLayout {
  const eegId = "preset-eeg";
  const toneId = "preset-tone";
  const strobeId = "preset-strobe";
  const mixId = "preset-mix";
  const spkId = "preset-spk";

  return {
    id: "brain-signal",
    name: "Brain Signal",
    difficulty: "Medium",
    description:
      "Simulated Emotiv EEG → Tone Translator + Simple Strobe. Alpha band " +
      "shapes the tone, Gamma sets the strobe rate. Fire up Vitals too and " +
      "patch heart_rate → strobe density for added drama.",
    nodes: [
      makeNode(eegId, "emotiv", 60, 60, { mode: "simulated" }),
      makeNode(toneId, "tone-translator", 560, 60, {
        baseFreq: 110, rangeOctaves: 3, waveform: "sawtooth", smoothing: 0.8,
      }),
      makeNode(mixId, "mixer-4", 1000, 60, {}),
      makeNode(spkId, "output-speakers", 1400, 60, {}),
      makeNode(strobeId, "visualizer-strobe-simple", 60, 760, { speed: 0.12, density: 0.15 }),
    ],
    edges: [
      // Audio
      makeEdge(eegId, toneId, "out-band_alpha", "in-note"),
      makeEdge(eegId, toneId, "out-band_theta", "in-baseFreq"),
      makeEdge(toneId, mixId, "out-L", "in-0"),
      makeEdge(toneId, mixId, "out-R", "in-0"),
      makeEdge(mixId, spkId, "out-L", "in-L"),
      makeEdge(mixId, spkId, "out-R", "in-R"),
      // Strobe patched from Gamma
      makeEdge(eegId, strobeId, "out-band_gamma", "in-speed"),
      makeEdge(eegId, strobeId, "out-band_alpha", "in-density"),
    ],
  };
}

/** Space weather → sound + visuals. Real cosmic radio patterns drive everything. */
function spaceWeatherSymphony(): PresetLayout {
  const radioId = "preset-radio";
  const toneId = "preset-tone";
  const pulseId = "preset-pulse";
  const mixId = "preset-mix";
  const spkId = "preset-spk";
  const bulbId = "preset-bulb";

  return {
    id: "space-weather",
    name: "Space Weather Symphony",
    difficulty: "Medium",
    description:
      "Real NOAA space-weather feeds (solar wind, IMF, Kp, X-ray) drive a " +
      "tone, a pulse and a Mandelbulb. When a solar flare or CME arrives " +
      "you'll hear and see the impact.",
    nodes: [
      makeNode(radioId, "radio-signals", 60, 60, { volume: 0.3 }),
      makeNode(toneId, "tone-translator", 560, 60, {
        baseFreq: 55, rangeOctaves: 5, waveform: "sine", smoothing: 2.0,
      }),
      makeNode(pulseId, "pulse-translator", 560, 520, {
        mode: "threshold", threshold: 0.3, pitch: 60, decay: 0.8, volume: 0.7,
      }),
      makeNode(mixId, "mixer-4", 1050, 220, {}),
      makeNode(spkId, "output-speakers", 1500, 220, {}),
      makeNode(bulbId, "visualizer-mandelbulb", 60, 820, {}),
    ],
    edges: [
      // Tone: solar wind speed = base pitch, Kp = scale degree
      makeEdge(radioId, toneId, "out-wind_speed", "in-baseFreq"),
      makeEdge(radioId, toneId, "out-kp", "in-note"),
      // Pulse: southward Bz fires a pulse (storm indicator)
      makeEdge(radioId, pulseId, "out-bz_south", "in-trigger"),
      // Audio routing
      makeEdge(toneId, mixId, "out-L", "in-0"),
      makeEdge(toneId, mixId, "out-R", "in-0"),
      makeEdge(pulseId, mixId, "out-L", "in-1"),
      makeEdge(pulseId, mixId, "out-R", "in-1"),
      makeEdge(mixId, spkId, "out-L", "in-L"),
      makeEdge(mixId, spkId, "out-R", "in-R"),
      // Visual: wind + flux shape the fractal
      makeEdge(radioId, bulbId, "out-wind_speed", "in-power"),
      makeEdge(radioId, bulbId, "out-kp", "in-color"),
      makeEdge(radioId, bulbId, "out-xray_flux", "in-glow"),
    ],
  };
}

/** Awareness piece — deportation rate drives percussive + visual response. */
function deportationAwareness(): PresetLayout {
  const deportId = "preset-deport";
  const pulseId = "preset-pulse";
  const toneId = "preset-tone";
  const preId = "preset-preamp";
  const mixId = "preset-mix";
  const spkId = "preset-spk";
  const bulbId = "preset-bulb";

  return {
    id: "deportation-awareness",
    name: "Deportation Awareness",
    difficulty: "Advanced",
    description:
      "ICE Deportation Tracker → one pulse per deportation, low tone drone " +
      "for the total count, Mandelbulb morphing with regional breakdowns. " +
      "A piece designed to sonify what's usually invisible.",
    nodes: [
      makeNode(deportId, "deportation", 60, 60, {}),
      makeNode(pulseId, "pulse-translator", 540, 60, {
        mode: "rate", maxRate: 2, pitch: 55, decay: 0.6, volume: 0.8,
      }),
      makeNode(toneId, "tone-translator", 540, 500, {
        baseFreq: 45, rangeOctaves: 2, waveform: "sawtooth", smoothing: 3.0,
      }),
      makeNode(preId, "preamp", 1020, 280, { gain: 6, drive: 0.3, body: 3 }),
      makeNode(mixId, "mixer-4", 1450, 280, {}),
      makeNode(spkId, "output-speakers", 1850, 280, {}),
      makeNode(bulbId, "visualizer-mandelbulb", 60, 960, {}),
    ],
    edges: [
      makeEdge(deportId, pulseId, "out-per_minute", "in-trigger"),
      makeEdge(deportId, toneId, "out-total_removals", "in-note"),
      makeEdge(pulseId, preId, "out-L", "in-audio-L"),
      makeEdge(pulseId, preId, "out-R", "in-audio-R"),
      makeEdge(toneId, preId, "out-L", "in-audio-L"),
      makeEdge(toneId, preId, "out-R", "in-audio-R"),
      makeEdge(preId, mixId, "out-L", "in-0"),
      makeEdge(preId, mixId, "out-R", "in-0"),
      makeEdge(mixId, spkId, "out-L", "in-L"),
      makeEdge(mixId, spkId, "out-R", "in-R"),
      makeEdge(deportId, bulbId, "out-region_mexico", "in-power"),
      makeEdge(deportId, bulbId, "out-region_central_america", "in-color"),
      makeEdge(deportId, bulbId, "out-current_detained", "in-copies"),
    ],
  };
}

/** Pure visual exploration — webcam splat demo. */
function webcamSplats(): PresetLayout {
  const splatsId = "preset-splats";
  return {
    id: "webcam-splats",
    name: "Webcam Splats",
    difficulty: "Easy",
    description:
      "Variance-based Gaussian splat decomposition of your webcam feed. " +
      "Click 'Start camera', then slide Clean down to reveal splats. " +
      "Patch any live data source into Density or Size to make the " +
      "decomposition react to external signals.",
    nodes: [
      makeNode(splatsId, "visualizer-splats", 200, 120, { clean: 0.4, density: 0.6 }),
    ],
    edges: [],
  };
}

/** Crypto → direct tone → speakers. The classic "hello world" for this app. */
function cryptoDrone(): PresetLayout {
  const cryptoId = "preset-crypto";
  const spkId = "preset-spk";
  return {
    id: "crypto-drone",
    name: "Crypto Drone",
    difficulty: "Easy",
    description:
      "Bitcoin price drives an oscillator tone into the speakers. The " +
      "original 'crypto-synth-scape' starting point. Click Live Prices ON " +
      "(top bar) to get real CoinGecko data, then Play both modules.",
    nodes: [
      makeNode(cryptoId, "crypto", 100, 120, {}),
      makeNode(spkId, "output-speakers", 700, 120, {}),
    ],
    edges: [
      makeEdge(cryptoId, spkId, "out-L", "in-L"),
      makeEdge(cryptoId, spkId, "out-R", "in-R"),
    ],
  };
}

/** LFO + Noise driving a Tone Translator — pure internal modulation, no data source. */
function wanderingOscillator(): PresetLayout {
  const lfoId = "preset-lfo";
  const noiseId = "preset-noise";
  const toneId = "preset-tone";
  const mixId = "preset-mix";
  const spkId = "preset-spk";

  return {
    id: "wandering-oscillator",
    name: "Wandering Oscillator",
    difficulty: "Easy",
    description:
      "LFO (slow sine) modulates the tone's base frequency while Noise " +
      "wanders the pitch through the scale. No external data needed — " +
      "pure internal modulation. Press Play on the Tone Translator and Speakers.",
    nodes: [
      makeNode(lfoId, "chop-lfo", 60, 60, {
        frequency: 0.15, amplitude: 0.5, bias: 0.4, phase: 0, waveform: "sine",
      }),
      makeNode(noiseId, "chop-noise", 60, 460, {
        speed: 0.25, detail: 0.5, bias: 0.5, amp: 0.7,
      }),
      makeNode(toneId, "tone-translator", 560, 220, {
        baseFreq: 110, rangeOctaves: 3, waveform: "triangle", smoothing: 0.4,
        scale: "pentatonic", rootNote: "D",
      }),
      makeNode(mixId, "mixer-4", 1020, 220, {}),
      makeNode(spkId, "output-speakers", 1430, 220, {}),
    ],
    edges: [
      makeEdge(lfoId, toneId, "out-value", "in-baseFreq"),
      makeEdge(noiseId, toneId, "out-value", "in-note"),
      makeEdge(toneId, mixId, "out-L", "in-0"),
      makeEdge(toneId, mixId, "out-R", "in-0"),
      makeEdge(mixId, spkId, "out-L", "in-L"),
      makeEdge(mixId, spkId, "out-R", "in-R"),
    ],
  };
}

/** Clock drives a pulse, Random+Lag drives the pitch — a generative sequencer. */
function clockRhythmMachine(): PresetLayout {
  const clockId = "preset-clock";
  const randomId = "preset-random";
  const lagId = "preset-lag";
  const pulseId = "preset-pulse";
  const toneId = "preset-tone";
  const lfoId = "preset-lfo";
  const mixId = "preset-mix";
  const spkId = "preset-spk";

  return {
    id: "clock-rhythm-machine",
    name: "Clock Rhythm Machine",
    difficulty: "Medium",
    description:
      "Clock pulses trigger a kick, Random (S&H) picks a new note every beat, " +
      "Lag smooths the pitch jumps into glides. An LFO slowly modulates the swing " +
      "so the groove drifts in and out of pocket. All generative — no data sources.",
    nodes: [
      makeNode(clockId, "chop-clock", 60, 60, {
        bpm: 0.37, gateLen: 0.15, swing: 0.1, division: "1/4",
      }),
      makeNode(lfoId, "chop-lfo", 60, 420, {
        frequency: 0.08, amplitude: 0.4, bias: 0.5, phase: 0, waveform: "sine",
      }),
      makeNode(randomId, "chop-random", 60, 760, {
        rate: 0.55, smooth: 0, min: 0.2, max: 0.9,
      }),
      makeNode(lagId, "util-lag", 520, 760, { time: 0.25 }),
      makeNode(pulseId, "pulse-translator", 520, 60, {
        mode: "threshold", threshold: 0.5, pitch: 55, decay: 0.4, volume: 0.85,
      }),
      makeNode(toneId, "tone-translator", 980, 420, {
        baseFreq: 220, rangeOctaves: 2, waveform: "square", smoothing: 0.1,
        scale: "minor", rootNote: "A",
      }),
      makeNode(mixId, "mixer-4", 1430, 280, {}),
      makeNode(spkId, "output-speakers", 1830, 280, {}),
    ],
    edges: [
      // Clock drives the kick
      makeEdge(clockId, pulseId, "out-gate", "in-trigger"),
      // LFO wanders the swing
      makeEdge(lfoId, clockId, "out-value", "in-swing"),
      // Clock also steps the Random — every beat picks a new note
      makeEdge(clockId, randomId, "out-gate", "in-rate"),
      // Random → Lag → Tone (smoothed pitch jumps)
      makeEdge(randomId, lagId, "out-value", "in-signal"),
      makeEdge(lagId, toneId, "out-value", "in-note"),
      // Audio
      makeEdge(pulseId, mixId, "out-L", "in-0"),
      makeEdge(pulseId, mixId, "out-R", "in-0"),
      makeEdge(toneId, mixId, "out-L", "in-1"),
      makeEdge(toneId, mixId, "out-R", "in-1"),
      makeEdge(mixId, spkId, "out-L", "in-L"),
      makeEdge(mixId, spkId, "out-R", "in-R"),
    ],
  };
}

/** Two LFOs combined through Math, showcasing the utility as a modulation tool. */
function mathModulator(): PresetLayout {
  const lfoAId = "preset-lfoA";
  const lfoBId = "preset-lfoB";
  const mathId = "preset-math";
  const toneId = "preset-tone";
  const bulbId = "preset-bulb";
  const mixId = "preset-mix";
  const spkId = "preset-spk";

  return {
    id: "math-modulator",
    name: "Math Modulator",
    difficulty: "Medium",
    description:
      "Two LFOs at different speeds get combined through a Math node (try " +
      "multiply, difference, or min). The result drives both the tone's pitch " +
      "and a Mandelbulb's shape, so sound and visuals stay locked together.",
    nodes: [
      makeNode(lfoAId, "chop-lfo", 60, 60, {
        frequency: 0.12, amplitude: 0.5, bias: 0.5, phase: 0, waveform: "sine",
      }),
      makeNode(lfoBId, "chop-lfo", 60, 420, {
        frequency: 0.28, amplitude: 0.5, bias: 0.5, phase: 0.25, waveform: "triangle",
      }),
      makeNode(mathId, "util-math", 540, 220, { op: "multiply" }),
      makeNode(toneId, "tone-translator", 920, 60, {
        baseFreq: 80, rangeOctaves: 4, waveform: "sawtooth", smoothing: 0.3,
        scale: "major", rootNote: "C",
      }),
      makeNode(bulbId, "visualizer-mandelbulb", 920, 520, {}),
      makeNode(mixId, "mixer-4", 1380, 60, {}),
      makeNode(spkId, "output-speakers", 1800, 60, {}),
    ],
    edges: [
      makeEdge(lfoAId, mathId, "out-value", "in-a"),
      makeEdge(lfoBId, mathId, "out-value", "in-b"),
      makeEdge(mathId, toneId, "out-value", "in-note"),
      makeEdge(mathId, bulbId, "out-value", "in-power"),
      makeEdge(lfoBId, bulbId, "out-value", "in-color"),
      makeEdge(toneId, mixId, "out-L", "in-0"),
      makeEdge(toneId, mixId, "out-R", "in-0"),
      makeEdge(mixId, spkId, "out-L", "in-L"),
      makeEdge(mixId, spkId, "out-R", "in-R"),
    ],
  };
}

// ─── Registry ────────────────────────────────────────────────────────────

/**
 * Ordered list of built-in presets. The LayoutsMenu renders them in this
 * order under a "Presets" section. Add new presets here.
 */
export const PRESET_LAYOUTS: PresetLayout[] = [
  cryptoDrone(),
  webcamSplats(),
  wanderingOscillator(),
  heartbeatPulse(),
  clockRhythmMachine(),
  mathModulator(),
  brainSignal(),
  marketMelody(),
  spaceWeatherSymphony(),
  deportationAwareness(),
];

/** Lookup by id for load actions. */
export function findPreset(id: string): PresetLayout | undefined {
  return PRESET_LAYOUTS.find((p) => p.id === id);
}
