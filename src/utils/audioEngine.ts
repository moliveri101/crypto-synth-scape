import { CryptoData } from "@/types/crypto";

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  initialize() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
      this.masterGain.gain.value = 0.5;
    }
  }

  createOscillator(crypto: CryptoData, waveform: OscillatorType = "sine") {
    if (!this.audioContext || !this.masterGain) return null;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    // Map price to frequency (logarithmic scale for better audible range)
    // Prices range widely, so we map to 200-800 Hz range
    const minFreq = 200;
    const maxFreq = 800;
    const logPrice = Math.log(crypto.current_price + 1);
    const frequency = minFreq + (logPrice / 15) * (maxFreq - minFreq);

    oscillator.type = waveform;
    oscillator.frequency.value = Math.min(Math.max(frequency, minFreq), maxFreq);

    // Map volume (normalized) to gain (0.1 to 0.5 range)
    const normalizedVolume = Math.min(crypto.total_volume / 1e10, 1);
    gainNode.gain.value = 0.1 + normalizedVolume * 0.4;

    oscillator.connect(gainNode);
    gainNode.connect(this.masterGain);

    return { oscillator, gainNode };
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
    }
  }
}

export const audioEngine = new AudioEngine();
