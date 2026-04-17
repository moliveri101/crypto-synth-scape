import { AudioModule } from "../base/AudioModule";

// Math — combine two data streams via a selectable operation.
// Inputs: `in-a`, `in-b` (each accepts a data field, picked via sourceHandle).
// Output: `value` in 0..1.

export const MATH_OPS = [
  "add", "subtract", "multiply", "divide",
  "min", "max", "average", "difference",
] as const;
export type MathOp = typeof MATH_OPS[number];

export interface MathSnapshot {
  a: number;
  b: number;
  result: number;
  op: MathOp;
}

export class MathModule extends AudioModule {
  private a = 0;
  private b = 0;
  private result = 0;
  private op: MathOp = "add";

  private voiceInputs = {
    a: null as GainNode | null,
    b: null as GainNode | null,
  };

  private onSnapshotUpdate: ((s: MathSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    this.voiceInputs.a = this.createStereoGain(1);
    this.voiceInputs.b = this.createStereoGain(1);
  }

  getChannelInput(i: number): GainNode | null {
    return i === 0 ? this.voiceInputs.a : i === 1 ? this.voiceInputs.b : null;
  }
  getChannelCount(): number { return 2; }
  setChannelActive(i: number, has: boolean): void {
    if (!has) {
      if (i === 0) this.a = 0;
      if (i === 1) this.b = 0;
      this.compute();
    }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if (name === "op" && (MATH_OPS as readonly string[]).includes(value)) {
      this.op = value as MathOp;
      this.compute();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const m = targetHandle?.match(/^in-(a|b)$/);
    const slot = m?.[1] as "a" | "b" | undefined;
    if (!slot) return;
    const f = this.pickFieldName(data, sourceHandle);
    const v = f ? data[f] : undefined;
    if (typeof v !== "number") return;
    const clamped = Math.max(0, Math.min(1, v));
    if (slot === "a") this.a = clamped; else this.b = clamped;
    this.compute();
  }

  private pickFieldName(data: Record<string, number>, sourceHandle?: string): string | null {
    const m = sourceHandle?.match(/^out-(.+)$/);
    const hf = m?.[1];
    if (hf && hf !== "L" && hf !== "R" && hf !== "all" && hf in data) return hf;
    const keys = Object.keys(data);
    return keys[0] ?? null;
  }

  private compute(): void {
    const { a, b, op } = this;
    let r = 0;
    switch (op) {
      case "add":        r = (a + b) / 2; break;
      case "subtract":   r = Math.max(0, a - b); break;
      case "multiply":   r = a * b; break;
      case "divide":     r = b < 0.001 ? 1 : Math.min(1, a / b); break;
      case "min":        r = Math.min(a, b); break;
      case "max":        r = Math.max(a, b); break;
      case "average":    r = (a + b) / 2; break;
      case "difference": r = Math.abs(a - b); break;
    }
    this.result = Math.max(0, Math.min(1, r));
    this.emit();
  }

  getDataOutput(): Record<string, number> {
    return { value: this.result };
  }

  getSnapshot(): MathSnapshot {
    return { a: this.a, b: this.b, result: this.result, op: this.op };
  }
  setOnSnapshotUpdate(cb: ((s: MathSnapshot) => void) | null): void {
    this.onSnapshotUpdate = cb;
  }
  private emit(): void { this.onSnapshotUpdate?.(this.getSnapshot()); }

  dispose(): void {
    this.stop();
    this.onSnapshotUpdate = null;
    super.dispose();
  }
}
