import { Node, Edge } from "reactflow";
import { CryptoData } from "./crypto";

export type ModuleType = "crypto" | "mixer" | "mixer-4" | "mixer-8" | "mixer-16" | "mixer-32" | "visualizer" | "sampler" | "sequencer" | "drums" |
  "reverb" | "delay" | "chorus" | "flanger" | "phaser" | "pingpong-delay" |
  "compressor" | "limiter" | "gate" | "de-esser" |
  "eq" | "lpf" | "hpf" | "bandpass" | "resonant-filter" |
  "overdrive" | "distortion" | "fuzz" | "bitcrusher" | "tape-saturation" |
  "vibrato" | "tremolo" | "ring-mod" | "pitch-shifter" | "octaver" |
  "granular" | "vocoder" | "auto-pan" | "stereo-widener" |
  "output-speakers" | "output-headphones";

export interface CryptoModuleData {
  type: "crypto";
  crypto: CryptoData;
  volume: number;
  waveform: OscillatorType;
  oscillator: OscillatorNode | null;
  gainNode: GainNode | null;
  isPlaying: boolean;
  collapsed: boolean;
  connectedTo: string | null; // Track if connected
  scale: string;
  rootNote: string;
  octave: number;
  pitch: number; // semitone transpose
}

export interface MixerModuleData {
  type: "mixer" | "mixer-4" | "mixer-8" | "mixer-16" | "mixer-32";
  masterVolume: number;
  isPlaying: boolean;
  inputCount: number;
  collapsed: boolean;
  channels?: Array<{ volume: number; pan: number; muted: boolean }>;
  channelGains?: GainNode[];
  channelPanners?: StereoPannerNode[];
  mergerNode?: AudioNode | null;
}

export interface VisualizerModuleData {
  type: "visualizer";
  isActive: boolean;
  collapsed: boolean;
  analyserNode: AnalyserNode | null;
  inputNode: GainNode | null;
  outputNode: GainNode | null;
}

export interface SamplerModuleData {
  type: "sampler";
  sample: string;
  pitch: number;
  decay: number;
  isActive: boolean;
  audioNode: GainNode | null;
  collapsed: boolean;
}

export interface EffectModuleData {
  type: "reverb" | "delay" | "chorus" | "flanger" | "phaser" | "pingpong-delay" |
    "compressor" | "limiter" | "gate" | "de-esser" |
    "eq" | "lpf" | "hpf" | "bandpass" | "resonant-filter" |
    "overdrive" | "distortion" | "fuzz" | "bitcrusher" | "tape-saturation" |
    "vibrato" | "tremolo" | "ring-mod" | "pitch-shifter" | "octaver" |
    "granular" | "vocoder" | "auto-pan" | "stereo-widener";
  intensity: number;
  mix: number;
  isActive: boolean;
  parameters: Record<string, number>;
  audioNode: AudioNode | null;
  collapsed: boolean;
  inputNode: GainNode | null; // Input for routing
  outputNode: GainNode | null; // Output for routing
  wetNode: GainNode | null; // Wet signal
  dryNode: GainNode | null; // Dry signal
}

export interface SequencerModuleData {
  type: "sequencer";
  bpm: number;
  steps: boolean[];
  currentStep: number;
  isPlaying: boolean;
  collapsed: boolean;
  intervalId: number | null;
  inputNode: GainNode | null;
  outputNode: GainNode | null;
  volume: number; // Modulated by connected crypto
  pitch: number; // Modulated by connected crypto
}

export interface DrumsModuleData {
  type: "drums";
  selectedDrum: "kick" | "snare" | "hihat" | "clap" | "tom" | "low-tom" | "mid-tom" | "high-tom" | "cowbell" | "ride" | "crash" | "shaker" | "clave" | "rim" | "rimshot" | "bongo" | "conga";
  volume: number;
  pitch: number;
  collapsed: boolean;
  outputNode: GainNode | null;
}

export interface OutputModuleData {
  type: "output-speakers" | "output-headphones";
  volume: number;
  isActive: boolean;
  outputGain: GainNode | null;
  collapsed: boolean;
}

export type ModuleData = 
  | CryptoModuleData 
  | MixerModuleData 
  | VisualizerModuleData 
  | SamplerModuleData 
  | SequencerModuleData
  | DrumsModuleData
  | EffectModuleData
  | OutputModuleData;

export type CryptoNode = Node<CryptoModuleData>;
export type MixerNode = Node<MixerModuleData>;
export type VisualizerNode = Node<VisualizerModuleData>;
export type ModuleNode = Node<ModuleData>;
export type ModuleEdge = Edge;
