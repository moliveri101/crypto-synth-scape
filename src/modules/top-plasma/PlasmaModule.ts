import { AudioModule } from "../base/AudioModule";

// Plasma — classic demoscene plasma field. Multiple overlapping sine waves
// in 2D modulate a hue palette. Pure procedural — no source image needed.

export const PLASMA_KNOBS = [
  "speed",     // 0..1 → animation rate
  "scale",     // 0..1 → spatial frequency of the waves
  "palette",   // 0..1 → hue base (0 = red, 0.33 = green, 0.66 = blue)
  "spread",    // 0..1 → how much the hue varies across the field
  "brightness",// 0..1 → overall lightness
] as const;
export type PlasmaKnob = typeof PLASMA_KNOBS[number];

export interface PlasmaSnapshot {
  values: Record<PlasmaKnob, number>;
  patched: Record<PlasmaKnob, boolean>;
}

export class PlasmaModule extends AudioModule {
  private manual: Record<PlasmaKnob, number> = {
    speed: 0.3, scale: 0.4, palette: 0.6, spread: 0.5, brightness: 0.55,
  };
  private modValues: Record<PlasmaKnob, number | null> = {
    speed: null, scale: null, palette: null, spread: null, brightness: null,
  };

  private voiceInputs: Record<PlasmaKnob, GainNode> = {} as any;
  private onSnapshotUpdate: ((s: PlasmaSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (const k of PLASMA_KNOBS) this.voiceInputs[k] = this.createStereoGain(1);
  }

  getChannelInput(i: number): GainNode | null {
    const n = PLASMA_KNOBS[i]; return n ? this.voiceInputs[n] : null;
  }
  getChannelCount(): number { return PLASMA_KNOBS.length; }
  setChannelActive(i: number, has: boolean): void {
    const n = PLASMA_KNOBS[i];
    if (!n) return;
    if (!has && n in this.modValues) { this.modValues[n] = null; this.emit(); }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((PLASMA_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as PlasmaKnob] = Number(value);
      this.emit();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const m = targetHandle?.match(/^in-(.+)$/);
    const k = m?.[1] as PlasmaKnob | undefined;
    if (!k || !(PLASMA_KNOBS as readonly string[]).includes(k)) return;
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

  effective(k: PlasmaKnob): number {
    const m = this.modValues[k];
    return m === null ? this.manual[k] : m;
  }

  getSnapshot(): PlasmaSnapshot {
    const values = {} as Record<PlasmaKnob, number>;
    const patched = {} as Record<PlasmaKnob, boolean>;
    for (const k of PLASMA_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    return { values, patched };
  }

  setOnSnapshotUpdate(cb: ((s: PlasmaSnapshot) => void) | null): void {
    this.onSnapshotUpdate = cb;
  }
  private emit(): void { this.onSnapshotUpdate?.(this.getSnapshot()); }

  dispose(): void {
    this.stop();
    this.onSnapshotUpdate = null;
    super.dispose();
  }
}
