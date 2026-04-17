import { AudioModule } from "../base/AudioModule";

// Envelope — classic ADSR contour triggered by a gate input.
// When `in-trigger` rises above 0.5, attacks; when it falls, releases.
// Sustain knob sets the hold level during gate-on.
//
// Inputs:  in-trigger (gate), in-attack, in-decay, in-sustain, in-release
// Output:  value (0..1)

export const ENV_KNOBS = [
  "attack",  // 0..1 → 1ms..4s (exponential)
  "decay",   // 0..1 → 1ms..4s
  "sustain", // 0..1 → hold level
  "release", // 0..1 → 1ms..4s
] as const;
export type EnvKnob = typeof ENV_KNOBS[number];

const TICK_MS = 1000 / 60;

type Stage = "idle" | "attack" | "decay" | "sustain" | "release";

export interface EnvSnapshot {
  values: Record<EnvKnob, number>;
  patched: Record<EnvKnob, boolean>;
  triggerPatched: boolean;
  stage: Stage;
  current: number;
  history: number[];
}

function timeFromKnob(v: number): number {
  // 0 → 0.001s, 1 → 4s (exponential)
  return 0.001 * Math.pow(4000, v);
}

export class EnvelopeModule extends AudioModule {
  private manual: Record<EnvKnob, number> = {
    attack: 0.1, decay: 0.25, sustain: 0.6, release: 0.4,
  };
  private modValues: Record<EnvKnob, number | null> = {
    attack: null, decay: null, sustain: null, release: null,
  };
  private triggerPatched = false;

  private stage: Stage = "idle";
  private currentValue = 0;
  private gateOn = false;
  private history: number[] = new Array(200).fill(0);
  private historyWrite = 0;

  private voiceInputs: GainNode[] = [];
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private onSnapshotUpdate: ((s: EnvSnapshot) => void) | null = null;

  // Channel order: 0=trigger, 1=attack, 2=decay, 3=sustain, 4=release
  constructor(ctx: AudioContext) {
    super(ctx);
    for (let i = 0; i < 5; i++) this.voiceInputs.push(this.createStereoGain(1));
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
  }

  getChannelInput(i: number): GainNode | null { return this.voiceInputs[i] ?? null; }
  getChannelCount(): number { return 5; }
  setChannelActive(i: number, has: boolean): void {
    if (i === 0) { if (!has) { this.triggerPatched = false; this.gateOn = false; } else { this.triggerPatched = true; } }
    else {
      const k = ENV_KNOBS[i - 1];
      if (k && !has) this.modValues[k] = null;
    }
    this.emit();
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((ENV_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as EnvKnob] = Number(value);
      this.emit();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const f = this.pickFieldName(data, sourceHandle);
    const v = f ? data[f] : undefined;
    if (typeof v !== "number") return;
    const clamped = Math.max(0, Math.min(1, v));
    if (targetHandle === "in-trigger") {
      this.triggerPatched = true;
      const newGate = clamped > 0.5;
      if (newGate && !this.gateOn) this.stage = "attack";
      if (!newGate && this.gateOn && this.stage !== "idle") this.stage = "release";
      this.gateOn = newGate;
      return;
    }
    const m = targetHandle?.match(/^in-(.+)$/);
    const k = m?.[1] as EnvKnob | undefined;
    if (k && (ENV_KNOBS as readonly string[]).includes(k)) {
      this.modValues[k] = clamped;
    }
  }

  private pickFieldName(data: Record<string, number>, sourceHandle?: string): string | null {
    const m = sourceHandle?.match(/^out-(.+)$/);
    const hf = m?.[1];
    if (hf && hf !== "L" && hf !== "R" && hf !== "all" && hf in data) return hf;
    const keys = Object.keys(data);
    return keys[0] ?? null;
  }

  private effective(k: EnvKnob): number {
    const m = this.modValues[k];
    return m === null ? this.manual[k] : m;
  }

  private tick(): void {
    const dt = TICK_MS / 1000;
    const sustain = this.effective("sustain");

    if (this.stage === "attack") {
      const a = Math.max(0.001, timeFromKnob(this.effective("attack")));
      this.currentValue += dt / a;
      if (this.currentValue >= 1) { this.currentValue = 1; this.stage = "decay"; }
    } else if (this.stage === "decay") {
      const d = Math.max(0.001, timeFromKnob(this.effective("decay")));
      this.currentValue -= (dt / d) * (1 - sustain);
      if (this.currentValue <= sustain) { this.currentValue = sustain; this.stage = "sustain"; }
    } else if (this.stage === "sustain") {
      this.currentValue = sustain;
    } else if (this.stage === "release") {
      const r = Math.max(0.001, timeFromKnob(this.effective("release")));
      this.currentValue -= dt / r;
      if (this.currentValue <= 0) { this.currentValue = 0; this.stage = "idle"; }
    }

    this.history[this.historyWrite] = this.currentValue;
    this.historyWrite = (this.historyWrite + 1) % this.history.length;
    this.emit();
  }

  getDataOutput(): Record<string, number> { return { value: this.currentValue }; }

  getSnapshot(): EnvSnapshot {
    const values = {} as Record<EnvKnob, number>;
    const patched = {} as Record<EnvKnob, boolean>;
    for (const k of ENV_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    const n = this.history.length;
    const chrono = new Array(n);
    for (let i = 0; i < n; i++) chrono[i] = this.history[(this.historyWrite + i) % n];
    return {
      values, patched, triggerPatched: this.triggerPatched,
      stage: this.stage, current: this.currentValue, history: chrono,
    };
  }

  setOnSnapshotUpdate(cb: ((s: EnvSnapshot) => void) | null): void {
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
