import { AudioModule } from "../base/AudioModule";

// LFO — Low-Frequency Oscillator. Pure data source, no audio. Outputs a 0..1
// value on sine/triangle/saw/square at a user-set frequency. TouchDesigner's
// LFO CHOP is the inspiration.

export const LFO_KNOBS = [
  "frequency", // 0..1 → 0.01..20 Hz (exponential)
  "amplitude", // 0..1 — how far from center the wave swings
  "bias",      // 0..1 — center of the wave
  "phase",     // 0..1 → 0..2π offset
] as const;
export type LfoKnob = typeof LFO_KNOBS[number];

export const LFO_WAVEFORMS = ["sine", "triangle", "sawtooth", "square"] as const;
export type LfoWaveform = typeof LFO_WAVEFORMS[number];

const TICK_MS = 1000 / 60; // 60Hz UI update

export interface LfoSnapshot {
  values: Record<LfoKnob, number>;
  patched: Record<LfoKnob, boolean>;
  waveform: LfoWaveform;
  current: number; // current output value 0..1
  history: number[]; // recent values for the oscilloscope
}

export class LfoModule extends AudioModule {
  private manual: Record<LfoKnob, number> = {
    frequency: 0.3,  // ~1 Hz default
    amplitude: 0.5,
    bias: 0.5,
    phase: 0,
  };

  private modValues: Record<LfoKnob, number | null> = {
    frequency: null, amplitude: null, bias: null, phase: null,
  };

  private waveform: LfoWaveform = "sine";
  private phase = 0;                 // phase accumulator 0..1
  private currentValue = 0.5;
  private historyBuffer: number[] = new Array(200).fill(0.5);
  private historyWrite = 0;

  private voiceInputs: Record<LfoKnob, GainNode> = {} as any;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private onSnapshotUpdate: ((s: LfoSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (const k of LFO_KNOBS) {
      this.voiceInputs[k] = this.createStereoGain(1);
    }
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
  }

  getChannelInput(index: number): GainNode | null {
    const name = LFO_KNOBS[index];
    return name ? this.voiceInputs[name] : null;
  }
  getChannelCount(): number { return LFO_KNOBS.length; }

  setChannelActive(index: number, hasInput: boolean): void {
    const name = LFO_KNOBS[index];
    if (!name) return;
    if (!hasInput && name in this.modValues) {
      this.modValues[name] = null;
      this.emit();
    }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((LFO_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as LfoKnob] = Number(value);
      this.emit();
    } else if (name === "waveform") {
      if ((LFO_WAVEFORMS as readonly string[]).includes(value)) {
        this.waveform = value as LfoWaveform;
        this.emit();
      }
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const match = targetHandle?.match(/^in-(.+)$/);
    const knob = match?.[1] as LfoKnob | undefined;
    if (!knob || !(LFO_KNOBS as readonly string[]).includes(knob)) return;
    const fieldName = this.pickFieldName(data, sourceHandle);
    const value = fieldName ? data[fieldName] : undefined;
    if (typeof value !== "number") return;
    this.modValues[knob] = Math.max(0, Math.min(1, value));
    this.emit();
  }

  private pickFieldName(data: Record<string, number>, sourceHandle?: string): string | null {
    const match = sourceHandle?.match(/^out-(.+)$/);
    const handleField = match?.[1];
    if (handleField && handleField !== "L" && handleField !== "R" && handleField !== "all" && handleField in data) {
      return handleField;
    }
    const keys = Object.keys(data);
    return keys[0] ?? null;
  }

  private effective(knob: LfoKnob): number {
    const m = this.modValues[knob];
    return m === null ? this.manual[knob] : m;
  }

  // ── Tick — advance phase and emit current value ─────────────────────────

  private tick(): void {
    const freq01 = this.effective("frequency");
    // Exponential mapping: 0 → 0.01 Hz, 1 → 20 Hz
    const freqHz = 0.01 * Math.pow(2000, freq01);
    this.phase += freqHz * (TICK_MS / 1000);
    if (this.phase >= 1) this.phase -= Math.floor(this.phase);

    const p = (this.phase + this.effective("phase")) % 1;
    const amp = this.effective("amplitude");
    const bias = this.effective("bias");
    const shape = this.waveform;

    let wave: number;
    if (shape === "sine")          wave = Math.sin(p * Math.PI * 2) * 0.5 + 0.5;
    else if (shape === "triangle") wave = p < 0.5 ? p * 2 : (1 - p) * 2;
    else if (shape === "sawtooth") wave = p;
    else                           wave = p < 0.5 ? 1 : 0; // square

    // Centered around bias, scaled by amp, then clamped
    const centered = (wave - 0.5) * 2 * amp;
    this.currentValue = Math.max(0, Math.min(1, bias + centered));

    this.historyBuffer[this.historyWrite] = this.currentValue;
    this.historyWrite = (this.historyWrite + 1) % this.historyBuffer.length;

    this.emit();
  }

  // ── Data output ─────────────────────────────────────────────────────────

  getDataOutput(): Record<string, number> {
    return { value: this.currentValue };
  }

  // ── UI hooks ────────────────────────────────────────────────────────────

  getSnapshot(): LfoSnapshot {
    const values = {} as Record<LfoKnob, number>;
    const patched = {} as Record<LfoKnob, boolean>;
    for (const k of LFO_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    // Return history in chronological order (oldest first) for easy plotting
    const n = this.historyBuffer.length;
    const chrono = new Array(n);
    for (let i = 0; i < n; i++) {
      chrono[i] = this.historyBuffer[(this.historyWrite + i) % n];
    }
    return {
      values,
      patched,
      waveform: this.waveform,
      current: this.currentValue,
      history: chrono,
    };
  }

  setOnSnapshotUpdate(cb: ((s: LfoSnapshot) => void) | null): void {
    this.onSnapshotUpdate = cb;
  }

  private emit(): void {
    this.onSnapshotUpdate?.(this.getSnapshot());
  }

  dispose(): void {
    this.stop();
    if (this.tickHandle !== null) clearInterval(this.tickHandle);
    this.tickHandle = null;
    this.onSnapshotUpdate = null;
    super.dispose();
  }
}
