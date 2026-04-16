import { AudioModule } from "../base/AudioModule";

// Network graph visualizer — 8 node-activation inputs drive individual nodes,
// 4 global knobs style the rendering.
export const NETWORK_KNOBS = [
  "node1", "node2", "node3", "node4",
  "node5", "node6", "node7", "node8",
  "decay",       // how quickly activation fades (seconds)
  "connections", // edge density: 0 = ring only, 1 = fully-connected
  "color",       // hue offset
  "glow",        // edge/node glow intensity
] as const;
export type NetworkKnob = typeof NETWORK_KNOBS[number];

export interface NetworkSnapshot {
  values: Record<NetworkKnob, number>;
  patched: Record<NetworkKnob, boolean>;
}

/**
 * Network-graph visualizer. Eight nodes arranged on a circle, each receiving
 * its own 0..1 activation value via patch cord. A ringing / pulsing effect is
 * created by decaying the activation over time — downstream sources (EEG,
 * drum triggers) make the graph "light up" exactly where activity happens.
 */
export class NetworkModule extends AudioModule {
  private manual: Record<NetworkKnob, number> = {
    node1: 0, node2: 0, node3: 0, node4: 0,
    node5: 0, node6: 0, node7: 0, node8: 0,
    decay: 0.5,
    connections: 0.3,
    color: 0.55,
    glow: 0.6,
  };

  private modValues: Record<NetworkKnob, number | null> = {
    node1: null, node2: null, node3: null, node4: null,
    node5: null, node6: null, node7: null, node8: null,
    decay: null, connections: null, color: null, glow: null,
  };

  private voiceInputs: Record<NetworkKnob, GainNode> = {} as any;
  private onSnapshotUpdate: ((s: NetworkSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (const k of NETWORK_KNOBS) {
      this.voiceInputs[k] = this.createStereoGain(1);
    }
  }

  getChannelInput(index: number): GainNode | null {
    const name = NETWORK_KNOBS[index];
    return name ? this.voiceInputs[name] : null;
  }
  getChannelCount(): number { return NETWORK_KNOBS.length; }

  setChannelActive(index: number, hasInput: boolean): void {
    const name = NETWORK_KNOBS[index];
    if (!name) return;
    if (!hasInput && name in this.modValues) {
      this.modValues[name] = null;
      this.emit();
    }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((NETWORK_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as NetworkKnob] = Number(value);
      this.emit();
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const match = targetHandle?.match(/^in-(.+)$/);
    const knob = match?.[1] as NetworkKnob | undefined;
    if (!knob || !(NETWORK_KNOBS as readonly string[]).includes(knob)) return;

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

  private effective(knob: NetworkKnob): number {
    const m = this.modValues[knob];
    if (m === null) return this.manual[knob];
    switch (knob) {
      case "node1": case "node2": case "node3": case "node4":
      case "node5": case "node6": case "node7": case "node8":
        return m;                            // 0..1 (raw activation)
      case "decay":       return 0.05 + m * 2.95; // 0.05..3 seconds
      case "connections": return m;               // 0..1
      case "color":       return m;               // 0..1
      case "glow":        return m;               // 0..1
    }
  }

  getSnapshot(): NetworkSnapshot {
    const values = {} as Record<NetworkKnob, number>;
    const patched = {} as Record<NetworkKnob, boolean>;
    for (const k of NETWORK_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    return { values, patched };
  }

  setOnSnapshotUpdate(cb: ((s: NetworkSnapshot) => void) | null): void {
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
