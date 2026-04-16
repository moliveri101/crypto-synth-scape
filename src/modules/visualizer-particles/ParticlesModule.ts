import { AudioModule } from "../base/AudioModule";

// Knobs the particle-system renderer exposes. Each has a manual slider value
// and an optional 0..1 modulation value from a patch cord.
export const PARTICLES_KNOBS = [
  "count",       // number of particles (20..500)
  "speed",       // base velocity scale
  "gravity",     // attraction to center (negative = repulsion)
  "turbulence",  // perlin-like noise perturbation
  "trail",       // persistence of previous frames (0 = clean, 1 = long streaks)
  "size",        // particle radius
  "color",       // hue offset 0..1
  "spread",      // spawn radius
] as const;
export type ParticlesKnob = typeof PARTICLES_KNOBS[number];

export interface ParticlesSnapshot {
  values: Record<ParticlesKnob, number>;
  patched: Record<ParticlesKnob, boolean>;
}

/**
 * Generative particle-system visualizer module.
 *
 * Same routing pattern as the other visualizers: one `in-<knob>` handle per
 * parameter, each with an independent manual slider + modulation value. The
 * node component runs the actual 2D canvas simulation and reads `getSnapshot()`
 * on every frame.
 */
export class ParticlesModule extends AudioModule {
  private manual: Record<ParticlesKnob, number> = {
    count: 150,
    speed: 1.0,
    gravity: 0.3,
    turbulence: 0.4,
    trail: 0.7,
    size: 2.5,
    color: 0.5,
    spread: 0.6,
  };

  private modValues: Record<ParticlesKnob, number | null> = {
    count: null, speed: null, gravity: null, turbulence: null,
    trail: null, size: null, color: null, spread: null,
  };

  // Silent inputs so the AudioRouter has routing targets
  private voiceInputs: Record<ParticlesKnob, GainNode> = {} as any;

  private onSnapshotUpdate: ((s: ParticlesSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (const k of PARTICLES_KNOBS) {
      this.voiceInputs[k] = this.createStereoGain(1);
    }
  }

  getChannelInput(index: number): GainNode | null {
    const name = PARTICLES_KNOBS[index];
    return name ? this.voiceInputs[name] : null;
  }

  getChannelCount(): number {
    return PARTICLES_KNOBS.length;
  }

  setChannelActive(index: number, hasInput: boolean): void {
    const name = PARTICLES_KNOBS[index];
    if (!name) return;
    if (!hasInput && name in this.modValues) {
      this.modValues[name] = null;
      this.emit();
    }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((PARTICLES_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as ParticlesKnob] = Number(value);
      this.emit();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const match = targetHandle?.match(/^in-(.+)$/);
    const knob = match?.[1] as ParticlesKnob | undefined;
    if (!knob || !(PARTICLES_KNOBS as readonly string[]).includes(knob)) return;

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

  private effective(knob: ParticlesKnob): number {
    const m = this.modValues[knob];
    if (m === null) return this.manual[knob];
    switch (knob) {
      case "count":      return Math.round(20 + m * 480);     // 20..500
      case "speed":      return m * 3;                         // 0..3
      case "gravity":    return -1 + m * 2;                    // -1..1 (m=0.5 = no force)
      case "turbulence": return m;                             // 0..1
      case "trail":      return m;                             // 0..1
      case "size":       return 1 + m * 9;                     // 1..10
      case "color":      return m;                             // 0..1
      case "spread":     return m;                             // 0..1
    }
  }

  getSnapshot(): ParticlesSnapshot {
    const values = {} as Record<ParticlesKnob, number>;
    const patched = {} as Record<ParticlesKnob, boolean>;
    for (const k of PARTICLES_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    return { values, patched };
  }

  setOnSnapshotUpdate(cb: ((s: ParticlesSnapshot) => void) | null): void {
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
