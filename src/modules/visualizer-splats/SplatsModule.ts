import { AudioModule } from "../base/AudioModule";

// Video Gaussian-Splats visualizer. Samples the webcam stream at a configurable
// low resolution and renders each sampled pixel as a soft 2D Gaussian blob.
// The result is a painterly, pointillist stylization of whatever the camera
// sees — not a true 3D reconstruction, but visually reminiscent of GS.
//
// Every knob is patchable via the standard data-input handle pattern.

export const SPLATS_KNOBS = [
  "clean",       // 0 = pure splats, 1 = pristine raw webcam passthrough
  "density",     // sampling resolution (0..1 → 10x10 .. 100x100 splats)
  "size",        // splat radius multiplier
  "brightness",  // overall intensity
  "saturation",  // 0 = monochrome, 1 = full color, >0.5 = boosted
  "jitter",      // random per-splat offset (adds motion/grain)
  "hue",         // global hue rotation
  "trail",       // persistence of previous frames (long exposures)
  "warp",        // perlin-style spatial distortion of splat positions
] as const;
export type SplatsKnob = typeof SPLATS_KNOBS[number];

export interface SplatsSnapshot {
  values: Record<SplatsKnob, number>;
  patched: Record<SplatsKnob, boolean>;
}

export class SplatsModule extends AudioModule {
  private manual: Record<SplatsKnob, number> = {
    clean: 1.0,        // default to pristine passthrough so the user sees
                       // the raw feed first and dials in the splat look
    density: 0.4,
    size: 0.5,
    brightness: 0.8,
    saturation: 1.0,
    jitter: 0.1,
    hue: 0,
    trail: 0.3,
    warp: 0.05,
  };

  private modValues: Record<SplatsKnob, number | null> = {
    clean: null,
    density: null, size: null, brightness: null, saturation: null,
    jitter: null, hue: null, trail: null, warp: null,
  };

  private voiceInputs: Record<SplatsKnob, GainNode> = {} as any;
  private onSnapshotUpdate: ((s: SplatsSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (const k of SPLATS_KNOBS) {
      this.voiceInputs[k] = this.createStereoGain(1);
    }
  }

  getChannelInput(index: number): GainNode | null {
    const name = SPLATS_KNOBS[index];
    return name ? this.voiceInputs[name] : null;
  }
  getChannelCount(): number { return SPLATS_KNOBS.length; }

  setChannelActive(index: number, hasInput: boolean): void {
    const name = SPLATS_KNOBS[index];
    if (!name) return;
    if (!hasInput && name in this.modValues) {
      this.modValues[name] = null;
      this.emit();
    }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((SPLATS_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as SplatsKnob] = Number(value);
      this.emit();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const match = targetHandle?.match(/^in-(.+)$/);
    const knob = match?.[1] as SplatsKnob | undefined;
    if (!knob || !(SPLATS_KNOBS as readonly string[]).includes(knob)) return;

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

  private effective(knob: SplatsKnob): number {
    const m = this.modValues[knob];
    return m === null ? this.manual[knob] : m;
  }

  getSnapshot(): SplatsSnapshot {
    const values = {} as Record<SplatsKnob, number>;
    const patched = {} as Record<SplatsKnob, boolean>;
    for (const k of SPLATS_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    return { values, patched };
  }

  setOnSnapshotUpdate(cb: ((s: SplatsSnapshot) => void) | null): void {
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
