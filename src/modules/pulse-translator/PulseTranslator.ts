import { AudioModule } from "../base/AudioModule";

export type TriggerMode = "threshold" | "rate" | "onChange";

/**
 * Translates a normalized data field (0..1) into discrete audio pulses.
 *
 * Modes:
 *   threshold — fires once each time the value crosses `level` going UP
 *   rate      — fires repeatedly at `maxRate * value` pulses/sec while data is flowing
 *   onChange  — fires when |value - lastValue| > `delta`
 *
 * Pulse: short sine burst with envelope. pitch / decay / volume are user-set.
 * Route the output to a Drum Machine voice input or directly to a Mixer.
 */
export class PulseTranslator extends AudioModule {
  private field: string | null = null;
  private mode: TriggerMode = "threshold";
  private threshold = 0.5;     // for threshold mode
  private delta = 0.1;         // for on-change mode
  private maxRate = 8;         // for rate mode (pulses/sec at value=1)
  private pitch = 100;         // pulse pitch in Hz
  private decay = 0.1;         // pulse decay in seconds
  private volume = 0.7;

  private lastValue = 0;
  private currentValue = 0;
  private rateNextTime = 0;
  private rateTimerHandle: ReturnType<typeof setInterval> | null = null;
  private lastDataPool: Record<string, number> = {};

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  start(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.rateNextTime = this.ctx.currentTime + 0.05;

    // For rate mode, run a scheduler loop
    if (this.rateTimerHandle === null) {
      this.rateTimerHandle = setInterval(() => this.scheduleRatePulses(), 25);
    }
  }

  stop(): void {
    if (!this.isActive) return;
    this.isActive = false;
    if (this.rateTimerHandle !== null) {
      clearInterval(this.rateTimerHandle);
      this.rateTimerHandle = null;
    }
  }

  setParameter(name: string, value: any): void {
    switch (name) {
      case "field":
        this.field = value || null;
        // Reset edge-detection state when field changes
        this.lastValue = 0;
        this.applyFromCurrentPool();
        break;
      case "mode":
        if (value === "threshold" || value === "rate" || value === "onChange") {
          this.mode = value;
        }
        break;
      case "threshold":
        this.threshold = Math.max(0, Math.min(1, Number(value)));
        break;
      case "delta":
        this.delta = Math.max(0.001, Math.min(1, Number(value)));
        break;
      case "maxRate":
        this.maxRate = Math.max(0.1, Math.min(50, Number(value)));
        break;
      case "pitch":
        this.pitch = Math.max(20, Math.min(8000, Number(value)));
        break;
      case "decay":
        this.decay = Math.max(0.01, Math.min(2, Number(value)));
        break;
      case "volume":
        this.volume = Math.max(0, Math.min(1, Number(value)));
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
    const prev = this.currentValue;
    this.currentValue = Math.max(0, Math.min(1, v));

    if (!this.isActive) {
      this.lastValue = this.currentValue;
      return;
    }

    // Threshold mode: rising-edge detection
    if (this.mode === "threshold") {
      if (this.lastValue < this.threshold && this.currentValue >= this.threshold) {
        this.emitPulse(this.currentValue);
      }
    }
    // On-change mode: emit when the value moved more than delta in either direction
    else if (this.mode === "onChange") {
      if (Math.abs(this.currentValue - this.lastValue) >= this.delta) {
        this.emitPulse(this.currentValue);
      }
    }
    // Rate mode is handled by the scheduler — no per-update fire
    // but we still update lastValue below

    this.lastValue = prev; // keep prev as last for edge detection (avoid double-fires from same data)
    this.lastValue = this.currentValue;
  }

  // ── Rate-mode scheduler ────────────────────────────────────────────────

  private scheduleRatePulses(): void {
    if (this.mode !== "rate" || !this.isActive) return;
    if (this.currentValue <= 0.001) return;

    const ctx = this.ctx;
    const horizon = ctx.currentTime + 0.1;
    const interval = 1 / (this.maxRate * this.currentValue);
    while (this.rateNextTime < horizon) {
      this.emitPulseAt(this.rateNextTime, this.currentValue);
      this.rateNextTime += interval;
    }
    // If rateNextTime drifted far behind (e.g. value just rose), reset
    if (this.rateNextTime < ctx.currentTime - 0.5) {
      this.rateNextTime = ctx.currentTime + 0.05;
    }
  }

  // ── Pulse generator ────────────────────────────────────────────────────

  private emitPulse(velocity: number): void {
    this.emitPulseAt(this.ctx.currentTime, velocity);
  }

  private emitPulseAt(time: number, velocity: number): void {
    const ctx = this.ctx;
    if (ctx.state === "closed") return;

    const peak = this.volume * Math.max(0.1, velocity);
    const osc = ctx.createOscillator();
    const env = this.createStereoGain(0);
    osc.type = "sine";
    osc.frequency.setValueAtTime(this.pitch, time);
    // Slight pitch sweep for character
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, this.pitch * 0.6), time + this.decay);

    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(peak, time + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, time + this.decay);

    osc.connect(env);
    env.connect(this.outputNode);
    osc.start(time);
    osc.stop(time + this.decay + 0.02);
  }

  // Action for manual test from UI
  handleAction(action: string, _payload?: any): Record<string, any> | void {
    if (action === "triggerPulse") {
      this.emitPulse(0.8);
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  dispose(): void {
    this.stop();
    super.dispose();
  }
}
