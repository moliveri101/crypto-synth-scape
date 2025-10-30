import { Node, Edge } from "reactflow";
import { CryptoData } from "./crypto";

export type ModuleType = "crypto" | "mixer" | "visualizer" | "sampler" | "tone-selector" | 
  "reverb" | "delay" | "chorus" | "flanger" | "phaser" | "pingpong-delay" |
  "compressor" | "limiter" | "gate" | "de-esser" |
  "eq" | "lpf" | "hpf" | "bandpass" | "resonant-filter" |
  "overdrive" | "distortion" | "fuzz" | "bitcrusher" | "tape-saturation" |
  "vibrato" | "tremolo" | "ring-mod" | "pitch-shifter" | "octaver" |
  "granular" | "vocoder" | "auto-pan" | "stereo-widener";

export interface CryptoModuleData {
  type: "crypto";
  crypto: CryptoData;
  volume: number;
  waveform: OscillatorType;
  oscillator: OscillatorNode | null;
  gainNode: GainNode | null;
  isPlaying: boolean;
}

export interface MixerModuleData {
  type: "mixer";
  masterVolume: number;
  isPlaying: boolean;
  inputCount: number;
}

export interface VisualizerModuleData {
  type: "visualizer";
  isActive: boolean;
}

export interface SamplerModuleData {
  type: "sampler";
  sample: string;
  pitch: number;
  decay: number;
  isActive: boolean;
  audioNode: GainNode | null;
}

export interface ToneSelectorModuleData {
  type: "tone-selector";
  scale: string;
  rootNote: string;
  octave: number;
  isActive: boolean;
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
}

export type ModuleData = 
  | CryptoModuleData 
  | MixerModuleData 
  | VisualizerModuleData 
  | SamplerModuleData 
  | ToneSelectorModuleData 
  | EffectModuleData;

export type CryptoNode = Node<CryptoModuleData>;
export type MixerNode = Node<MixerModuleData>;
export type VisualizerNode = Node<VisualizerModuleData>;
export type ModuleNode = Node<ModuleData>;
export type ModuleEdge = Edge;
