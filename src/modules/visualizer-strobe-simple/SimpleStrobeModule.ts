import { AudioModule } from "../base/AudioModule";

// Stripped-down strobe — just pure white flashing with two controls:
//   speed    = flash rate in Hz
//   density  = fraction of each cycle that's "on" (duty cycle)
// Both knobs are patchable like the other visualizers.

export const SIMPLE_STROBE_KNOBS = ["speed", "density"] as const;
export type SimpleStrobeKnob = typeof SIMPLE_STROBE_KNOBS[number];

export interface SimpleStrobeSnapshot {
  values: Record<SimpleStrobeKnob, number>;
  patched: Record<SimpleStrobeKnob, boolean>;
}

export class SimpleStrobeModule extends AudioModule {
  private manual: Record<SimpleStrobeKnob, number> = {
    speed: 0.2,    // default ≈ 5 Hz
    density: 0.2,  // default 20% on per cycle
  };

  private modValues: Record<SimpleStrobeKnob, number | null> = {
    speed: null, density: null,
  };

  private voiceInputs: Record<SimpleStrobeKnob, GainNode> = {} as any;
  private onSnapshotUpdate: ((s: SimpleStrobeSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (const k of SIMPLE_STROBE_KNOBS) {
      this.voiceInputs[k] = this.createStereoGain(1);
    }
  }

  getChannelInput(index: number): GainNode | null {
    const name = SIMPLE_STROBE_KNOBS[index];
    return name ? this.voiceInputs[name] : null;
  }
  getChannelCount(): number { return SIMPLE_STROBE_KNOBS.length; }

  setChannelActive(index: number, hasInput: boolean): void {
    const name = SIMPLE_STROBE_KNOBS[index];
    if (!name) return;
    if (!hasInput && name in this.modValues) {
      this.modValues[name] = null;
      this.emit();
    }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((SIMPLE_STROBE_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as SimpleStrobeKnob] = Number(value);
      this.emit();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const match = targetHandle?.match(/^in-(.+)$/);
    const knob = match?.[1] as SimpleStrobeKnob | undefined;
    if (!knob || !(SIMPLE_STROBE_KNOBS as readonly string[]).includes(knob)) return;

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

  private effective(knob: SimpleStrobeKnob): number {
    const m = this.modValues[knob];
    return m === null ? this.manual[knob] : m;
  }

  getSnapshot(): SimpleStrobeSnapshot {
    const values = {} as Record<SimpleStrobeKnob, number>;
    const patched = {} as Record<SimpleStrobeKnob, boolean>;
    for (const k of SIMPLE_STROBE_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    return { values, patched };
  }

  setOnSnapshotUpdate(cb: ((s: SimpleStrobeSnapshot) => void) | null): void {
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
