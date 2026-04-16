import { AudioModule } from "../base/AudioModule";

// Knobs the Lissajous plotter exposes. Each has a manual value plus an
// optional 0..1 modulation value from a patch cord.
//
// The shape itself is determined primarily by freqX and freqY — when the ratio
// is rational (e.g. 3:2) you get a clean closed curve; irrational ratios give
// continuously-rotating open curves.
export const LISSAJOUS_KNOBS = [
  "freqX",     // X-axis frequency multiplier
  "freqY",     // Y-axis frequency multiplier
  "phase",     // phase offset between X and Y (0..2π)
  "speed",     // how fast the curve is traced
  "density",   // number of sample points (more = smoother)
  "thickness", // line thickness
  "trail",     // persistence of previous frames (longer tails)
  "color",     // hue offset 0..1
] as const;
export type LissajousKnob = typeof LISSAJOUS_KNOBS[number];

export interface LissajousSnapshot {
  values: Record<LissajousKnob, number>;
  patched: Record<LissajousKnob, boolean>;
}

/**
 * Lissajous / orbital-plot visualizer.
 *
 * Traces the parametric curve:
 *   x(t) = sin(freqX·t + phase)
 *   y(t) = sin(freqY·t)
 *
 * Patch two data streams into `freqX` and `freqY` and the shape becomes a live
 * portrait of the relationship between the two signals. Identical frequencies
 * with varying phase sweep through circle → ellipse → line → ellipse; non-equal
 * frequencies make petal and rosette patterns.
 */
export class LissajousModule extends AudioModule {
  private manual: Record<LissajousKnob, number> = {
    freqX: 3,
    freqY: 2,
    phase: 0,
    speed: 1.0,
    density: 800,
    thickness: 1.5,
    trail: 0.85,
    color: 0.55,
  };

  private modValues: Record<LissajousKnob, number | null> = {
    freqX: null, freqY: null, phase: null, speed: null,
    density: null, thickness: null, trail: null, color: null,
  };

  private voiceInputs: Record<LissajousKnob, GainNode> = {} as any;
  private onSnapshotUpdate: ((s: LissajousSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (const k of LISSAJOUS_KNOBS) {
      this.voiceInputs[k] = this.createStereoGain(1);
    }
  }

  getChannelInput(index: number): GainNode | null {
    const name = LISSAJOUS_KNOBS[index];
    return name ? this.voiceInputs[name] : null;
  }

  getChannelCount(): number { return LISSAJOUS_KNOBS.length; }

  setChannelActive(index: number, hasInput: boolean): void {
    const name = LISSAJOUS_KNOBS[index];
    if (!name) return;
    if (!hasInput && name in this.modValues) {
      this.modValues[name] = null;
      this.emit();
    }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((LISSAJOUS_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as LissajousKnob] = Number(value);
      this.emit();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const match = targetHandle?.match(/^in-(.+)$/);
    const knob = match?.[1] as LissajousKnob | undefined;
    if (!knob || !(LISSAJOUS_KNOBS as readonly string[]).includes(knob)) return;

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

  private effective(knob: LissajousKnob): number {
    const m = this.modValues[knob];
    if (m === null) return this.manual[knob];
    switch (knob) {
      case "freqX":     return 1 + m * 9;                    // 1..10
      case "freqY":     return 1 + m * 9;                    // 1..10
      case "phase":     return m * Math.PI * 2;              // 0..2π
      case "speed":     return m * 3;                         // 0..3
      case "density":   return Math.round(100 + m * 1900);    // 100..2000
      case "thickness": return 0.5 + m * 4.5;                 // 0.5..5
      case "trail":     return m;                             // 0..1
      case "color":     return m;                             // 0..1
    }
  }

  getSnapshot(): LissajousSnapshot {
    const values = {} as Record<LissajousKnob, number>;
    const patched = {} as Record<LissajousKnob, boolean>;
    for (const k of LISSAJOUS_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    return { values, patched };
  }

  setOnSnapshotUpdate(cb: ((s: LissajousSnapshot) => void) | null): void {
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
