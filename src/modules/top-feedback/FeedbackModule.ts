import { AudioModule } from "../base/AudioModule";

// Feedback — a procedural moving shape whose previous frame is zoomed,
// rotated and redrawn as the background. The classic "trails of trails"
// aesthetic. All transforms are patchable so CHOPs drive the motion.

export const FEEDBACK_KNOBS = [
  "shapeX",    // 0..1 → horizontal position
  "shapeY",    // 0..1 → vertical position
  "size",      // 0..1 → shape radius
  "hue",       // 0..1 → shape hue
  "feedback",  // 0..1 → how much of previous frame persists (fade amount)
  "zoom",      // 0..1 → per-frame scale (0.5 = 0.98x, 1 = 1.02x)
  "rotation",  // 0..1 → per-frame rotation (-2°..+2° per frame)
] as const;
export type FeedbackKnob = typeof FEEDBACK_KNOBS[number];

export interface FeedbackSnapshot {
  values: Record<FeedbackKnob, number>;
  patched: Record<FeedbackKnob, boolean>;
}

export class FeedbackModule extends AudioModule {
  private manual: Record<FeedbackKnob, number> = {
    shapeX: 0.5, shapeY: 0.5, size: 0.2, hue: 0.5,
    feedback: 0.92, zoom: 0.52, rotation: 0.52,
  };
  private modValues: Record<FeedbackKnob, number | null> = {
    shapeX: null, shapeY: null, size: null, hue: null,
    feedback: null, zoom: null, rotation: null,
  };

  private voiceInputs: Record<FeedbackKnob, GainNode> = {} as any;
  private onSnapshotUpdate: ((s: FeedbackSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (const k of FEEDBACK_KNOBS) this.voiceInputs[k] = this.createStereoGain(1);
  }

  getChannelInput(i: number): GainNode | null {
    const n = FEEDBACK_KNOBS[i]; return n ? this.voiceInputs[n] : null;
  }
  getChannelCount(): number { return FEEDBACK_KNOBS.length; }
  setChannelActive(i: number, has: boolean): void {
    const n = FEEDBACK_KNOBS[i];
    if (!n) return;
    if (!has && n in this.modValues) { this.modValues[n] = null; this.emit(); }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((FEEDBACK_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as FeedbackKnob] = Number(value);
      this.emit();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const m = targetHandle?.match(/^in-(.+)$/);
    const k = m?.[1] as FeedbackKnob | undefined;
    if (!k || !(FEEDBACK_KNOBS as readonly string[]).includes(k)) return;
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

  effective(k: FeedbackKnob): number {
    const m = this.modValues[k];
    return m === null ? this.manual[k] : m;
  }

  getSnapshot(): FeedbackSnapshot {
    const values = {} as Record<FeedbackKnob, number>;
    const patched = {} as Record<FeedbackKnob, boolean>;
    for (const k of FEEDBACK_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    return { values, patched };
  }

  setOnSnapshotUpdate(cb: ((s: FeedbackSnapshot) => void) | null): void {
    this.onSnapshotUpdate = cb;
  }
  private emit(): void { this.onSnapshotUpdate?.(this.getSnapshot()); }

  dispose(): void {
    this.stop();
    this.onSnapshotUpdate = null;
    super.dispose();
  }
}
