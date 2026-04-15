import { AudioModule } from "../base/AudioModule";
import { CryptoData } from "@/types/crypto";

const FREQ_RAMP_TIME = 0.05; // 50ms for smooth frequency glides

export class CryptoModule extends AudioModule {
  private oscL: OscillatorNode | null = null;
  private oscR: OscillatorNode | null = null;
  private merger: ChannelMergerNode | null = null;
  private masterGain: GainNode;

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

    this.masterGain = this.createStereoGain(0);
    this.masterGain.connect(this.outputNode);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start(): void {
    if (this.isActive) return;

    const freq = this.calculateFrequency();

    // Two oscillators slightly detuned for stereo width
    this.oscL = this.ctx.createOscillator();
    this.oscR = this.ctx.createOscillator();
    this.oscL.type = this.waveform;
    this.oscR.type = this.waveform;
    this.oscL.frequency.value = freq;
    this.oscR.frequency.value = freq;
    this.oscL.detune.value = -3;
    this.oscR.detune.value = 3;

    // Merge into true stereo: L osc -> channel 0, R osc -> channel 1
    // Note: ChannelMergerNode has fixed channelCount=1 per spec — do NOT call configureStereo
    this.merger = this.ctx.createChannelMerger(2);
    this.oscL.connect(this.merger, 0, 0);
    this.oscR.connect(this.merger, 0, 1);
    this.merger.connect(this.masterGain);

    this.oscL.start();
    this.oscR.start();

    this.rampGain(this.masterGain.gain, this.volume);
    this.isActive = true;
  }

  stop(): void {
    if (!this.isActive) return;

    // Fade out before stopping to avoid clicks
    this.rampGain(this.masterGain.gain, 0);

    const cleanup = () => {
      try {
        this.oscL?.stop();
        this.oscR?.stop();
      } catch {
        // already stopped
      }
      this.oscL?.disconnect();
      this.oscR?.disconnect();
      this.merger?.disconnect();
      this.oscL = null;
      this.oscR = null;
      this.merger = null;
    };

    // Allow the fade-out ramp to settle before tearing down
    setTimeout(cleanup, 30);
    this.isActive = false;
  }

  // ── Parameters ────────────────────────────────────────────────────────────

  setParameter(name: string, value: any): void {
    switch (name) {
      case "volume":
        this.volume = value;
        this.rampGain(this.masterGain.gain, value);
        break;

      case "waveform":
        this.waveform = value as OscillatorType;
        if (this.oscL) this.oscL.type = this.waveform;
        if (this.oscR) this.oscR.type = this.waveform;
        break;

      case "scale":
        this.scale = value;
        this.rampToCurrentFrequency();
        break;

      case "rootNote":
        this.rootNote = value;
        this.rampToCurrentFrequency();
        break;

      case "octave":
        this.octave = value;
        this.rampToCurrentFrequency();
        break;

      case "pitch":
        this.pitch = value;
        this.rampToCurrentFrequency();
        break;
    }
  }

  // ── Crypto data update ────────────────────────────────────────────────────

  updateCrypto(crypto: CryptoData): void {
    this.crypto = crypto;
    this.rampToCurrentFrequency();
  }

  /** Expose crypto data as normalized fields for downstream data consumers. */
  getDataOutput(): Record<string, number> {
    const c = this.crypto;
    const change = c.price_change_percentage_24h;
    return {
      price: Math.min(1, c.current_price / 100000),          // normalized to BTC-scale
      change_24h: (change + 100) / 200,                       // -100..+100 → 0..1
      volatility: Math.min(1, Math.abs(change) / 20),         // |change| / 20, capped at 1
      volume: Math.min(1, (c.total_volume || 0) / 1e11),      // normalized trade volume
      momentum: change >= 0 ? Math.min(1, change / 10) : 0,   // positive momentum 0..1
      bearish: change < 0 ? Math.min(1, Math.abs(change) / 10) : 0, // negative momentum 0..1
    };
  }

  // ── Frequency calculation ─────────────────────────────────────────────────

  private calculateFrequency(): number {
    const noteFreqs: Record<string, number> = {
      "C": 261.63, "C#": 277.18, "D": 293.66, "D#": 311.13,
      "E": 329.63, "F": 349.23, "F#": 369.99, "G": 392.00,
      "G#": 415.30, "A": 440.00, "A#": 466.16, "B": 493.88,
    };

    const scaleIntervals: Record<string, number[]> = {
      major: [0, 2, 4, 5, 7, 9, 11],
      minor: [0, 2, 3, 5, 7, 8, 10],
      pentatonic: [0, 2, 4, 7, 9],
      blues: [0, 3, 5, 6, 7, 10],
    };

    const baseFreq = noteFreqs[this.rootNote] || 261.63;
    const octaveMultiplier = Math.pow(2, this.octave - 4);

    const priceChange = Math.abs(this.crypto.price_change_percentage_24h);
    const intervals = scaleIntervals[this.scale] || scaleIntervals.major;
    const noteIndex = Math.floor((priceChange / 10) * intervals.length) % intervals.length;
    const semitoneOffset = intervals[noteIndex] + this.pitch;

    const frequency = baseFreq * octaveMultiplier * Math.pow(2, semitoneOffset / 12);
    // Clamp: >=1 Hz for exponentialRamp safety, <=2000 Hz for usable range
    return Math.min(Math.max(frequency, 1), 2000);
  }

  /**
   * Recalculate frequency from current state and ramp both oscillators.
   * Uses exponentialRampToValueAtTime for musical pitch glides.
   */
  private rampToCurrentFrequency(): void {
    if (!this.isActive || !this.oscL || !this.oscR) return;

    const freq = this.calculateFrequency();
    const t = this.ctx.currentTime + FREQ_RAMP_TIME;

    this.oscL.frequency.exponentialRampToValueAtTime(freq, t);
    this.oscR.frequency.exponentialRampToValueAtTime(freq, t);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  dispose(): void {
    this.stop();
    this.masterGain.disconnect();
    super.dispose();
  }
}
