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

    const gainNode = this.audioContext.createGain();
    const normalizedVolume = Math.min(crypto.total_volume / 1e10, 1);
    gainNode.gain.value = 0.1 + normalizedVolume * 0.4;

    // Standard oscillator
    const oscillator = this.audioContext.createOscillator();
    const frequency = this.calculateFrequency(crypto, scale, rootNote, octave);
    oscillator.type = waveform;
    oscillator.frequency.value = frequency;
    oscillator.connect(gainNode);

    return { oscillator, gainNode };
  }

  // Create noise buffer for snare/clap
  private createNoiseBuffer() {
    if (!this.audioContext) return null;
    const bufferSize = this.audioContext.sampleRate * 0.5;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // Trigger a drum sound (for drum machine)
  triggerDrum(
    drumType: "kick" | "snare" | "hihat" | "clap",
    outputNode: GainNode,
    volume: number = 0.8,
    pitchOffset: number = 0
  ) {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const oscillator = this.audioContext.createOscillator();
    const gainEnvelope = this.audioContext.createGain();
    
    gainEnvelope.connect(outputNode);
    
    const pitchMultiplier = Math.pow(2, pitchOffset / 12);
    
    switch (drumType) {
      case "kick":
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(150 * pitchMultiplier, now);
        oscillator.frequency.exponentialRampToValueAtTime(40 * pitchMultiplier, now + 0.5);
        gainEnvelope.gain.setValueAtTime(volume, now);
        gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        oscillator.connect(gainEnvelope);
        oscillator.start(now);
        oscillator.stop(now + 0.5);
        break;
        
      case "snare":
        oscillator.type = "triangle";
        oscillator.frequency.value = 200 * pitchMultiplier;
        // Add noise
        const snareNoise = this.createNoiseBuffer();
        if (snareNoise) {
          const noiseSource = this.audioContext.createBufferSource();
          const noiseGain = this.audioContext.createGain();
          noiseSource.buffer = snareNoise;
          noiseSource.connect(noiseGain);
          noiseGain.connect(outputNode);
          noiseGain.gain.setValueAtTime(volume * 0.3, now);
          noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
          noiseSource.start(now);
          noiseSource.stop(now + 0.2);
        }
        gainEnvelope.gain.setValueAtTime(volume * 0.4, now);
        gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        oscillator.connect(gainEnvelope);
        oscillator.start(now);
        oscillator.stop(now + 0.2);
        break;
        
      case "hihat":
        oscillator.type = "square";
        oscillator.frequency.value = 10000 * pitchMultiplier;
        gainEnvelope.gain.setValueAtTime(volume * 0.3, now);
        gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        oscillator.connect(gainEnvelope);
        oscillator.start(now);
        oscillator.stop(now + 0.1);
        break;
        
      case "clap":
        const clapNoise = this.createNoiseBuffer();
        if (clapNoise) {
          const clapSource = this.audioContext.createBufferSource();
          clapSource.buffer = clapNoise;
          clapSource.connect(gainEnvelope);
          gainEnvelope.gain.setValueAtTime(volume * 0.5, now);
          gainEnvelope.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
          clapSource.start(now);
          clapSource.stop(now + 0.15);
        }
        break;
    }
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
