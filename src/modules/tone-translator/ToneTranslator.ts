import { AudioModule } from "../base/AudioModule";

export type Curve = "linear" | "exponential" | "logarithmic";

const RAMP_FAST = 0.05;

/**
 * Translates a single normalized data field (0..1) into a continuous tone.
 *
 * Maps value → frequency:
 *   linear:      f = base * 2^(value * range)
 *   exponential: f = base * 2^(value^2 * range)
 *   logarithmic: f = base * 2^(sqrt(value) * range)
 *
 * Volume, waveform, base frequency, and octave range are all user-controlled.
 * `smoothing` (seconds) controls how quickly the oscillator chases the data.
 */
export class ToneTranslator extends AudioModule {
  private osc: OscillatorNode;
  private toneGain: GainNode;
  private field: string | null = null;
  private waveform: OscillatorType = "sine";
  private baseFreq = 110;       // Hz at value=0
  private rangeOctaves = 3;     // value=1 corresponds to base * 2^range
  private curve: Curve = "linear";
  private volume = 0.5;
  private smoothing = 0.1;      // seconds
  private currentValue = 0;
  private lastDataPool: Record<string, number> = {};

  constructor(ctx: AudioContext) {
    super(ctx);

    this.toneGain = this.createStereoGain(0);
    this.toneGain.connect(this.outputNode);

    this.osc = ctx.createOscillator();
    this.osc.type = this.waveform;
    this.osc.frequency.value = this.baseFreq;
    this.osc.connect(this.toneGain);
    this.osc.start();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  start(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.toneGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.toneGain.gain.linearRampToValueAtTime(this.volume, this.ctx.currentTime + 0.05);
  }

  stop(): void {
    if (!this.isActive) return;
    this.isActive = false;
    this.toneGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.toneGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.05);
  }

  setParameter(name: string, value: any): void {
    switch (name) {
      case "field":
        this.field = value || null;
        this.applyFromCurrentPool();
        break;
      case "waveform":
        if (value === "sine" || value === "square" || value === "sawtooth" || value === "triangle") {
          this.waveform = value;
          this.osc.type = this.waveform;
        }
        break;
      case "baseFreq":
        this.baseFreq = Math.max(20, Math.min(8000, Number(value)));
        this.applyFrequency();
        break;
      case "rangeOctaves":
        this.rangeOctaves = Math.max(0, Math.min(8, Number(value)));
        this.applyFrequency();
        break;
      case "curve":
        if (value === "linear" || value === "exponential" || value === "logarithmic") {
          this.curve = value;
          this.applyFrequency();
        }
        break;
      case "volume":
        this.volume = Math.max(0, Math.min(1, Number(value)));
        if (this.isActive) {
          this.toneGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, RAMP_FAST);
        }
        break;
      case "smoothing":
        this.smoothing = Math.max(0.001, Math.min(5, Number(value)));
        break;
    }
  }

  // ── Data input ─────────────────────────────────────────────────────────

  onDataInput(data: Record<string, number>, _targetHandle?: string, sourceHandle?: string): void {
    this.lastDataPool = { ...this.lastDataPool, ...data };
    // Auto-select a field when none is set yet:
    //   1. Prefer the source handle's field name (e.g. "out-heart_rate" → "heart_rate")
    //   2. Fallback: if only one field is incoming, use that
    if (!this.field) {
      const match = sourceHandle?.match(/^out-(.+)$/);
      const handleField = match?.[1];
      if (handleField && handleField !== "L" && handleField !== "R" && handleField !== "all" && handleField in data) {
        this.field = handleField;
      } else {
        const keys = Object.keys(data);
        if (keys.length === 1) this.field = keys[0];
      }
    }
    this.applyFromCurrentPool();
  }

  private applyFromCurrentPool(): void {
    if (!this.field) return;
    const v = this.lastDataPool[this.field];
    if (typeof v !== "number") return;
    this.currentValue = Math.max(0, Math.min(1, v));
    this.applyFrequency();
  }

  private applyFrequency(): void {
    let curved: number;
    switch (this.curve) {
      case "exponential": curved = this.currentValue * this.currentValue; break;
      case "logarithmic": curved = Math.sqrt(this.currentValue); break;
      default:            curved = this.currentValue;
    }
    const freq = this.baseFreq * Math.pow(2, curved * this.rangeOctaves);
    this.osc.frequency.setTargetAtTime(
      Math.max(20, Math.min(20000, freq)),
      this.ctx.currentTime,
      this.smoothing,
    );
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  dispose(): void {
    this.stop();
    try { this.osc.stop(); this.osc.disconnect(); } catch { /* ok */ }
    try { this.toneGain.disconnect(); } catch { /* ok */ }
    super.dispose();
  }
}
