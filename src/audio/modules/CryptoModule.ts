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
  private volume: number = 0.6; // Good balance for mixing
  private antiAliasFilter: BiquadFilterNode; // Phase 4: Anti-aliasing filter

  constructor(ctx: AudioContext, crypto: CryptoData) {
    super(ctx);
    this.crypto = crypto;
    
    // Create gain node for volume control
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0;
    
    // Phase 4: Add anti-aliasing filter (gentle low-pass at 18kHz)
    this.antiAliasFilter = ctx.createBiquadFilter();
    this.antiAliasFilter.type = 'lowpass';
    this.antiAliasFilter.frequency.value = 18000;
    this.antiAliasFilter.Q.value = 0.7071;
    
    // Set up audio chain: oscillator -> antiAlias -> gain -> output
    this.antiAliasFilter.connect(this.gainNode);
    
    this.inputNode = ctx.createGain(); // Not used for crypto, but required by base class
    this.outputNode = this.gainNode;
  }

  start() {
    if (this.oscillator) return; // Already playing

    this.oscillator = this.ctx.createOscillator();
    this.oscillator.type = this.waveform;
    this.oscillator.frequency.value = this.calculateFrequency();
    
    // Phase 3: Connect through anti-alias filter
    this.oscillator.connect(this.antiAliasFilter);
    
    // Phase 3: Smooth fade-in to prevent click (5ms)
    const now = this.ctx.currentTime;
    this.gainNode.gain.setValueAtTime(0, now);
    this.gainNode.gain.exponentialRampToValueAtTime(this.volume, now + 0.005);
    
    this.oscillator.start();
    this.isActive = true;
  }

  stop() {
    if (this.oscillator) {
      try {
        // Phase 3: Smooth fade-out to prevent click (5ms)
        const now = this.ctx.currentTime;
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.005);
        
        this.oscillator.stop(now + 0.005);
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
        // Phase 3: Use crossfade instead of stop/start to prevent clicks
        if (this.isActive && this.oscillator) {
          const now = this.ctx.currentTime;
          const crossfadeDuration = 0.005; // 5ms crossfade
          
          // Create new oscillator
          const newOsc = this.ctx.createOscillator();
          newOsc.type = value as OscillatorType;
          newOsc.frequency.value = this.oscillator.frequency.value;
          newOsc.connect(this.antiAliasFilter);
          
          // Crossfade
          this.gainNode.gain.setValueAtTime(this.volume, now);
          this.gainNode.gain.exponentialRampToValueAtTime(0.001, now + crossfadeDuration);
          
          newOsc.start(now);
          this.oscillator.stop(now + crossfadeDuration);
          
          setTimeout(() => {
            this.gainNode.gain.setValueAtTime(0.001, this.ctx.currentTime);
            this.gainNode.gain.exponentialRampToValueAtTime(this.volume, this.ctx.currentTime + crossfadeDuration);
          }, crossfadeDuration * 1000);
          
          this.oscillator = newOsc;
        }
        break;
      case "scale":
      case "rootNote":
      case "octave":
      case "pitch":
        // Phase 3: Use smooth frequency transition instead of restart
        if (name === "scale") this.scale = value;
        if (name === "rootNote") this.rootNote = value;
        if (name === "octave") this.octave = value;
        if (name === "pitch") this.pitch = value;
        
        if (this.isActive && this.oscillator) {
          const newFreq = this.calculateFrequency();
          const now = this.ctx.currentTime;
          this.oscillator.frequency.setValueAtTime(this.oscillator.frequency.value, now);
          this.oscillator.frequency.exponentialRampToValueAtTime(newFreq, now + 0.05); // 50ms glide
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
      // Phase 3: Smooth frequency transition
      const newFreq = this.calculateFrequency();
      const now = this.ctx.currentTime;
      this.oscillator.frequency.setValueAtTime(this.oscillator.frequency.value, now);
      this.oscillator.frequency.exponentialRampToValueAtTime(newFreq, now + 0.05);
    }
  }

  dispose() {
    this.stop();
    this.antiAliasFilter.disconnect();
    this.gainNode.disconnect();
    super.dispose();
  }
}
