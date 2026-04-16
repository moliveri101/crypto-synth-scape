import { AudioModule } from "../base/AudioModule";

// Shader-toy gallery — one canvas, a library of shaders, pick via dropdown.
// Each shader reads the same 6 generic knobs so patches work regardless of
// which visual style is active.
export const SHADER_KNOBS = [
  "speed",    // global time multiplier
  "zoom",     // scale / density
  "warp",     // noise deformation
  "intensity",// brightness / saturation
  "color",    // hue offset
  "detail",   // iteration count / fractal depth
] as const;
export type ShaderKnob = typeof SHADER_KNOBS[number];

// Preset IDs — the node component has a matching fragment shader for each.
export const SHADER_PRESETS = [
  "plasma",
  "wavegrid",
  "liquid",
  "voronoi",
  "kaleido",
  "rays",
  "starburst",
] as const;
export type ShaderPreset = typeof SHADER_PRESETS[number];

export interface ShaderToySnapshot {
  values: Record<ShaderKnob, number>;
  patched: Record<ShaderKnob, boolean>;
  preset: ShaderPreset;
}

export class ShaderToyModule extends AudioModule {
  private manual: Record<ShaderKnob, number> = {
    speed: 0.5, zoom: 0.5, warp: 0.4,
    intensity: 0.7, color: 0.4, detail: 0.5,
  };

  private modValues: Record<ShaderKnob, number | null> = {
    speed: null, zoom: null, warp: null,
    intensity: null, color: null, detail: null,
  };

  private preset: ShaderPreset = "plasma";

  private voiceInputs: Record<ShaderKnob, GainNode> = {} as any;
  private onSnapshotUpdate: ((s: ShaderToySnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (const k of SHADER_KNOBS) {
      this.voiceInputs[k] = this.createStereoGain(1);
    }
  }

  getChannelInput(index: number): GainNode | null {
    const name = SHADER_KNOBS[index];
    return name ? this.voiceInputs[name] : null;
  }
  getChannelCount(): number { return SHADER_KNOBS.length; }

  setChannelActive(index: number, hasInput: boolean): void {
    const name = SHADER_KNOBS[index];
    if (!name) return;
    if (!hasInput && name in this.modValues) {
      this.modValues[name] = null;
      this.emit();
    }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((SHADER_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as ShaderKnob] = Number(value);
      this.emit();
    } else if (name === "preset") {
      if ((SHADER_PRESETS as readonly string[]).includes(String(value))) {
        this.preset = value as ShaderPreset;
        this.emit();
      }
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const match = targetHandle?.match(/^in-(.+)$/);
    const knob = match?.[1] as ShaderKnob | undefined;
    if (!knob || !(SHADER_KNOBS as readonly string[]).includes(knob)) return;

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

  private effective(knob: ShaderKnob): number {
    const m = this.modValues[knob];
    return m === null ? this.manual[knob] : m;
  }

  getSnapshot(): ShaderToySnapshot {
    const values = {} as Record<ShaderKnob, number>;
    const patched = {} as Record<ShaderKnob, boolean>;
    for (const k of SHADER_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    return { values, patched, preset: this.preset };
  }

  setOnSnapshotUpdate(cb: ((s: ShaderToySnapshot) => void) | null): void {
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
