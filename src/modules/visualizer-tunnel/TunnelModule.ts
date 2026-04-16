import { AudioModule } from "../base/AudioModule";

// Infinite-tunnel visualizer — fly through a textured pipe whose walls warp
// and pulse in response to the patched inputs.
export const TUNNEL_KNOBS = [
  "speed",       // forward travel speed
  "twist",       // rotation of the tunnel axis
  "rings",       // ring frequency along the length
  "stripes",     // angular stripe frequency around the tunnel
  "warp",        // radial wobble / deformation
  "flare",       // end-of-tunnel bloom
  "color",       // hue offset
  "contrast",    // dark/light separation
] as const;
export type TunnelKnob = typeof TUNNEL_KNOBS[number];

export interface TunnelSnapshot {
  values: Record<TunnelKnob, number>;
  patched: Record<TunnelKnob, boolean>;
}

export class TunnelModule extends AudioModule {
  private manual: Record<TunnelKnob, number> = {
    speed: 0.5,
    twist: 0.2,
    rings: 0.4,
    stripes: 0.5,
    warp: 0.15,
    flare: 0.5,
    color: 0.65,
    contrast: 0.6,
  };

  private modValues: Record<TunnelKnob, number | null> = {
    speed: null, twist: null, rings: null, stripes: null,
    warp: null, flare: null, color: null, contrast: null,
  };

  private voiceInputs: Record<TunnelKnob, GainNode> = {} as any;
  private onSnapshotUpdate: ((s: TunnelSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (const k of TUNNEL_KNOBS) {
      this.voiceInputs[k] = this.createStereoGain(1);
    }
  }

  getChannelInput(index: number): GainNode | null {
    const name = TUNNEL_KNOBS[index];
    return name ? this.voiceInputs[name] : null;
  }
  getChannelCount(): number { return TUNNEL_KNOBS.length; }

  setChannelActive(index: number, hasInput: boolean): void {
    const name = TUNNEL_KNOBS[index];
    if (!name) return;
    if (!hasInput && name in this.modValues) {
      this.modValues[name] = null;
      this.emit();
    }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((TUNNEL_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as TunnelKnob] = Number(value);
      this.emit();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const match = targetHandle?.match(/^in-(.+)$/);
    const knob = match?.[1] as TunnelKnob | undefined;
    if (!knob || !(TUNNEL_KNOBS as readonly string[]).includes(knob)) return;

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

  private effective(knob: TunnelKnob): number {
    const m = this.modValues[knob];
    return m === null ? this.manual[knob] : m;
  }

  getSnapshot(): TunnelSnapshot {
    const values = {} as Record<TunnelKnob, number>;
    const patched = {} as Record<TunnelKnob, boolean>;
    for (const k of TUNNEL_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    return { values, patched };
  }

  setOnSnapshotUpdate(cb: ((s: TunnelSnapshot) => void) | null): void {
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
