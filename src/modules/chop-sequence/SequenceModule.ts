import { AudioModule } from "../base/AudioModule";

// Sequence — a hand-authored pattern of 8 values that advances on every
// rising edge of `in-trigger`. TouchDesigner's Pattern CHOP equivalent.
// Pair with Clock to get a step-sequenced melody or rhythm.
//
// Inputs:  in-trigger, in-reset
// Output:  value (0..1) — current step's value.

const TICK_MS = 1000 / 60;
export const SEQ_STEPS = 8;

export interface SeqSnapshot {
  steps: number[];
  cursor: number;
  current: number;
  triggerPatched: boolean;
}

export class SequenceModule extends AudioModule {
  private steps: number[] = [0.2, 0.4, 0.3, 0.7, 0.5, 0.9, 0.4, 0.6];
  private cursor = 0;

  private triggerLevel = 0;
  private prevTrigger = 0;
  private resetLevel = 0;
  private prevReset = 0;
  private triggerPatched = false;

  // 0=trigger, 1=reset
  private voiceInputs: GainNode[] = [];
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private onSnapshotUpdate: ((s: SeqSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (let i = 0; i < 2; i++) this.voiceInputs.push(this.createStereoGain(1));
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
  }

  getChannelInput(i: number): GainNode | null { return this.voiceInputs[i] ?? null; }
  getChannelCount(): number { return 2; }
  setChannelActive(i: number, has: boolean): void {
    if (i === 0) { this.triggerPatched = has; if (!has) this.triggerLevel = 0; }
    else if (i === 1 && !has) this.resetLevel = 0;
    this.emit();
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    const m = name.match(/^step(\d+)$/);
    if (m) {
      const i = parseInt(m[1], 10);
      if (i >= 0 && i < SEQ_STEPS) {
        this.steps[i] = Math.max(0, Math.min(1, Number(value)));
        this.emit();
      }
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const f = this.pickFieldName(data, sourceHandle);
    const v = f ? data[f] : undefined;
    if (typeof v !== "number") return;
    const clamped = Math.max(0, Math.min(1, v));
    if (targetHandle === "in-trigger") { this.triggerPatched = true; this.triggerLevel = clamped; }
    else if (targetHandle === "in-reset") this.resetLevel = clamped;
  }

  private pickFieldName(data: Record<string, number>, sourceHandle?: string): string | null {
    const m = sourceHandle?.match(/^out-(.+)$/);
    const hf = m?.[1];
    if (hf && hf !== "L" && hf !== "R" && hf !== "all" && hf in data) return hf;
    const keys = Object.keys(data);
    return keys[0] ?? null;
  }

  private tick(): void {
    if (this.triggerLevel > 0.5 && this.prevTrigger <= 0.5) {
      this.cursor = (this.cursor + 1) % SEQ_STEPS;
    }
    if (this.resetLevel > 0.5 && this.prevReset <= 0.5) this.cursor = 0;
    this.prevTrigger = this.triggerLevel;
    this.prevReset = this.resetLevel;
    this.emit();
  }

  getDataOutput(): Record<string, number> {
    return { value: this.steps[this.cursor], step: this.cursor };
  }

  getSnapshot(): SeqSnapshot {
    return {
      steps: [...this.steps],
      cursor: this.cursor,
      current: this.steps[this.cursor],
      triggerPatched: this.triggerPatched,
    };
  }

  setOnSnapshotUpdate(cb: ((s: SeqSnapshot) => void) | null): void {
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
