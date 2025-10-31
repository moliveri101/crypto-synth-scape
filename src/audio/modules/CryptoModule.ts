import { AudioModule } from "../AudioModule";
import { CryptoData } from "@/types/crypto";

export class CryptoModule extends AudioModule {
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode;
  private crypto: CryptoData;
  private waveform: OscillatorType = "sine";
  private scale: string = "major";
  private rootNote: string = "C";
  private octave: number = 4;
  private pitch: number = 0;
  private volume: number = 1.0;

  constructor(ctx: AudioContext, crypto: CryptoData) {
    super(ctx);
    this.crypto = crypto;
    
    // Create gain node for volume control
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0;
    
    // Set up audio chain
    this.inputNode = ctx.createGain(); // Not used for crypto, but required by base class
    this.outputNode = this.gainNode;
  }

  start() {
    if (this.oscillator) return; // Already playing

    this.oscillator = this.ctx.createOscillator();
    this.oscillator.type = this.waveform;
    this.oscillator.frequency.value = this.calculateFrequency();
    this.oscillator.connect(this.gainNode);
    this.gainNode.gain.value = this.volume;
    this.oscillator.start();
    this.isActive = true;
  }

  stop() {
    if (this.oscillator) {
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
      } catch (e) {
        console.error("Error stopping oscillator:", e);
      }
      this.oscillator = null;
    }
    this.isActive = false;
  }

  setParameter(name: string, value: any) {
    switch (name) {
      case "volume":
        this.volume = value;
        this.gainNode.gain.value = value;
        break;
      case "waveform":
        this.waveform = value as OscillatorType;
        // Need to restart oscillator for waveform change
        if (this.isActive) {
          this.stop();
          this.start();
        }
        break;
      case "scale":
        this.scale = value;
        if (this.isActive) {
          this.stop();
          this.start();
        }
        break;
      case "rootNote":
        this.rootNote = value;
        if (this.isActive) {
          this.stop();
          this.start();
        }
        break;
      case "octave":
        this.octave = value;
        if (this.isActive) {
          this.stop();
          this.start();
        }
        break;
      case "pitch":
        this.pitch = value;
        if (this.isActive) {
          this.stop();
          this.start();
        }
        break;
    }
  }

  private calculateFrequency(): number {
    const noteFreqs: Record<string, number> = {
      "C": 261.63, "C#": 277.18, "D": 293.66, "D#": 311.13,
      "E": 329.63, "F": 349.23, "F#": 369.99, "G": 392.00,
      "G#": 415.30, "A": 440.00, "A#": 466.16, "B": 493.88
    };

    const scaleIntervals: Record<string, number[]> = {
      "major": [0, 2, 4, 5, 7, 9, 11],
      "minor": [0, 2, 3, 5, 7, 8, 10],
      "pentatonic": [0, 2, 4, 7, 9],
      "blues": [0, 3, 5, 6, 7, 10]
    };

    const baseFreq = noteFreqs[this.rootNote] || 261.63;
    const octaveMultiplier = Math.pow(2, this.octave - 4);
    
    const priceChange = Math.abs(this.crypto.price_change_percentage_24h);
    const intervals = scaleIntervals[this.scale] || scaleIntervals["major"];
    const noteIndex = Math.floor((priceChange / 10) * intervals.length) % intervals.length;
    const semitoneOffset = intervals[noteIndex] + this.pitch;
    
    const frequency = baseFreq * octaveMultiplier * Math.pow(2, semitoneOffset / 12);
    return Math.min(Math.max(frequency, 100), 2000);
  }

  updateCrypto(crypto: CryptoData) {
    this.crypto = crypto;
    if (this.isActive && this.oscillator) {
      this.oscillator.frequency.value = this.calculateFrequency();
    }
  }
}
