import { AudioModule } from "../base/AudioModule";

// Counter — increments on every rising edge of `in-trigger`, wraps at `steps`.
// Output is the current step / (steps - 1), so 0..1 across the sequence.
// Perfect companion to the Clock: patch Clock gate → Counter trigger → any
// translator's note input to sweep through a scale.
//
// Inputs:  in-trigger, in-steps, in-reset
// Output:  value (0..1 current step), step (integer-ish), phase (same as value)

export const COUNTER_KNOBS = ["steps"] as const;
export type CounterKnob = typeof COUNTER_KNOBS[number];

const TICK_MS = 1000 / 60;

export interface CounterSnapshot {
  values: Record<CounterKnob, number>;
  patched: Record<CounterKnob, boolean>;
  step: number;
  totalSteps: number;
  current: number; // 0..1
}

export class CounterModule extends AudioModule {
  private manual: Record<CounterKnob, number> = { steps: 0.25 }; // ~ 8 steps
  private modValues: Record<CounterKnob, number | null> = { steps: null };

  private step = 0;
  private prevTrigger = 0;
  private prevReset = 0;

  // 0 = trigger, 1 = steps, 2 = reset
  private voiceInputs: GainNode[] = [];
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private triggerLevel = 0;
  private resetLevel = 0;
  private onSnapshotUpdate: ((s: CounterSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (let i = 0; i < 3; i++) this.voiceInputs.push(this.createStereoGain(1));
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
  }

  getChannelInput(i: number): GainNode | null { return this.voiceInputs[i] ?? null; }
  getChannelCount(): number { return 3; }
  setChannelActive(i: number, has: boolean): void {
    if (!has) {
      if (i === 0) this.triggerLevel = 0;
      else if (i === 1) this.modValues.steps = null;
      else if (i === 2) this.resetLevel = 0;
      this.emit();
    }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if (name === "steps") {
      this.manual.steps = Number(value);
      this.emit();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const f = this.pickFieldName(data, sourceHandle);
    const v = f ? data[f] : undefined;
    if (typeof v !== "number") return;
    const clamped = Math.max(0, Math.min(1, v));
    if (targetHandle === "in-trigger") this.triggerLevel = clamped;
    else if (targetHandle === "in-steps") this.modValues.steps = clamped;
    else if (targetHandle === "in-reset") this.resetLevel = clamped;
  }

  private pickFieldName(data: Record<string, number>, sourceHandle?: string): string | null {
    const m = sourceHandle?.match(/^out-(.+)$/);
    const hf = m?.[1];
    if (hf && hf !== "L" && hf !== "R" && hf !== "all" && hf in data) return hf;
    const keys = Object.keys(data);
    return keys[0] ?? null;
  }

  private totalSteps(): number {
    const s = this.modValues.steps === null ? this.manual.steps : this.modValues.steps;
    return 2 + Math.floor(s * 30); // 2..32
  }

  private tick(): void {
    // Rising edge detection
    if (this.triggerLevel > 0.5 && this.prevTrigger <= 0.5) {
      this.step = (this.step + 1) % this.totalSteps();
    }
    if (this.resetLevel > 0.5 && this.prevReset <= 0.5) {
      this.step = 0;
    }
    this.prevTrigger = this.triggerLevel;
    this.prevReset = this.resetLevel;
    this.emit();
  }

  getDataOutput(): Record<string, number> {
    const total = this.totalSteps();
    const norm = total > 1 ? this.step / (total - 1) : 0;
    return { value: norm, step: this.step, phase: norm };
  }

  getSnapshot(): CounterSnapshot {
    const total = this.totalSteps();
    const norm = total > 1 ? this.step / (total - 1) : 0;
    return {
      values: { steps: this.modValues.steps ?? this.manual.steps },
      patched: { steps: this.modValues.steps !== null },
      step: this.step,
      totalSteps: total,
      current: norm,
    };
  }

  setOnSnapshotUpdate(cb: ((s: CounterSnapshot) => void) | null): void {
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
