import { AudioModule } from "../base/AudioModule";

export type TriggerMode = "threshold" | "rate" | "onChange";

/**
 * Translates a normalized data field (0..1) into discrete audio pulses.
 *
 * Per-control input handles: `trigger` is the primary signal; threshold,
 * delta, maxRate, pitch, decay, and volume can each be patched.
 *
 * Modes:
 *   threshold — fires once each time the value crosses `level` going UP
 *   rate      — fires repeatedly at `maxRate * value` pulses/sec while data is flowing
 *   onChange  — fires when |value - lastValue| > `delta`
 */
export class PulseTranslator extends AudioModule {
  private field: string | null = null;
  private mode: TriggerMode = "threshold";
  private threshold = 0.5;
  private delta = 0.1;
  private maxRate = 8;
  private pitch = 100;
  private decay = 0.1;
  private volume = 0.7;

  private lastValue = 0;
  private currentValue = 0;
  private rateNextTime = 0;
  private rateTimerHandle: ReturnType<typeof setInterval> | null = null;
  private lastDataPool: Record<string, number> = {};

  // Modulation values — one per patchable control
  private modValues: {
    threshold: number | null;
    delta: number | null;
    maxRate: number | null;
    pitch: number | null;
    decay: number | null;
    volume: number | null;
  } = { threshold: null, delta: null, maxRate: null, pitch: null, decay: null, volume: null };

  private voiceInputs: Record<string, GainNode> = {};

  // Ordered input-control names matching PULSE_INPUTS in index.ts
  static readonly INPUT_CONTROLS = [
    "trigger", "threshold", "delta", "maxRate", "pitch", "decay", "volume",
  ] as const;

  private onModUpdate: (() => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (const name of PulseTranslator.INPUT_CONTROLS) {
      this.voiceInputs[name] = this.createStereoGain(1);
    }
  }

  // ── Per-voice input API ─────────────────────────────────────────────────

  getChannelInput(index: number): GainNode | null {
    const name = PulseTranslator.INPUT_CONTROLS[index];
    return name ? this.voiceInputs[name] : null;
  }

  getChannelCount(): number {
    return PulseTranslator.INPUT_CONTROLS.length;
  }

  setChannelActive(index: number, hasInput: boolean): void {
    const name = PulseTranslator.INPUT_CONTROLS[index];
    if (!name || name === "trigger") return;
    if (!hasInput && name in this.modValues) {
      (this.modValues as Record<string, number | null>)[name] = null;
      this.onModUpdate?.();
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  start(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.rateNextTime = this.ctx.currentTime + 0.05;

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

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    this.lastDataPool = { ...this.lastDataPool, ...data };

    const fieldName = this.pickFieldName(data, sourceHandle);
    const value = fieldName ? data[fieldName] : undefined;
    if (typeof value !== "number") return;
    const normalized = Math.max(0, Math.min(1, value));

    const match = targetHandle?.match(/^in-(.+)$/);
    const control = match?.[1];

    switch (control) {
      case "trigger":
        this.updateTriggerValue(normalized);
        if (fieldName && !this.field) this.field = fieldName;
        break;
      case "threshold":
      case "delta":
      case "maxRate":
      case "pitch":
      case "decay":
      case "volume":
        (this.modValues as Record<string, number | null>)[control] = normalized;
        this.onModUpdate?.();
        break;
      default:
        this.updateTriggerValue(normalized);
        if (fieldName && !this.field) this.field = fieldName;
    }
  }

  private pickFieldName(data: Record<string, number>, sourceHandle?: string): string | null {
    const match = sourceHandle?.match(/^out-(.+)$/);
    const handleField = match?.[1];
    if (handleField && handleField !== "L" && handleField !== "R" && handleField !== "all" && handleField in data) {
      return handleField;
    }
    const keys = Object.keys(data);
    if (keys.length === 1) return keys[0];
    if (this.field && this.field in data) return this.field;
    return keys[0] ?? null;
  }

  private updateTriggerValue(normalized: number): void {
    const prev = this.currentValue;
    this.currentValue = normalized;

    if (!this.isActive) {
      this.lastValue = this.currentValue;
      this.onModUpdate?.();
      return;
    }

    if (this.mode === "threshold") {
      if (this.lastValue < this.effectiveThreshold() && this.currentValue >= this.effectiveThreshold()) {
        this.emitPulse(this.currentValue);
      }
    } else if (this.mode === "onChange") {
      if (Math.abs(this.currentValue - this.lastValue) >= this.effectiveDelta()) {
        this.emitPulse(this.currentValue);
      }
    }

    this.lastValue = prev;
    this.lastValue = this.currentValue;
    this.onModUpdate?.();
  }

  private applyFromCurrentPool(): void {
    if (!this.field) return;
    const v = this.lastDataPool[this.field];
    if (typeof v !== "number") return;
    this.updateTriggerValue(Math.max(0, Math.min(1, v)));
  }

  // ── Effective values (manual or modulated) ────────────────────────────────

  private effectiveThreshold(): number {
    const m = this.modValues.threshold;
    return m !== null ? m : this.threshold;
  }
  private effectiveDelta(): number {
    const m = this.modValues.delta;
    return m !== null ? 0.001 + m * 0.999 : this.delta;
  }
  private effectiveMaxRate(): number {
    const m = this.modValues.maxRate;
    return m !== null ? 0.1 + m * 49.9 : this.maxRate;
  }
  private effectivePitch(): number {
    const m = this.modValues.pitch;
    return m !== null ? 20 * Math.pow(2, m * 8.6) : this.pitch;
  }
  private effectiveDecay(): number {
    const m = this.modValues.decay;
    return m !== null ? 0.01 + m * 1.99 : this.decay;
  }
  private effectiveVolume(): number {
    const m = this.modValues.volume;
    return m !== null ? m : this.volume;
  }

  getModValues() {
    return {
      ...this.modValues,
      trigger: this.currentValue,
    };
  }

  setOnModUpdate(cb: (() => void) | null): void { this.onModUpdate = cb; }

  // ── Rate-mode scheduler ────────────────────────────────────────────────

  private scheduleRatePulses(): void {
    if (this.mode !== "rate" || !this.isActive) return;
    if (this.currentValue <= 0.001) return;

    const ctx = this.ctx;
    const horizon = ctx.currentTime + 0.1;
    const interval = 1 / (this.effectiveMaxRate() * this.currentValue);
    while (this.rateNextTime < horizon) {
      this.emitPulseAt(this.rateNextTime, this.currentValue);
      this.rateNextTime += interval;
    }
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

    const peak = this.effectiveVolume() * Math.max(0.1, velocity);
    const pitch = this.effectivePitch();
    const decay = this.effectiveDecay();
    const osc = ctx.createOscillator();
    const env = this.createStereoGain(0);
    osc.type = "sine";
    osc.frequency.setValueAtTime(pitch, time);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, pitch * 0.6), time + decay);

    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(peak, time + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, time + decay);

    osc.connect(env);
    env.connect(this.outputNode);
    osc.start(time);
    osc.stop(time + decay + 0.02);
  }

  handleAction(action: string, _payload?: any): Record<string, any> | void {
    if (action === "triggerPulse") {
      this.emitPulse(0.8);
    }
  }

  dispose(): void {
    this.stop();
    super.dispose();
  }
}
