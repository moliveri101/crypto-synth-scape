import { AudioModule } from "../base/AudioModule";

// Terrain / height-map visualizer. 6 channel inputs each trace their own
// rolling ridge; new samples enter on the right and scroll to the left, so
// the landscape is a living time-series of the incoming data.
export const TERRAIN_KNOBS = [
  "ch1", "ch2", "ch3", "ch4", "ch5", "ch6",
  "amplitude", // vertical scale of each ridge
  "depth",     // vertical spacing between ridges (3D illusion)
  "scroll",    // how fast history scrolls
  "fill",      // 0 = wireframe, 1 = filled
  "color",     // hue
  "glow",      // stroke/fill glow
] as const;
export type TerrainKnob = typeof TERRAIN_KNOBS[number];

export interface TerrainSnapshot {
  values: Record<TerrainKnob, number>;
  patched: Record<TerrainKnob, boolean>;
}

/**
 * Terrain / height-map visualizer.
 *
 * Each of the 6 channels has its own rolling history buffer. On every render
 * tick the current channel value is pushed onto the right edge and the buffer
 * scrolls left. Channels are drawn as stacked mountain ridges with back-to-
 * front depth offset, producing an axonometric "landscape" feel.
 */
export class TerrainModule extends AudioModule {
  private manual: Record<TerrainKnob, number> = {
    ch1: 0, ch2: 0, ch3: 0, ch4: 0, ch5: 0, ch6: 0,
    amplitude: 0.5,
    depth: 0.5,
    scroll: 0.5,
    fill: 0.5,
    color: 0.3,
    glow: 0.5,
  };

  private modValues: Record<TerrainKnob, number | null> = {
    ch1: null, ch2: null, ch3: null, ch4: null, ch5: null, ch6: null,
    amplitude: null, depth: null, scroll: null, fill: null, color: null, glow: null,
  };

  private voiceInputs: Record<TerrainKnob, GainNode> = {} as any;
  private onSnapshotUpdate: ((s: TerrainSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (const k of TERRAIN_KNOBS) {
      this.voiceInputs[k] = this.createStereoGain(1);
    }
  }

  getChannelInput(index: number): GainNode | null {
    const name = TERRAIN_KNOBS[index];
    return name ? this.voiceInputs[name] : null;
  }
  getChannelCount(): number { return TERRAIN_KNOBS.length; }

  setChannelActive(index: number, hasInput: boolean): void {
    const name = TERRAIN_KNOBS[index];
    if (!name) return;
    if (!hasInput && name in this.modValues) {
      this.modValues[name] = null;
      this.emit();
    }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((TERRAIN_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as TerrainKnob] = Number(value);
      this.emit();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const match = targetHandle?.match(/^in-(.+)$/);
    const knob = match?.[1] as TerrainKnob | undefined;
    if (!knob || !(TERRAIN_KNOBS as readonly string[]).includes(knob)) return;

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

  private effective(knob: TerrainKnob): number {
    const m = this.modValues[knob];
    if (m === null) return this.manual[knob];
    // All knobs are 0..1 internally so return m directly
    return m;
  }

  getSnapshot(): TerrainSnapshot {
    const values = {} as Record<TerrainKnob, number>;
    const patched = {} as Record<TerrainKnob, boolean>;
    for (const k of TERRAIN_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    return { values, patched };
  }

  setOnSnapshotUpdate(cb: ((s: TerrainSnapshot) => void) | null): void {
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
