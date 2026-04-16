import { AudioModule } from "../base/AudioModule";

// Knobs the Mandelbulb raymarcher exposes. Each has a manual slider value
// plus an optional 0..1 modulation value from a patch cord.
export const MANDELBULB_KNOBS = [
  "power",      // fractal exponent — classic Mandelbulb = 8
  "iterations", // number of DE iterations (1..9) — smoothness vs detail
  "fold",       // space fold (abs-based) — creates planar mirror symmetry
  "mirror",     // kaleidoscopic rotational copies around Y axis (1..8)
  "copies",     // number of independent object copies arranged on a ring (1..8)
  "spacing",    // distance between copies (0 = collided at origin, 4 = spread apart)
  "merge",      // smooth-union blend: 0 = hard intersections, 2 = fully fused blob
  "rotX",       // camera yaw
  "rotY",       // camera pitch
  "zoom",       // camera distance (bigger = further away)
  "color",      // palette offset
  "glow",       // iteration-count glow intensity
] as const;
export type MandelbulbKnob = typeof MANDELBULB_KNOBS[number];

export interface MandelbulbSnapshot {
  values: Record<MandelbulbKnob, number>;
  patched: Record<MandelbulbKnob, boolean>;
}

/**
 * Mandelbulb 3D raymarching visualizer module.
 *
 * Same routing pattern as the Julia Visualizer: one `in-<knob>` handle per
 * shader uniform. Each knob has a manual value; when patched, the manual is
 * overridden by the modulated value mapped into the knob's native range.
 */
export class MandelbulbModule extends AudioModule {
  private manual: Record<MandelbulbKnob, number> = {
    power: 8.0,
    iterations: 7,
    fold: 0,
    mirror: 1,
    copies: 1,
    spacing: 2.0,
    merge: 0.3,
    rotX: 0,
    rotY: 0.2,
    zoom: 3.0,
    color: 0,
    glow: 0.5,
  };

  private modValues: Record<MandelbulbKnob, number | null> = {
    power: null, iterations: null, fold: null, mirror: null,
    copies: null, spacing: null, merge: null,
    rotX: null, rotY: null, zoom: null, color: null, glow: null,
  };

  // Silent inputs so the AudioRouter has connection targets. The audio side
  // is discarded; the router's onDataInput path is what we actually use.
  private voiceInputs: Record<MandelbulbKnob, GainNode> = {} as any;

  private onSnapshotUpdate: ((s: MandelbulbSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (const k of MANDELBULB_KNOBS) {
      this.voiceInputs[k] = this.createStereoGain(1);
    }
  }

  // ── Per-voice input API ─────────────────────────────────────────────────

  getChannelInput(index: number): GainNode | null {
    const name = MANDELBULB_KNOBS[index];
    return name ? this.voiceInputs[name] : null;
  }

  getChannelCount(): number {
    return MANDELBULB_KNOBS.length;
  }

  setChannelActive(index: number, hasInput: boolean): void {
    const name = MANDELBULB_KNOBS[index];
    if (!name) return;
    if (!hasInput && name in this.modValues) {
      this.modValues[name] = null;
      this.emit();
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((MANDELBULB_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as MandelbulbKnob] = Number(value);
      this.emit();
    }
  }

  // ── Data input ─────────────────────────────────────────────────────────

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const match = targetHandle?.match(/^in-(.+)$/);
    const knob = match?.[1] as MandelbulbKnob | undefined;
    if (!knob || !(MANDELBULB_KNOBS as readonly string[]).includes(knob)) return;

    const fieldName = this.pickFieldName(data, sourceHandle);
    const value = fieldName ? data[fieldName] : undefined;
    if (typeof value !== "number") return;

    this.modValues[knob] = Math.max(0, Math.min(1, value));
    this.emit();
  }

  private pickFieldName(data: Record<string, number>, sourceHandle?: string): string | null {
    const match = sourceHandle?.match(/^out-(.+)$/);
    const handleField = match?.[1];
    if (handleField && handleField !== "L" && handleField !== "R" && handleField !== "all" && handleField in data) {
      return handleField;
    }
    const keys = Object.keys(data);
    return keys[0] ?? null;
  }

  // ── Effective values ───────────────────────────────────────────────────

  private effective(knob: MandelbulbKnob): number {
    const m = this.modValues[knob];
    if (m === null) return this.manual[knob];
    switch (knob) {
      case "power":      return 3 + m * 9;            // 3..12
      case "iterations": return Math.round(1 + m * 8); // 1..9
      case "fold":       return m;                     // 0..1 continuous blend
      case "mirror":     return Math.round(1 + m * 7); // 1..8 radial copies
      case "copies":     return Math.round(1 + m * 7); // 1..8 object copies
      case "spacing":    return m * 4;                 // 0..4 ring radius
      case "merge":      return m * 2;                 // 0..2 smooth-union radius
      case "rotX":       return m * Math.PI * 2;       // 0..2π
      case "rotY":       return m * Math.PI;           // 0..π
      case "zoom":       return 1.8 + m * 4.2;         // 1.8..6
      case "color":      return m;                     // 0..1
      case "glow":       return m;                     // 0..1
    }
  }

  getSnapshot(): MandelbulbSnapshot {
    const values = {} as Record<MandelbulbKnob, number>;
    const patched = {} as Record<MandelbulbKnob, boolean>;
    for (const k of MANDELBULB_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    return { values, patched };
  }

  setOnSnapshotUpdate(cb: ((s: MandelbulbSnapshot) => void) | null): void {
    this.onSnapshotUpdate = cb;
  }

  private emit(): void {
    this.onSnapshotUpdate?.(this.getSnapshot());
  }

  dispose(): void {
    this.stop();
    this.onSnapshotUpdate = null;
    super.dispose();
  }
}
