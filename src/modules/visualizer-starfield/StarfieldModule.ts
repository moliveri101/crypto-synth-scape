import { AudioModule } from "../base/AudioModule";

// Starfield — classic "flying through space" effect. Stars have z-depth;
// when a star crosses the near plane it gets recycled to the far plane.
export const STARFIELD_KNOBS = [
  "count",      // number of stars (50..800)
  "speed",      // forward velocity (0 = frozen, 5 = warp speed)
  "warp",       // motion-blur streak length (0..1)
  "spread",     // XY distribution radius (0..1)
  "rotation",   // camera roll speed (0 = no roll, 1 = fast)
  "twinkle",    // per-star brightness wobble
  "color",      // hue offset
  "brightness", // global brightness multiplier
] as const;
export type StarfieldKnob = typeof STARFIELD_KNOBS[number];

export interface StarfieldSnapshot {
  values: Record<StarfieldKnob, number>;
  patched: Record<StarfieldKnob, boolean>;
}

export class StarfieldModule extends AudioModule {
  private manual: Record<StarfieldKnob, number> = {
    count: 250,
    speed: 1.5,
    warp: 0.3,
    spread: 0.8,
    rotation: 0.1,
    twinkle: 0.4,
    color: 0.6,
    brightness: 0.8,
  };

  private modValues: Record<StarfieldKnob, number | null> = {
    count: null, speed: null, warp: null, spread: null,
    rotation: null, twinkle: null, color: null, brightness: null,
  };

  private voiceInputs: Record<StarfieldKnob, GainNode> = {} as any;
  private onSnapshotUpdate: ((s: StarfieldSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (const k of STARFIELD_KNOBS) {
      this.voiceInputs[k] = this.createStereoGain(1);
    }
  }

  getChannelInput(index: number): GainNode | null {
    const name = STARFIELD_KNOBS[index];
    return name ? this.voiceInputs[name] : null;
  }
  getChannelCount(): number { return STARFIELD_KNOBS.length; }

  setChannelActive(index: number, hasInput: boolean): void {
    const name = STARFIELD_KNOBS[index];
    if (!name) return;
    if (!hasInput && name in this.modValues) {
      this.modValues[name] = null;
      this.emit();
    }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((STARFIELD_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as StarfieldKnob] = Number(value);
      this.emit();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const match = targetHandle?.match(/^in-(.+)$/);
    const knob = match?.[1] as StarfieldKnob | undefined;
    if (!knob || !(STARFIELD_KNOBS as readonly string[]).includes(knob)) return;

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

  private effective(knob: StarfieldKnob): number {
    const m = this.modValues[knob];
    if (m === null) return this.manual[knob];
    switch (knob) {
      case "count":      return Math.round(50 + m * 750);
      case "speed":      return m * 5;
      case "warp":       return m;
      case "spread":     return m;
      case "rotation":   return m;
      case "twinkle":    return m;
      case "color":      return m;
      case "brightness": return m;
    }
  }

  getSnapshot(): StarfieldSnapshot {
    const values = {} as Record<StarfieldKnob, number>;
    const patched = {} as Record<StarfieldKnob, boolean>;
    for (const k of STARFIELD_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    return { values, patched };
  }

  setOnSnapshotUpdate(cb: ((s: StarfieldSnapshot) => void) | null): void {
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
