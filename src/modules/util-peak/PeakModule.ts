import { AudioModule } from "../base/AudioModule";

// Peak — envelope follower. When input rises, output snaps up to match.
// When input falls, output decays slowly back down. Classic "peak hold
// with release" — turns jagged spikes into smooth swells.
//
// Inputs:  in-signal, in-attack, in-release
// Output:  value (0..1) — the envelope.

export const PEAK_KNOBS = ["attack", "release"] as const;
export type PeakKnob = typeof PEAK_KNOBS[number];

const TICK_MS = 1000 / 60;

export interface PeakSnapshot {
  values: Record<PeakKnob, number>;
  patched: Record<PeakKnob, boolean>;
  input: number;
  output: number;
  history: number[];
}

export class PeakModule extends AudioModule {
  private manual: Record<PeakKnob, number> = { attack: 0.05, release: 0.6 };
  private modValues: Record<PeakKnob, number | null> = { attack: null, release: null };

  private input = 0;
  private output = 0;
  private history: number[] = new Array(200).fill(0);
  private historyWrite = 0;

  // 0=signal, 1=attack, 2=release
  private voiceInputs: GainNode[] = [];
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private onSnapshotUpdate: ((s: PeakSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (let i = 0; i < 3; i++) this.voiceInputs.push(this.createStereoGain(1));
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
  }

  getChannelInput(i: number): GainNode | null { return this.voiceInputs[i] ?? null; }
  getChannelCount(): number { return 3; }
  setChannelActive(i: number, has: boolean): void {
    if (!has) {
      if (i === 0) this.input = 0;
      else if (i === 1) this.modValues.attack = null;
      else if (i === 2) this.modValues.release = null;
      this.emit();
    }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((PEAK_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as PeakKnob] = Number(value);
      this.emit();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const f = this.pickFieldName(data, sourceHandle);
    const v = f ? data[f] : undefined;
    if (typeof v !== "number") return;
    const clamped = Math.max(0, Math.min(1, v));
    if (targetHandle === "in-signal") this.input = clamped;
    else if (targetHandle === "in-attack") this.modValues.attack = clamped;
    else if (targetHandle === "in-release") this.modValues.release = clamped;
  }

  private pickFieldName(data: Record<string, number>, sourceHandle?: string): string | null {
    const m = sourceHandle?.match(/^out-(.+)$/);
    const hf = m?.[1];
    if (hf && hf !== "L" && hf !== "R" && hf !== "all" && hf in data) return hf;
    const keys = Object.keys(data);
    return keys[0] ?? null;
  }

  private effective(k: PeakKnob): number {
    const m = this.modValues[k];
    return m === null ? this.manual[k] : m;
  }

  private tick(): void {
    const dt = TICK_MS / 1000;
    const atk = 0.001 * Math.pow(1000, this.effective("attack"));   // 1ms..1s
    const rel = 0.01 * Math.pow(500, this.effective("release"));    // 10ms..5s
    const tau = this.input > this.output ? atk : rel;
    const alpha = 1 - Math.exp(-dt / Math.max(0.001, tau));
    this.output += (this.input - this.output) * alpha;
    this.output = Math.max(0, Math.min(1, this.output));
    this.history[this.historyWrite] = this.output;
    this.historyWrite = (this.historyWrite + 1) % this.history.length;
    this.emit();
  }

  getDataOutput(): Record<string, number> { return { value: this.output }; }

  getSnapshot(): PeakSnapshot {
    const values = {} as Record<PeakKnob, number>;
    const patched = {} as Record<PeakKnob, boolean>;
    for (const k of PEAK_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    const n = this.history.length;
    const chrono = new Array(n);
    for (let i = 0; i < n; i++) chrono[i] = this.history[(this.historyWrite + i) % n];
    return { values, patched, input: this.input, output: this.output, history: chrono };
  }

  setOnSnapshotUpdate(cb: ((s: PeakSnapshot) => void) | null): void {
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
