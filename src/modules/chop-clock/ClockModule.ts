import { AudioModule } from "../base/AudioModule";

// Clock — metronome pulse generator. Fires a short gate (1.0 then back to 0)
// on each beat at the user-set BPM. Output signal is designed to plug into
// Pulse Translator triggers, Strobe triggers, or any knob that reacts to
// rising edges.

export const CLOCK_KNOBS = [
  "bpm",      // 0..1 → 30..300 BPM
  "gateLen",  // 0..1 → gate-on duration as fraction of beat (0..1)
  "swing",    // 0..1 → offbeat delay (0 = straight, 0.5 = max swing)
] as const;
export type ClockKnob = typeof CLOCK_KNOBS[number];

export const CLOCK_DIVISIONS = [
  { id: "1/1",  beats: 1 },
  { id: "1/2",  beats: 2 },
  { id: "1/4",  beats: 4 },
  { id: "1/8",  beats: 8 },
  { id: "1/16", beats: 16 },
  { id: "1/32", beats: 32 },
] as const;

const TICK_MS = 1000 / 60;

export interface ClockSnapshot {
  values: Record<ClockKnob, number>;
  patched: Record<ClockKnob, boolean>;
  division: string;
  currentPulse: number; // current gate value 0 or 1
  lastBeatIdx: number;  // which beat we're on (useful for UI)
  bpm: number;          // effective BPM for display
}

export class ClockModule extends AudioModule {
  private manual: Record<ClockKnob, number> = {
    bpm: 0.37,     // ~120 BPM (linear 30..300)
    gateLen: 0.1,  // 10% of beat
    swing: 0,
  };

  private modValues: Record<ClockKnob, number | null> = {
    bpm: null, gateLen: null, swing: null,
  };

  private division = "1/4";
  private phase = 0;  // 0..1 per beat
  private beatIdx = 0;
  private currentPulse = 0;

  private voiceInputs: Record<ClockKnob, GainNode> = {} as any;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private onSnapshotUpdate: ((s: ClockSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    for (const k of CLOCK_KNOBS) {
      this.voiceInputs[k] = this.createStereoGain(1);
    }
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
  }

  getChannelInput(index: number): GainNode | null {
    const name = CLOCK_KNOBS[index];
    return name ? this.voiceInputs[name] : null;
  }
  getChannelCount(): number { return CLOCK_KNOBS.length; }

  setChannelActive(index: number, hasInput: boolean): void {
    const name = CLOCK_KNOBS[index];
    if (!name) return;
    if (!hasInput && name in this.modValues) {
      this.modValues[name] = null;
      this.emit();
    }
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((CLOCK_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as ClockKnob] = Number(value);
      this.emit();
    } else if (name === "division") {
      if (CLOCK_DIVISIONS.some((d) => d.id === value)) {
        this.division = String(value);
        this.emit();
      }
    }
  }

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const match = targetHandle?.match(/^in-(.+)$/);
    const knob = match?.[1] as ClockKnob | undefined;
    if (!knob || !(CLOCK_KNOBS as readonly string[]).includes(knob)) return;
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

  private effective(knob: ClockKnob): number {
    const m = this.modValues[knob];
    return m === null ? this.manual[knob] : m;
  }

  // ── Tick — advance beat phase, emit gate pulse ────────────────────────

  private tick(): void {
    const bpm = 30 + this.effective("bpm") * 270; // 30..300
    const divisionBeats = CLOCK_DIVISIONS.find((d) => d.id === this.division)?.beats ?? 4;
    const beatsPerSecond = (bpm / 60) * (divisionBeats / 4); // 1/4 is the baseline
    const phaseAdvance = beatsPerSecond * (TICK_MS / 1000);
    this.phase += phaseAdvance;
    while (this.phase >= 1) {
      this.phase -= 1;
      this.beatIdx++;
    }

    // Swing: even beats are straight; odd beats are delayed by up to 50%
    const swing = this.effective("swing");
    const isOff = this.beatIdx % 2 === 1;
    const swingOffset = isOff ? swing * 0.5 : 0;
    const effectivePhase = this.phase - swingOffset;

    // Gate is high for first `gateLen` fraction of each beat
    const gateLen = Math.max(0.01, this.effective("gateLen"));
    this.currentPulse = effectivePhase >= 0 && effectivePhase < gateLen ? 1 : 0;

    this.emit();
  }

  // ── Data output ─────────────────────────────────────────────────────────

  getDataOutput(): Record<string, number> {
    return { gate: this.currentPulse, phase: this.phase };
  }

  // ── UI hooks ────────────────────────────────────────────────────────────

  getSnapshot(): ClockSnapshot {
    const values = {} as Record<ClockKnob, number>;
    const patched = {} as Record<ClockKnob, boolean>;
    for (const k of CLOCK_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    return {
      values,
      patched,
      division: this.division,
      currentPulse: this.currentPulse,
      lastBeatIdx: this.beatIdx,
      bpm: 30 + this.effective("bpm") * 270,
    };
  }

  setOnSnapshotUpdate(cb: ((s: ClockSnapshot) => void) | null): void {
    this.onSnapshotUpdate = cb;
  }

  private emit(): void {
    this.onSnapshotUpdate?.(this.getSnapshot());
  }

  dispose(): void {
    this.stop();
    if (this.tickHandle !== null) clearInterval(this.tickHandle);
    this.tickHandle = null;
    this.onSnapshotUpdate = null;
    super.dispose();
  }
}
