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
    octave: number = 4,
    pitchOffset: number = 0
  ) {
    if (!this.audioContext || !this.masterGain) return null;

    const gainNode = this.audioContext.createGain();
    // Volume is controlled externally by module UI
    gainNode.gain.value = 0;

    // Standard oscillator
    const oscillator = this.audioContext.createOscillator();
    const frequency = this.calculateFrequency(crypto, scale, rootNote, octave, pitchOffset);
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
    drumType: "kick" | "snare" | "hihat" | "clap" |
      "tom" | "low-tom" | "mid-tom" | "high-tom" |
      "cowbell" | "ride" | "crash" | "shaker" |
      "clave" | "rim" | "rimshot" | "bongo" | "conga",
    outputNode: GainNode | null,
    volume: number = 0.8,
    pitchOffset: number = 0
  ) {
    if (!this.audioContext || !this.masterGain) return;

    // Use masterGain if outputNode is null or from wrong context
    let targetNode: AudioNode = this.masterGain;
    if (outputNode) {
      try {
        // Check if outputNode belongs to the same context
        if (outputNode.context === this.audioContext) {
          targetNode = outputNode;
        }
      } catch (e) {
        // If checking fails, just use masterGain
        console.warn("OutputNode context mismatch, using masterGain");
      }
    }

    const now = this.audioContext.currentTime;
    const pitchMultiplier = Math.pow(2, pitchOffset / 12);

    const env = this.audioContext.createGain();
    env.connect(targetNode);

    const startOsc = (type: OscillatorType, freq: number, decay: number) => {
      const osc = this.audioContext!.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq * pitchMultiplier, now);
      osc.connect(env);
      env.gain.setValueAtTime(volume, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + decay);
      osc.start(now);
      osc.stop(now + decay);
    };

    const startNoise = (decay: number, filterType?: BiquadFilterType, freq?: number, q: number = 1) => {
      const noiseBuf = this.createNoiseBuffer();
      if (!noiseBuf) return;
      const src = this.audioContext!.createBufferSource();
      src.buffer = noiseBuf;
      let node: AudioNode = src;
      if (filterType) {
        const filt = this.audioContext!.createBiquadFilter();
        filt.type = filterType;
        if (freq) filt.frequency.value = freq;
        filt.Q.value = q;
        src.connect(filt);
        node = filt;
      }
      node.connect(env);
      env.gain.setValueAtTime(volume, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + decay);
      src.start(now);
      src.stop(now + decay);
    };

    switch (drumType) {
      case "kick":
        {
          const osc = this.audioContext.createOscillator();
          const g = this.audioContext.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(150 * pitchMultiplier, now);
          osc.frequency.exponentialRampToValueAtTime(40 * pitchMultiplier, now + 0.5);
          g.gain.setValueAtTime(volume, now);
          g.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
          osc.connect(g);
          g.connect(targetNode);
          osc.start(now);
          osc.stop(now + 0.5);
        }
        break;

      case "snare":
        startOsc("triangle", 200, 0.2);
        startNoise(0.2, "highpass", 1000, 0.7);
        break;

      case "hihat":
        startNoise(0.1, "highpass", 8000, 0.8);
        break;

      case "clap":
        startNoise(0.15, "bandpass", 2000, 0.5);
        break;

      case "low-tom":
        startOsc("sine", 120, 0.35);
        break;
      case "mid-tom":
        startOsc("sine", 180, 0.3);
        break;
      case "high-tom":
        startOsc("sine", 260, 0.25);
        break;
      case "tom":
        startOsc("sine", 200, 0.3);
        break;

      case "cowbell":
        {
          const o1 = this.audioContext.createOscillator();
          const o2 = this.audioContext.createOscillator();
          const g = this.audioContext.createGain();
          o1.type = "square";
          o2.type = "square";
          o1.frequency.value = 540 * pitchMultiplier;
          o2.frequency.value = 800 * pitchMultiplier;
          g.gain.setValueAtTime(volume, now);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
          o1.connect(g);
          o2.connect(g);
          g.connect(targetNode);
          o1.start(now);
          o2.start(now);
          o1.stop(now + 0.25);
          o2.stop(now + 0.25);
        }
        break;

      case "ride":
        startNoise(0.8, "highpass", 6000, 0.7);
        break;

      case "crash":
        startNoise(1.2, "highpass", 5000, 0.7);
        break;

      case "shaker":
        startNoise(0.2, "bandpass", 4000, 1);
        break;

      case "clave":
      case "rim":
      case "rimshot":
        startOsc("square", 2000, 0.08);
        break;

      case "bongo":
        startOsc("sine", 300, 0.18);
        break;
      case "conga":
        startOsc("sine", 240, 0.25);
        break;
    }
  }

  private calculateFrequency(
    crypto: CryptoData,
    scale: string,
    rootNote: string,
    octave: number,
    pitchOffset: number = 0
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
    const semitoneOffset = intervals[noteIndex] + pitchOffset;
    
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
