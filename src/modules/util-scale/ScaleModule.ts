import { AudioModule } from "../base/AudioModule";

// Scale / Remap — take an input 0..1 stream and remap it to a user-selected
// output window, optionally with a curve (exponent) and invert flag.
// Essential utility for adapting one module's output range to another's
// comfortable input range.
//
// Inputs:  in-signal, in-outMin, in-outMax, in-curve
// Output:  value (0..1)

export const SCALE_KNOBS = ["outMin", "outMax", "curve"] as const;
export type ScaleKnob = typeof SCALE_KNOBS[number];

const TICK_MS = 1000 / 60;

export interface ScaleSnapshot {
  values: Record<ScaleKnob, number>;
  patched: Record<ScaleKnob, boolean>;
  invert: boolean;
  input: number;
  output: number;
}

export class ScaleModule extends AudioModule {
  private manual: Record<ScaleKnob, number> = { outMin: 0, outMax: 1, curve: 0.5 };
  private modValues: Record<ScaleKnob, number | null> = { outMin: null, outMax: null, curve: null };
  private invert = false;

  private input = 0;
  private output = 0;

  // 0 = signal, 1..3 = outMin, outMax, curve
  private voiceInputs: GainNode[] = [];
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private onSnapshotUpdate: ((s: ScaleSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (let i = 0; i < 4; i++) this.voiceInputs.push(this.createStereoGain(1));
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
  }

  getChannelInput(i: number): GainNode | null { return this.voiceInputs[i] ?? null; }
  getChannelCount(): number { return 4; }
  setChannelActive(i: number, has: boolean): void {
    if (!has) {
      if (i === 0) this.input = 0;
      else {
        const k = SCALE_KNOBS[i - 1];
        if (k) this.modValues[k] = null;
      }
      this.emit();
    }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((SCALE_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as ScaleKnob] = Number(value);
      this.emit();
    } else if (name === "invert") {
      this.invert = Boolean(value);
      this.emit();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const f = this.pickFieldName(data, sourceHandle);
    const v = f ? data[f] : undefined;
    if (typeof v !== "number") return;
    const clamped = Math.max(0, Math.min(1, v));
    if (targetHandle === "in-signal") this.input = clamped;
    else {
      const m = targetHandle?.match(/^in-(.+)$/);
      const k = m?.[1] as ScaleKnob | undefined;
      if (k && (SCALE_KNOBS as readonly string[]).includes(k)) this.modValues[k] = clamped;
    }
  }

  private pickFieldName(data: Record<string, number>, sourceHandle?: string): string | null {
    const m = sourceHandle?.match(/^out-(.+)$/);
    const hf = m?.[1];
    if (hf && hf !== "L" && hf !== "R" && hf !== "all" && hf in data) return hf;
    const keys = Object.keys(data);
    return keys[0] ?? null;
  }

  private effective(k: ScaleKnob): number {
    const m = this.modValues[k];
    return m === null ? this.manual[k] : m;
  }

  private tick(): void {
    const lo = this.effective("outMin");
    const hi = this.effective("outMax");
    const curveKnob = this.effective("curve"); // 0.5 = linear, <0.5 = exp, >0.5 = log
    // Map 0..1 curve to exponent 0.1..10 (0.5 → 1)
    const exp = Math.pow(10, (curveKnob - 0.5) * 2);

    let x = this.input;
    if (this.invert) x = 1 - x;
    const curved = Math.pow(x, exp);
    this.output = Math.max(0, Math.min(1, lo + curved * (hi - lo)));
    this.emit();
  }

  getDataOutput(): Record<string, number> { return { value: this.output }; }

  getSnapshot(): ScaleSnapshot {
    const values = {} as Record<ScaleKnob, number>;
    const patched = {} as Record<ScaleKnob, boolean>;
    for (const k of SCALE_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    return { values, patched, invert: this.invert, input: this.input, output: this.output };
  }

  setOnSnapshotUpdate(cb: ((s: ScaleSnapshot) => void) | null): void {
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
