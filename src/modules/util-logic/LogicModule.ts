import { AudioModule } from "../base/AudioModule";

// Logic — boolean combinator for gate/trigger signals. Each input is treated
// as high when > 0.5. Output is 1 or 0 based on the selected operation.
// Useful for combining multiple triggers (e.g. "fire only when the clock
// is on AND volatility is above threshold").

export const LOGIC_OPS = ["and", "or", "xor", "nand", "nor", "not-a"] as const;
export type LogicOp = typeof LOGIC_OPS[number];

export interface LogicSnapshot {
  a: boolean;
  b: boolean;
  output: boolean;
  op: LogicOp;
}

export class LogicModule extends AudioModule {
  private a = 0;
  private b = 0;
  private op: LogicOp = "and";
  private output = 0;

  private voiceInputs: GainNode[] = [];
  private onSnapshotUpdate: ((s: LogicSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (let i = 0; i < 2; i++) this.voiceInputs.push(this.createStereoGain(1));
  }

  getChannelInput(i: number): GainNode | null { return this.voiceInputs[i] ?? null; }
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
    if (name === "op" && (LOGIC_OPS as readonly string[]).includes(value)) {
      this.op = value as LogicOp;
      this.compute();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const f = this.pickFieldName(data, sourceHandle);
    const v = f ? data[f] : undefined;
    if (typeof v !== "number") return;
    const clamped = Math.max(0, Math.min(1, v));
    if (targetHandle === "in-a") this.a = clamped;
    else if (targetHandle === "in-b") this.b = clamped;
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
    const A = this.a > 0.5;
    const B = this.b > 0.5;
    let r = false;
    switch (this.op) {
      case "and":    r = A && B; break;
      case "or":     r = A || B; break;
      case "xor":    r = A !== B; break;
      case "nand":   r = !(A && B); break;
      case "nor":    r = !(A || B); break;
      case "not-a":  r = !A; break;
    }
    this.output = r ? 1 : 0;
    this.emit();
  }

  getDataOutput(): Record<string, number> { return { value: this.output }; }

  getSnapshot(): LogicSnapshot {
    return {
      a: this.a > 0.5, b: this.b > 0.5,
      output: this.output > 0.5, op: this.op,
    };
  }
  setOnSnapshotUpdate(cb: ((s: LogicSnapshot) => void) | null): void {
    this.onSnapshotUpdate = cb;
  }
  private emit(): void { this.onSnapshotUpdate?.(this.getSnapshot()); }

  dispose(): void {
    this.stop();
    this.onSnapshotUpdate = null;
    super.dispose();
  }
}
