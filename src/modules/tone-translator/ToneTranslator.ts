import { AudioModule } from "../base/AudioModule";

export type Curve = "linear" | "exponential" | "logarithmic";

const RAMP_FAST = 0.05;

/**
 * Translates a single normalized data field (0..1) into a continuous tone.
 *
 * Mapping: value → frequency (linear / exponential / logarithmic curve)
 *
 * Per-control input handles: the primary `note` input drives the pitch value,
 * while `baseFreq`, `range`, `volume`, and `glide` can each be driven by their
 * own data stream. Unpatched controls keep their manual slider value.
 */
export class ToneTranslator extends AudioModule {
  private osc: OscillatorNode;
  private toneGain: GainNode;

  private field: string | null = null;
  private waveform: OscillatorType = "sine";
  private baseFreq = 110;
  private rangeOctaves = 3;
  private curve: Curve = "linear";
  private volume = 0.5;
  private smoothing = 0.1;
  private currentValue = 0;
  private lastDataPool: Record<string, number> = {};

  // Modulation values per control, populated when a patch cord delivers data
  // to the control's input handle. null = unpatched (manual slider wins).
  private modValues: {
    baseFreq: number | null;
    range: number | null;
    volume: number | null;
    glide: number | null;
  } = { baseFreq: null, range: null, volume: null, glide: null };

  // Per-control input sinks — silent audio GainNodes so the AudioRouter has
  // a legal target to connect to. The data path (onDataInput) is independent.
  private voiceInputs: Record<string, GainNode> = {};

  // Names of the per-control inputs in the order they appear in the UI
  static readonly INPUT_CONTROLS = ["note", "baseFreq", "range", "volume", "glide"] as const;

  constructor(ctx: AudioContext) {
    super(ctx);

    this.toneGain = this.createStereoGain(0);
    this.toneGain.connect(this.outputNode);

    this.osc = ctx.createOscillator();
    this.osc.type = this.waveform;
    this.osc.frequency.value = this.baseFreq;
    this.osc.connect(this.toneGain);
    this.osc.start();

    // Build one silent input GainNode per control
    for (const name of ToneTranslator.INPUT_CONTROLS) {
      this.voiceInputs[name] = this.createStereoGain(1);
    }
  }

  // ── Per-voice input API (for AudioRouter) ─────────────────────────────────

  getChannelInput(index: number): GainNode | null {
    const name = ToneTranslator.INPUT_CONTROLS[index];
    return name ? this.voiceInputs[name] : null;
  }

  getChannelCount(): number {
    return ToneTranslator.INPUT_CONTROLS.length;
  }

  /** Clear a control's modulation value when its input edge disconnects. */
  setChannelActive(index: number, hasInput: boolean): void {
    const name = ToneTranslator.INPUT_CONTROLS[index];
    if (!name || name === "note") return;
    if (!hasInput && name in this.modValues) {
      (this.modValues as Record<string, number | null>)[name] = null;
      this.applyFrequency();
      this.applyVolume();
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  start(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.toneGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.toneGain.gain.linearRampToValueAtTime(this.effectiveVolume(), this.ctx.currentTime + 0.05);
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
        this.applyVolume();
        break;
      case "smoothing":
        this.smoothing = Math.max(0.001, Math.min(5, Number(value)));
        break;
    }
  }

  // ── Data input ─────────────────────────────────────────────────────────

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    this.lastDataPool = { ...this.lastDataPool, ...data };

    // Determine which field in the incoming data this cable carries
    const fieldName = this.pickFieldName(data, sourceHandle);
    const value = fieldName ? data[fieldName] : undefined;
    if (typeof value !== "number") return;
    const normalized = Math.max(0, Math.min(1, value));

    // Route to the control determined by the target handle
    const match = targetHandle?.match(/^in-(.+)$/);
    const control = match?.[1];

    switch (control) {
      case "note":
        this.currentValue = normalized;
        if (fieldName && !this.field) this.field = fieldName;
        break;
      case "baseFreq":
      case "range":
      case "volume":
      case "glide":
        (this.modValues as Record<string, number | null>)[control] = normalized;
        break;
      default:
        // Unknown / legacy handle → treat as primary note drive
        this.currentValue = normalized;
        if (fieldName && !this.field) this.field = fieldName;
    }

    this.applyFrequency();
    this.applyVolume();
  }

  /** Choose which key of the incoming data object to consume. */
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

  private applyFromCurrentPool(): void {
    if (!this.field) return;
    const v = this.lastDataPool[this.field];
    if (typeof v !== "number") return;
    this.currentValue = Math.max(0, Math.min(1, v));
    this.applyFrequency();
  }

  // ── Effective (modulated) values ──────────────────────────────────────────

  private effectiveBaseFreq(): number {
    const m = this.modValues.baseFreq;
    // 0..1 → 20..2000 Hz (log-ish via octaves)
    return m !== null ? 20 * Math.pow(2, m * 6.6) : this.baseFreq;
  }

  private effectiveRange(): number {
    const m = this.modValues.range;
    // 0..1 → 0..8 octaves
    return m !== null ? m * 8 : this.rangeOctaves;
  }

  private effectiveVolume(): number {
    const m = this.modValues.volume;
    return m !== null ? m : this.volume;
  }

  private effectiveGlide(): number {
    const m = this.modValues.glide;
    // 0..1 → 0.001..2 seconds
    return m !== null ? 0.001 + m * 1.999 : this.smoothing;
  }

  getModValues() {
    return {
      ...this.modValues,
      note: this.currentValue,
    };
  }

  private onModUpdate: (() => void) | null = null;
  setOnModUpdate(cb: (() => void) | null): void { this.onModUpdate = cb; }

  // ── Frequency / volume application ────────────────────────────────────────

  private applyVolume(): void {
    // Apply audio change only when playing, but always notify the UI so the
    // sliders animate even when the module is idle.
    if (this.isActive) {
      this.toneGain.gain.setTargetAtTime(this.effectiveVolume(), this.ctx.currentTime, RAMP_FAST);
    }
    this.onModUpdate?.();
  }

  private applyFrequency(): void {
    let curved: number;
    switch (this.curve) {
      case "exponential": curved = this.currentValue * this.currentValue; break;
      case "logarithmic": curved = Math.sqrt(this.currentValue); break;
      default:            curved = this.currentValue;
    }
    const freq = this.effectiveBaseFreq() * Math.pow(2, curved * this.effectiveRange());
    this.osc.frequency.setTargetAtTime(
      Math.max(20, Math.min(20000, freq)),
      this.ctx.currentTime,
      this.effectiveGlide(),
    );
    this.onModUpdate?.();
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  dispose(): void {
    this.stop();
    try { this.osc.stop(); this.osc.disconnect(); } catch { /* ok */ }
    try { this.toneGain.disconnect(); } catch { /* ok */ }
    super.dispose();
  }
}
