import { AudioModule } from "../base/AudioModule";

// Lag / Smooth — one-pole low-pass filter on a data stream.
// Useful for smoothing jittery data sources (crypto, webcam RMS, etc.)
// before routing them into other modules.
//
// Inputs:
//   in-signal → the data to smooth (accepts any 0..1 field)
//   in-time   → modulate the smoothing time constant
// Output:
//   value (0..1) — smoothed signal.

export const LAG_KNOBS = ["time"] as const;
export type LagKnob = typeof LAG_KNOBS[number];

const TICK_MS = 1000 / 60;

export interface LagSnapshot {
  values: Record<LagKnob, number>;
  patched: Record<LagKnob, boolean>;
  input: number;
  output: number;
  history: number[];
}

export class LagModule extends AudioModule {
  private manual: Record<LagKnob, number> = { time: 0.3 };
  private modValues: Record<LagKnob, number | null> = { time: null };

  private input = 0.5;
  private output = 0.5;
  private history: number[] = new Array(200).fill(0.5);
  private historyWrite = 0;

  // index 0 = signal input, index 1 = time modulator
  private voiceInputs: GainNode[] = [];
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private onSnapshotUpdate: ((s: LagSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    this.voiceInputs = [this.createStereoGain(1), this.createStereoGain(1)];
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
  }

  getChannelInput(i: number): GainNode | null { return this.voiceInputs[i] ?? null; }
  getChannelCount(): number { return 2; }
  setChannelActive(i: number, has: boolean): void {
    if (!has) {
      if (i === 0) this.input = 0;
      if (i === 1) this.modValues.time = null;
      this.emit();
    }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if (name === "time") {
      this.manual.time = Number(value);
      this.emit();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const f = this.pickFieldName(data, sourceHandle);
    const v = f ? data[f] : undefined;
    if (typeof v !== "number") return;
    const clamped = Math.max(0, Math.min(1, v));
    if (targetHandle === "in-signal") {
      this.input = clamped;
    } else if (targetHandle === "in-time") {
      this.modValues.time = clamped;
    }
  }

  private pickFieldName(data: Record<string, number>, sourceHandle?: string): string | null {
    const m = sourceHandle?.match(/^out-(.+)$/);
    const hf = m?.[1];
    if (hf && hf !== "L" && hf !== "R" && hf !== "all" && hf in data) return hf;
    const keys = Object.keys(data);
    return keys[0] ?? null;
  }

  private effective(k: LagKnob): number {
    const m = this.modValues[k];
    return m === null ? this.manual[k] : m;
  }

  private tick(): void {
    // time knob 0..1 → tau 0.01..3 seconds (exponential)
    const t = this.effective("time");
    const tau = 0.01 * Math.pow(300, t);
    const dt = TICK_MS / 1000;
    const alpha = 1 - Math.exp(-dt / tau);
    this.output += (this.input - this.output) * alpha;
    this.history[this.historyWrite] = this.output;
    this.historyWrite = (this.historyWrite + 1) % this.history.length;
    this.emit();
  }

  getDataOutput(): Record<string, number> {
    return { value: this.output };
  }

  getSnapshot(): LagSnapshot {
    const values = { time: this.effective("time") };
    const patched = { time: this.modValues.time !== null };
    const n = this.history.length;
    const chrono = new Array(n);
    for (let i = 0; i < n; i++) chrono[i] = this.history[(this.historyWrite + i) % n];
    return { values, patched, input: this.input, output: this.output, history: chrono };
  }

  setOnSnapshotUpdate(cb: ((s: LagSnapshot) => void) | null): void {
    this.onSnapshotUpdate = cb;
  }
  private emit(): void { this.onSnapshotUpdate?.(this.getSnapshot()); }

  dispose(): void {
    this.stop();
    if (this.tickHandle !== null) clearInterval(this.tickHandle);
    this.tickHandle = null;
    this.onSnapshotUpdate = null;
    super.dispose();
  }
}
