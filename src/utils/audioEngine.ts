import { CryptoData } from "@/types/crypto";

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  public nodeMap: Map<string, AudioNode> = new Map(); // Track all audio nodes by module ID

  initialize() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
      this.masterGain.gain.value = 0.5;
    }
  }

  getContext() {
    return this.audioContext;
  }

  getMasterGain() {
    return this.masterGain;
  }

  // Create oscillator without connecting it
  createOscillator(
    crypto: CryptoData, 
    waveform: OscillatorType = "sine",
    scale: string = "major",
    rootNote: string = "C",
    octave: number = 4
  ) {
    if (!this.audioContext || !this.masterGain) return null;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    // Calculate frequency based on tone settings
    const frequency = this.calculateFrequency(crypto, scale, rootNote, octave);

    oscillator.type = waveform;
    oscillator.frequency.value = frequency;

    // Map volume (normalized) to gain
    const normalizedVolume = Math.min(crypto.total_volume / 1e10, 1);
    gainNode.gain.value = 0.1 + normalizedVolume * 0.4;

    // Connect oscillator to its gain node (but not to destination yet)
    oscillator.connect(gainNode);

    return { oscillator, gainNode };
  }

  private calculateFrequency(
    crypto: CryptoData,
    scale: string,
    rootNote: string,
    octave: number
  ): number {
    // Define note frequencies (A4 = 440Hz)
    const noteFreqs: Record<string, number> = {
      "C": 261.63, "C#": 277.18, "D": 293.66, "D#": 311.13,
      "E": 329.63, "F": 349.23, "F#": 369.99, "G": 392.00,
      "G#": 415.30, "A": 440.00, "A#": 466.16, "B": 493.88
    };

    // Scale intervals (semitones from root)
    const scaleIntervals: Record<string, number[]> = {
      "major": [0, 2, 4, 5, 7, 9, 11],
      "minor": [0, 2, 3, 5, 7, 8, 10],
      "pentatonic": [0, 2, 4, 7, 9],
      "blues": [0, 3, 5, 6, 7, 10]
    };

    // Get base frequency for root note
    const baseFreq = noteFreqs[rootNote] || 261.63;
    
    // Adjust for octave (each octave doubles/halves frequency)
    const octaveMultiplier = Math.pow(2, octave - 4);
    
    // Use price change to select note from scale
    const priceChange = Math.abs(crypto.price_change_percentage_24h);
    const intervals = scaleIntervals[scale] || scaleIntervals["major"];
    const noteIndex = Math.floor((priceChange / 10) * intervals.length) % intervals.length;
    const semitoneOffset = intervals[noteIndex];
    
    // Calculate final frequency
    const frequency = baseFreq * octaveMultiplier * Math.pow(2, semitoneOffset / 12);
    
    return Math.min(Math.max(frequency, 100), 2000);
  }

  // Create effect nodes with wet/dry mix
  createEffect(type: string) {
    if (!this.audioContext) return null;

    const inputNode = this.audioContext.createGain();
    const outputNode = this.audioContext.createGain();
    const wetNode = this.audioContext.createGain();
    const dryNode = this.audioContext.createGain();

    wetNode.gain.value = 0.5; // 50% wet by default
    dryNode.gain.value = 0.5; // 50% dry by default

    let effectNode: AudioNode;

    // Create specific effect nodes
    switch (type) {
      case "lpf":
      case "hpf":
      case "bandpass":
      case "resonant-filter":
        const filter = this.audioContext.createBiquadFilter();
        filter.type = type === "lpf" ? "lowpass" : type === "hpf" ? "highpass" : "bandpass";
        filter.frequency.value = 1000;
        filter.Q.value = 1;
        effectNode = filter;
        break;
      
      case "compressor":
        const compressor = this.audioContext.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 30;
        compressor.ratio.value = 12;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;
        effectNode = compressor;
        break;

      case "delay":
        const delay = this.audioContext.createDelay(2);
        delay.delayTime.value = 0.5;
        effectNode = delay;
        break;

      default:
        // For other effects, use a simple gain node as placeholder
        effectNode = this.audioContext.createGain();
    }

    // Wire up: input -> dry -> output
    inputNode.connect(dryNode);
    dryNode.connect(outputNode);

    // Wire up: input -> effect -> wet -> output
    inputNode.connect(effectNode);
    effectNode.connect(wetNode);
    wetNode.connect(outputNode);

    return { inputNode, outputNode, wetNode, dryNode, effectNode };
  }

  // Connect two nodes
  connectNodes(sourceNode: AudioNode, targetNode: AudioNode) {
    try {
      sourceNode.connect(targetNode);
    } catch (error) {
      console.error("Failed to connect nodes:", error);
    }
  }

  // Disconnect a node
  disconnectNode(node: AudioNode) {
    try {
      node.disconnect();
    } catch (error) {
      console.error("Failed to disconnect node:", error);
    }
  }

  setMasterVolume(volume: number) {
    if (this.masterGain) {
      this.masterGain.gain.value = volume;
    }
  }

  resume() {
    if (this.audioContext?.state === "suspended") {
      this.audioContext.resume();
    }
  }

  suspend() {
    if (this.audioContext?.state === "running") {
      this.audioContext.suspend();
    }
  }

  close() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.masterGain = null;
      this.nodeMap.clear();
    }
  }
}

export const audioEngine = new AudioEngine();
