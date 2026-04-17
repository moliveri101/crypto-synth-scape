import { AudioModule } from "../base/AudioModule";

// Kaleidoscope — takes the webcam feed and mirrors one pie slice into N
// radial segments. Rotation, zoom and offset are all patchable so CHOPs
// can slowly breathe the kaleidoscope in and out.

export const KALEIDO_KNOBS = [
  "segments",  // 0..1 → 2..16 slices
  "rotation",  // 0..1 → 0..2π rotation
  "zoom",      // 0..1 → 0.5..3x zoom on source
  "offsetX",   // 0..1 → -0.5..0.5 source offset
  "offsetY",   // 0..1 → -0.5..0.5 source offset
] as const;
export type KaleidoKnob = typeof KALEIDO_KNOBS[number];

export interface KaleidoSnapshot {
  values: Record<KaleidoKnob, number>;
  patched: Record<KaleidoKnob, boolean>;
}

export class KaleidoscopeModule extends AudioModule {
  private manual: Record<KaleidoKnob, number> = {
    segments: 0.35, rotation: 0, zoom: 0.3, offsetX: 0.5, offsetY: 0.5,
  };
  private modValues: Record<KaleidoKnob, number | null> = {
    segments: null, rotation: null, zoom: null, offsetX: null, offsetY: null,
  };

  private voiceInputs: Record<KaleidoKnob, GainNode> = {} as any;
  private onSnapshotUpdate: ((s: KaleidoSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (const k of KALEIDO_KNOBS) this.voiceInputs[k] = this.createStereoGain(1);
  }

  getChannelInput(i: number): GainNode | null {
    const n = KALEIDO_KNOBS[i]; return n ? this.voiceInputs[n] : null;
  }
  getChannelCount(): number { return KALEIDO_KNOBS.length; }
  setChannelActive(i: number, has: boolean): void {
    const n = KALEIDO_KNOBS[i];
    if (!n) return;
    if (!has && n in this.modValues) { this.modValues[n] = null; this.emit(); }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((KALEIDO_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as KaleidoKnob] = Number(value);
      this.emit();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const m = targetHandle?.match(/^in-(.+)$/);
    const k = m?.[1] as KaleidoKnob | undefined;
    if (!k || !(KALEIDO_KNOBS as readonly string[]).includes(k)) return;
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

  effective(k: KaleidoKnob): number {
    const m = this.modValues[k];
    return m === null ? this.manual[k] : m;
  }

  getSnapshot(): KaleidoSnapshot {
    const values = {} as Record<KaleidoKnob, number>;
    const patched = {} as Record<KaleidoKnob, boolean>;
    for (const k of KALEIDO_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    return { values, patched };
  }

  setOnSnapshotUpdate(cb: ((s: KaleidoSnapshot) => void) | null): void {
    this.onSnapshotUpdate = cb;
  }
  private emit(): void { this.onSnapshotUpdate?.(this.getSnapshot()); }

  dispose(): void {
    this.stop();
    this.onSnapshotUpdate = null;
    super.dispose();
  }
}
