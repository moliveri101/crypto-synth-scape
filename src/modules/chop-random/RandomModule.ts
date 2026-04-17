import { AudioModule } from "../base/AudioModule";

// Random / Sample & Hold — picks a new random value every `rate` seconds.
// With `smooth` > 0, it eases from the previous value to the next one over
// a fraction of the period. Classic modular S&H feel.

export const RANDOM_KNOBS = [
  "rate",   // 0..1 → 0.05..20 Hz (exponential)
  "smooth", // 0..1 → 0 = pure step, 1 = fully glided
  "min",    // 0..1 → output floor
  "max",    // 0..1 → output ceiling
] as const;
export type RandomKnob = typeof RANDOM_KNOBS[number];

const TICK_MS = 1000 / 60;

export interface RandomSnapshot {
  values: Record<RandomKnob, number>;
  patched: Record<RandomKnob, boolean>;
  current: number;
  history: number[];
}

export class RandomModule extends AudioModule {
  private manual: Record<RandomKnob, number> = {
    rate: 0.3, smooth: 0, min: 0, max: 1,
  };
  private modValues: Record<RandomKnob, number | null> = {
    rate: null, smooth: null, min: null, max: null,
  };

  private phase = 0; // 0..1 within current step
  private prevValue = 0.5;
  private nextValue = 0.5;
  private currentValue = 0.5;
  private history: number[] = new Array(200).fill(0.5);
  private historyWrite = 0;

  private voiceInputs: Record<RandomKnob, GainNode> = {} as any;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private onSnapshotUpdate: ((s: RandomSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (const k of RANDOM_KNOBS) this.voiceInputs[k] = this.createStereoGain(1);
    this.nextValue = Math.random();
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
  }

  getChannelInput(i: number): GainNode | null {
    const n = RANDOM_KNOBS[i];
    return n ? this.voiceInputs[n] : null;
  }
  getChannelCount(): number { return RANDOM_KNOBS.length; }
  setChannelActive(i: number, has: boolean): void {
    const n = RANDOM_KNOBS[i];
    if (!n) return;
    if (!has && n in this.modValues) { this.modValues[n] = null; this.emit(); }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((RANDOM_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as RandomKnob] = Number(value);
      this.emit();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const m = targetHandle?.match(/^in-(.+)$/);
    const k = m?.[1] as RandomKnob | undefined;
    if (!k || !(RANDOM_KNOBS as readonly string[]).includes(k)) return;
    const f = this.pickFieldName(data, sourceHandle);
    const v = f ? data[f] : undefined;
    if (typeof v !== "number") return;
    this.modValues[k] = Math.max(0, Math.min(1, v));
    this.emit();
  }

  private pickFieldName(data: Record<string, number>, sourceHandle?: string): string | null {
    const m = sourceHandle?.match(/^out-(.+)$/);
    const hf = m?.[1];
    if (hf && hf !== "L" && hf !== "R" && hf !== "all" && hf in data) return hf;
    const keys = Object.keys(data);
    return keys[0] ?? null;
  }

  private effective(k: RandomKnob): number {
    const m = this.modValues[k];
    return m === null ? this.manual[k] : m;
  }

  private tick(): void {
    const rate = this.effective("rate");
    const smooth = this.effective("smooth");
    const lo = this.effective("min");
    const hi = this.effective("max");
    // 0.05..20 Hz exponential
    const hz = 0.05 * Math.pow(400, rate);
    this.phase += hz * (TICK_MS / 1000);
    while (this.phase >= 1) {
      this.phase -= 1;
      this.prevValue = this.nextValue;
      this.nextValue = Math.random();
    }
    // Smooth blend within the step
    const blendWindow = Math.max(0.001, smooth);
    const t = Math.min(1, this.phase / blendWindow);
    const eased = t * t * (3 - 2 * t); // smoothstep
    const raw = this.prevValue + (this.nextValue - this.prevValue) * eased;
    const scaled = lo + raw * (hi - lo);
    this.currentValue = Math.max(0, Math.min(1, scaled));

    this.history[this.historyWrite] = this.currentValue;
    this.historyWrite = (this.historyWrite + 1) % this.history.length;
    this.emit();
  }

  getDataOutput(): Record<string, number> {
    return { value: this.currentValue };
  }

  getSnapshot(): RandomSnapshot {
    const values = {} as Record<RandomKnob, number>;
    const patched = {} as Record<RandomKnob, boolean>;
    for (const k of RANDOM_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    const n = this.history.length;
    const chrono = new Array(n);
    for (let i = 0; i < n; i++) chrono[i] = this.history[(this.historyWrite + i) % n];
    return { values, patched, current: this.currentValue, history: chrono };
  }

  setOnSnapshotUpdate(cb: ((s: RandomSnapshot) => void) | null): void {
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
