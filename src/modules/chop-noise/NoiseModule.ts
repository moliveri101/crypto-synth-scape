import { AudioModule } from "../base/AudioModule";

// Noise — continuous organic modulation. Layered sine waves at different
// frequencies produce a Perlin-like wandering 0..1 output. Not actual
// Perlin noise but cheap and smooth enough for modulation duty.

export const NOISE_KNOBS = [
  "speed",   // 0..1 → how fast the noise drifts
  "detail",  // 0..1 → how many octaves contribute (more = rougher)
  "bias",    // 0..1 → center of output
  "amp",     // 0..1 → how much the noise deviates from bias
] as const;
export type NoiseKnob = typeof NOISE_KNOBS[number];

const TICK_MS = 1000 / 60;
const OCTAVE_SEEDS = [1.7, 3.3, 5.7, 9.1, 15.3]; // arbitrary offsets per octave

export interface NoiseSnapshot {
  values: Record<NoiseKnob, number>;
  patched: Record<NoiseKnob, boolean>;
  current: number;
  history: number[];
}

export class NoiseModule extends AudioModule {
  private manual: Record<NoiseKnob, number> = {
    speed: 0.3,
    detail: 0.4,
    bias: 0.5,
    amp: 0.5,
  };
  private modValues: Record<NoiseKnob, number | null> = {
    speed: null, detail: null, bias: null, amp: null,
  };

  private t = 0; // running time counter
  private currentValue = 0.5;
  private history: number[] = new Array(200).fill(0.5);
  private historyWrite = 0;

  private voiceInputs: Record<NoiseKnob, GainNode> = {} as any;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private onSnapshotUpdate: ((s: NoiseSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (const k of NOISE_KNOBS) this.voiceInputs[k] = this.createStereoGain(1);
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
  }

  getChannelInput(i: number): GainNode | null {
    const n = NOISE_KNOBS[i];
    return n ? this.voiceInputs[n] : null;
  }
  getChannelCount(): number { return NOISE_KNOBS.length; }
  setChannelActive(i: number, has: boolean): void {
    const n = NOISE_KNOBS[i];
    if (!n) return;
    if (!has && n in this.modValues) { this.modValues[n] = null; this.emit(); }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((NOISE_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as NoiseKnob] = Number(value);
      this.emit();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const m = targetHandle?.match(/^in-(.+)$/);
    const k = m?.[1] as NoiseKnob | undefined;
    if (!k || !(NOISE_KNOBS as readonly string[]).includes(k)) return;
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

  private effective(k: NoiseKnob): number {
    const m = this.modValues[k];
    return m === null ? this.manual[k] : m;
  }

  private tick(): void {
    const speed = this.effective("speed");
    const detail = this.effective("detail");
    const bias = this.effective("bias");
    const amp = this.effective("amp");
    // Advance time at up to 2Hz base rate
    this.t += (TICK_MS / 1000) * (0.05 + speed * 2);

    const octaves = 1 + Math.floor(detail * 4); // 1..5
    let sum = 0;
    let weightSum = 0;
    for (let i = 0; i < octaves; i++) {
      const w = 1 / (1 << i);
      const seed = OCTAVE_SEEDS[i];
      // Multiple sines with slightly different freqs — chaotic but smooth
      const v = Math.sin(this.t * (1 << i) + seed * 10)
              + Math.cos(this.t * (1 << i) * 1.3 + seed * 5);
      sum += v * w * 0.5;
      weightSum += w;
    }
    const raw = weightSum > 0 ? sum / weightSum : 0; // roughly -1..+1
    const out = bias + raw * amp * 0.5; // center on bias, scale by amp
    this.currentValue = Math.max(0, Math.min(1, out));

    this.history[this.historyWrite] = this.currentValue;
    this.historyWrite = (this.historyWrite + 1) % this.history.length;

    this.emit();
  }

  getDataOutput(): Record<string, number> {
    return { value: this.currentValue };
  }

  getSnapshot(): NoiseSnapshot {
    const values = {} as Record<NoiseKnob, number>;
    const patched = {} as Record<NoiseKnob, boolean>;
    for (const k of NOISE_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    const n = this.history.length;
    const chrono = new Array(n);
    for (let i = 0; i < n; i++) chrono[i] = this.history[(this.historyWrite + i) % n];
    return { values, patched, current: this.currentValue, history: chrono };
  }

  setOnSnapshotUpdate(cb: ((s: NoiseSnapshot) => void) | null): void {
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
