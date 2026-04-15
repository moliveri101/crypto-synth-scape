import { AudioModule } from "../base/AudioModule";

// The set of knobs the fragment shader exposes. Each one has a manual value
// plus an optional 0..1 modulation value delivered by a patch cord.
export const VISUALIZER_KNOBS = [
  "shapeX",    // Julia seed real part        (-1.5 .. 1.5)
  "shapeY",    // Julia seed imag part        (-1.5 .. 1.5)
  "zoom",      // camera zoom                 (0.3 .. 4.0)
  "rotation",  // rotation of the complex plane (0 .. 2π)
  "color",     // palette offset              (0 .. 1)
  "detail",    // iteration count             (32 .. 256)
] as const;
export type VisualizerKnob = typeof VISUALIZER_KNOBS[number];

export interface VisualizerSnapshot {
  values: Record<VisualizerKnob, number>;   // current effective values (post-modulation)
  patched: Record<VisualizerKnob, boolean>; // which knobs are driven by a cable
}

/**
 * Fractal visualizer module — Julia-set driven by patch cords.
 *
 * Each `in-<knob>` handle accepts a data stream (0..1) that modulates the
 * corresponding shader uniform. Unpatched knobs keep their manual slider
 * value. The node component reads `getSnapshot()` on every RAF tick and pushes
 * the values to the WebGL context as uniforms.
 */
export class VisualizerModule extends AudioModule {
  // Manual (slider) values in each knob's native range
  private manual: Record<VisualizerKnob, number> = {
    shapeX: -0.7,
    shapeY: 0.27015,
    zoom: 1.0,
    rotation: 0,
    color: 0,
    detail: 96,
  };

  // Incoming modulation values, 0..1 if patched, null otherwise
  private modValues: Record<VisualizerKnob, number | null> = {
    shapeX: null, shapeY: null, zoom: null,
    rotation: null, color: null, detail: null,
  };

  // Silent input GainNodes so the AudioRouter has somewhere to connect the
  // audio-side of each edge. The data-side uses onDataInput routed by handle.
  private voiceInputs: Record<VisualizerKnob, GainNode> = {} as any;

  private onSnapshotUpdate: ((s: VisualizerSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (const k of VISUALIZER_KNOBS) {
      this.voiceInputs[k] = this.createStereoGain(1);
    }
  }

  // ── Per-voice input API (for AudioRouter) ────────────────────────────────

  getChannelInput(index: number): GainNode | null {
    const name = VISUALIZER_KNOBS[index];
    return name ? this.voiceInputs[name] : null;
  }

  getChannelCount(): number {
    return VISUALIZER_KNOBS.length;
  }

  setChannelActive(index: number, hasInput: boolean): void {
    const name = VISUALIZER_KNOBS[index];
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
    if ((VISUALIZER_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as VisualizerKnob] = Number(value);
      this.emit();
    }
  }

  // ── Data input ─────────────────────────────────────────────────────────
  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const match = targetHandle?.match(/^in-(.+)$/);
    const knob = match?.[1] as VisualizerKnob | undefined;
    if (!knob || !(VISUALIZER_KNOBS as readonly string[]).includes(knob)) return;

    // Pick which incoming field to consume — same pattern as Melody Translator
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

  // ── Effective values (manual mixed with modulation) ────────────────────

  private effective(knob: VisualizerKnob): number {
    const m = this.modValues[knob];
    if (m === null) return this.manual[knob];
    // Map 0..1 mod value into the knob's native range
    switch (knob) {
      case "shapeX":   return -1.5 + m * 3.0;
      case "shapeY":   return -1.5 + m * 3.0;
      case "zoom":     return 0.3 + m * 3.7;
      case "rotation": return m * Math.PI * 2;
      case "color":    return m;
      case "detail":   return Math.round(32 + m * 224);
    }
  }

  getSnapshot(): VisualizerSnapshot {
    const values = {} as Record<VisualizerKnob, number>;
    const patched = {} as Record<VisualizerKnob, boolean>;
    for (const k of VISUALIZER_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    return { values, patched };
  }

  setOnSnapshotUpdate(cb: ((s: VisualizerSnapshot) => void) | null): void {
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
