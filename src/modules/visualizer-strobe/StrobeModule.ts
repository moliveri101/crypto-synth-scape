import { AudioModule } from "../base/AudioModule";

// Strobe-light visualizer. More than a flashing white rectangle:
//   - configurable rate, duty cycle, color, and envelope shape
//   - 5 pattern modes (solid, halves, quadrants, random zones, scan)
//   - patchable trigger input: external pulses override rate and fire flashes
//   - color cycling through the palette
//   - jitter so the rhythm isn't mechanical
//
// PHOTOSENSITIVITY: flashes above ~3Hz with high contrast can trigger
// seizures in people with photosensitive epilepsy. The node UI shows a
// warning banner any time the effective rate is in the danger zone.

export const STROBE_KNOBS = [
  "rate",       // 0..1 → 0.1..30 Hz flash rate
  "duty",       // 0..1 → fraction of each cycle the flash is on
  "intensity",  // overall brightness
  "hue",        // 0..1 → base hue 0..360°
  "colorCycle", // 0..1 → how fast color drifts over time
  "jitter",     // 0..1 → randomize rate for less mechanical feel
  "trigger",    // 0..1 → external pulse input; rising edges fire a flash
] as const;
export type StrobeKnob = typeof STROBE_KNOBS[number];

export const STROBE_PATTERNS = [
  "solid",      // whole frame flashes
  "halves",     // L/R alternate
  "quadrants",  // 2x2 grid, phase-offset
  "random",     // random rectangles
  "scan",       // horizontal scanning bar
] as const;
export type StrobePattern = typeof STROBE_PATTERNS[number];

export const STROBE_ENVELOPES = [
  "square",  // hard on/off
  "triangle",// linear fade up + down within each cycle
  "gauss",   // smooth bell curve per cycle
  "decay",   // fast-on, slow-off (tail)
] as const;
export type StrobeEnvelope = typeof STROBE_ENVELOPES[number];

export interface StrobeSnapshot {
  values: Record<StrobeKnob, number>;
  patched: Record<StrobeKnob, boolean>;
  pattern: StrobePattern;
  envelope: StrobeEnvelope;
}

export class StrobeModule extends AudioModule {
  private manual: Record<StrobeKnob, number> = {
    rate: 0.15,       // ~4 Hz default — visible but not seizure-zone
    duty: 0.15,
    intensity: 0.9,
    hue: 0,
    colorCycle: 0.2,
    jitter: 0,
    trigger: 0,
  };

  private modValues: Record<StrobeKnob, number | null> = {
    rate: null, duty: null, intensity: null, hue: null,
    colorCycle: null, jitter: null, trigger: null,
  };

  private pattern: StrobePattern = "solid";
  private envelope: StrobeEnvelope = "square";

  private voiceInputs: Record<StrobeKnob, GainNode> = {} as any;
  private onSnapshotUpdate: ((s: StrobeSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (const k of STROBE_KNOBS) {
      this.voiceInputs[k] = this.createStereoGain(1);
    }
  }

  getChannelInput(index: number): GainNode | null {
    const name = STROBE_KNOBS[index];
    return name ? this.voiceInputs[name] : null;
  }
  getChannelCount(): number { return STROBE_KNOBS.length; }

  setChannelActive(index: number, hasInput: boolean): void {
    const name = STROBE_KNOBS[index];
    if (!name) return;
    if (!hasInput && name in this.modValues) {
      this.modValues[name] = null;
      this.emit();
    }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((STROBE_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as StrobeKnob] = Number(value);
      this.emit();
    } else if (name === "pattern") {
      if ((STROBE_PATTERNS as readonly string[]).includes(value)) {
        this.pattern = value as StrobePattern;
        this.emit();
      }
    } else if (name === "envelope") {
      if ((STROBE_ENVELOPES as readonly string[]).includes(value)) {
        this.envelope = value as StrobeEnvelope;
        this.emit();
      }
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const match = targetHandle?.match(/^in-(.+)$/);
    const knob = match?.[1] as StrobeKnob | undefined;
    if (!knob || !(STROBE_KNOBS as readonly string[]).includes(knob)) return;

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

  private effective(knob: StrobeKnob): number {
    const m = this.modValues[knob];
    return m === null ? this.manual[knob] : m;
  }

  getSnapshot(): StrobeSnapshot {
    const values = {} as Record<StrobeKnob, number>;
    const patched = {} as Record<StrobeKnob, boolean>;
    for (const k of STROBE_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    return { values, patched, pattern: this.pattern, envelope: this.envelope };
  }

  setOnSnapshotUpdate(cb: ((s: StrobeSnapshot) => void) | null): void {
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
