import { AudioModule } from "../base/AudioModule";

// Trigger — turns a continuous 0..1 stream into a short gate pulse whenever
// the signal crosses the threshold from below. Useful for converting
// data-source values (e.g. earthquake magnitude, crypto volatility spikes)
// into clock-like triggers for Envelopes or the Pulse Translator.
//
// Inputs:  in-signal, in-threshold, in-length
// Output:  value (0 or 1) — high for `length` seconds after each rising edge.

export const TRIGGER_KNOBS = ["threshold", "length"] as const;
export type TriggerKnob = typeof TRIGGER_KNOBS[number];

const TICK_MS = 1000 / 60;

export interface TriggerSnapshot {
  values: Record<TriggerKnob, number>;
  patched: Record<TriggerKnob, boolean>;
  signal: number;
  out: number;
  fireCount: number;
}

export class TriggerModule extends AudioModule {
  private manual: Record<TriggerKnob, number> = { threshold: 0.5, length: 0.1 };
  private modValues: Record<TriggerKnob, number | null> = { threshold: null, length: null };

  private signal = 0;
  private prevSignal = 0;
  private out = 0;
  private remainingMs = 0;
  private fireCount = 0;

  // 0 = signal, 1 = threshold mod, 2 = length mod
  private voiceInputs: GainNode[] = [];
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private onSnapshotUpdate: ((s: TriggerSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (let i = 0; i < 3; i++) this.voiceInputs.push(this.createStereoGain(1));
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
  }

  getChannelInput(i: number): GainNode | null { return this.voiceInputs[i] ?? null; }
  getChannelCount(): number { return 3; }
  setChannelActive(i: number, has: boolean): void {
    if (!has) {
      if (i === 0) this.signal = 0;
      else if (i === 1) this.modValues.threshold = null;
      else if (i === 2) this.modValues.length = null;
      this.emit();
    }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((TRIGGER_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as TriggerKnob] = Number(value);
      this.emit();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const f = this.pickFieldName(data, sourceHandle);
    const v = f ? data[f] : undefined;
    if (typeof v !== "number") return;
    const clamped = Math.max(0, Math.min(1, v));
    if (targetHandle === "in-signal") this.signal = clamped;
    else if (targetHandle === "in-threshold") this.modValues.threshold = clamped;
    else if (targetHandle === "in-length") this.modValues.length = clamped;
  }

  private pickFieldName(data: Record<string, number>, sourceHandle?: string): string | null {
    const m = sourceHandle?.match(/^out-(.+)$/);
    const hf = m?.[1];
    if (hf && hf !== "L" && hf !== "R" && hf !== "all" && hf in data) return hf;
    const keys = Object.keys(data);
    return keys[0] ?? null;
  }

  private effective(k: TriggerKnob): number {
    const m = this.modValues[k];
    return m === null ? this.manual[k] : m;
  }

  private tick(): void {
    const threshold = this.effective("threshold");
    const lengthKnob = this.effective("length");
    // 1ms..2s
    const lengthMs = 1 + lengthKnob * 2000;

    // Detect rising edge through threshold
    const rising = this.prevSignal < threshold && this.signal >= threshold;
    if (rising) {
      this.remainingMs = lengthMs;
      this.fireCount++;
    }
    this.prevSignal = this.signal;

    if (this.remainingMs > 0) {
      this.remainingMs -= TICK_MS;
      this.out = 1;
      if (this.remainingMs <= 0) { this.remainingMs = 0; this.out = 0; }
    } else {
      this.out = 0;
    }

    this.emit();
  }

  getDataOutput(): Record<string, number> { return { value: this.out }; }

  getSnapshot(): TriggerSnapshot {
    const values = {} as Record<TriggerKnob, number>;
    const patched = {} as Record<TriggerKnob, boolean>;
    for (const k of TRIGGER_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    return { values, patched, signal: this.signal, out: this.out, fireCount: this.fireCount };
  }

  setOnSnapshotUpdate(cb: ((s: TriggerSnapshot) => void) | null): void {
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
