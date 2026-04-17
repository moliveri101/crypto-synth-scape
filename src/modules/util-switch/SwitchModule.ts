import { AudioModule } from "../base/AudioModule";

// Switch — A/B multiplexer. When `in-select` is below 0.5 the output
// is `in-a`, above 0.5 it's `in-b`. With `smooth > 0` the crossfade
// glides between them instead of snapping.
//
// Inputs:  in-a, in-b, in-select, in-smooth
// Output:  value (0..1)

export const SWITCH_KNOBS = ["smooth"] as const;
export type SwitchKnob = typeof SWITCH_KNOBS[number];

const TICK_MS = 1000 / 60;

export interface SwitchSnapshot {
  a: number;
  b: number;
  select: number;
  output: number;
  smooth: number;
  smoothPatched: boolean;
}

export class SwitchModule extends AudioModule {
  private a = 0;
  private b = 0;
  private select = 0;
  private blend = 0; // smoothed 0..1
  private output = 0;

  private manualSmooth = 0;
  private modSmooth: number | null = null;

  // 0=a, 1=b, 2=select, 3=smooth
  private voiceInputs: GainNode[] = [];
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private onSnapshotUpdate: ((s: SwitchSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (let i = 0; i < 4; i++) this.voiceInputs.push(this.createStereoGain(1));
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
  }

  getChannelInput(i: number): GainNode | null { return this.voiceInputs[i] ?? null; }
  getChannelCount(): number { return 4; }
  setChannelActive(i: number, has: boolean): void {
    if (!has) {
      if (i === 0) this.a = 0;
      else if (i === 1) this.b = 0;
      else if (i === 2) this.select = 0;
      else if (i === 3) this.modSmooth = null;
      this.emit();
    }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if (name === "smooth") { this.manualSmooth = Number(value); this.emit(); }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const f = this.pickFieldName(data, sourceHandle);
    const v = f ? data[f] : undefined;
    if (typeof v !== "number") return;
    const clamped = Math.max(0, Math.min(1, v));
    if (targetHandle === "in-a") this.a = clamped;
    else if (targetHandle === "in-b") this.b = clamped;
    else if (targetHandle === "in-select") this.select = clamped;
    else if (targetHandle === "in-smooth") this.modSmooth = clamped;
  }

  private pickFieldName(data: Record<string, number>, sourceHandle?: string): string | null {
    const m = sourceHandle?.match(/^out-(.+)$/);
    const hf = m?.[1];
    if (hf && hf !== "L" && hf !== "R" && hf !== "all" && hf in data) return hf;
    const keys = Object.keys(data);
    return keys[0] ?? null;
  }

  private tick(): void {
    const smooth = this.modSmooth === null ? this.manualSmooth : this.modSmooth;
    const target = this.select;
    if (smooth <= 0.01) {
      this.blend = target;
    } else {
      const tau = 0.01 + smooth * 1.0; // 10ms..1s
      const dt = TICK_MS / 1000;
      const alpha = 1 - Math.exp(-dt / tau);
      this.blend += (target - this.blend) * alpha;
    }
    this.output = this.a * (1 - this.blend) + this.b * this.blend;
    this.emit();
  }

  getDataOutput(): Record<string, number> { return { value: this.output }; }

  getSnapshot(): SwitchSnapshot {
    const smooth = this.modSmooth === null ? this.manualSmooth : this.modSmooth;
    return {
      a: this.a, b: this.b, select: this.select,
      output: this.output, smooth, smoothPatched: this.modSmooth !== null,
    };
  }

  setOnSnapshotUpdate(cb: ((s: SwitchSnapshot) => void) | null): void {
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
