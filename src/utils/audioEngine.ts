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
  createOscillator(crypto: CryptoData, waveform: OscillatorType = "sine") {
    if (!this.audioContext || !this.masterGain) return null;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    // Map price to frequency (logarithmic scale for better audible range)
    const minFreq = 200;
    const maxFreq = 800;
    const logPrice = Math.log(crypto.current_price + 1);
    const frequency = minFreq + (logPrice / 15) * (maxFreq - minFreq);

    oscillator.type = waveform;
    oscillator.frequency.value = Math.min(Math.max(frequency, minFreq), maxFreq);

    // Map volume (normalized) to gain
    const normalizedVolume = Math.min(crypto.total_volume / 1e10, 1);
    gainNode.gain.value = 0.1 + normalizedVolume * 0.4;

    // Connect oscillator to its gain node (but not to destination yet)
    oscillator.connect(gainNode);

    return { oscillator, gainNode };
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
