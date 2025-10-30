import { Node, Edge } from "reactflow";
import { CryptoData } from "./crypto";

export type ModuleType = "crypto" | "mixer" | "visualizer";

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

export type ModuleData = CryptoModuleData | MixerModuleData | VisualizerModuleData;

export type CryptoNode = Node<CryptoModuleData>;
export type MixerNode = Node<MixerModuleData>;
export type VisualizerNode = Node<VisualizerModuleData>;
export type ModuleNode = Node<ModuleData>;
export type ModuleEdge = Edge;
