import { AudioModule } from "../base/AudioModule";

// Preamp — clean gain stage with tube-style warmth and tonal EQ. Designed as
// the "go first in your chain" module for bringing quiet sources up, adding
// gentle color, and shaping the low/high ends before further processing.
//
// Signal flow:
//   input → [inputGain] → [body shelf] → [presence shelf] → [drive waveshaper]
//         → [outputGain] → output
//   plus a parallel dry path blended by `mix` for preserving transients.

export const PREAMP_KNOBS = [
  "gain",     // input-side clean gain (0..40 dB)
  "drive",    // soft-saturation amount (0..1 → tanh curve strength)
  "body",     // low-shelf at 250Hz  (-12..+12 dB)
  "presence", // high-shelf at 5kHz  (-12..+12 dB)
  "width",    // stereo spread (0 = mono, 1 = ~15ms Haas delay on R + tonal split)
  "output",   // output trim (-24..+6 dB)
  "mix",      // dry/wet (0 = clean, 1 = fully processed)
] as const;
export type PreampKnob = typeof PREAMP_KNOBS[number];

export interface PreampSnapshot {
  values: Record<PreampKnob, number>;
  patched: Record<PreampKnob, boolean>;
}

// ── Waveshaper curve — tube-ish soft saturation ────────────────────────────
// tanh(x * k) with k determined by drive amount. k=1 is subtle, k=20 is hard.
function buildTubeCurve(drive: number): Float32Array {
  const samples = 2048;
  const k = 1 + drive * drive * 25; // quadratic curve so low drive stays subtle
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    // Normalize so peak output at x=±1 is still ±1 — prevents level jumps
    curve[i] = Math.tanh(x * k) / Math.tanh(k);
  }
  return curve;
}

export class PreampModule extends AudioModule {
  // Processing graph
  private inputGain: GainNode;
  private bodyShelf: BiquadFilterNode;
  private presenceShelf: BiquadFilterNode;
  private driveShaper: WaveShaperNode;
  private outputGain: GainNode;
  // Dry/wet mix
  private dryGain: GainNode;
  private wetGain: GainNode;
  // Stereo widener: splits the signal into L/R, delays the R channel by up to
  // 15ms (Haas effect) to create a stereo image from mono sources, then
  // recombines. Width knob drives the delay time.
  private widthSplitter: ChannelSplitterNode;
  private widthMerger: ChannelMergerNode;
  private widthDelayR: DelayNode;

  // Manual (slider) values — stored in their user-facing units
  private manual: Record<PreampKnob, number> = {
    gain: 6,       // dB
    drive: 0.2,    // 0..1
    body: 0,       // dB
    presence: 0,   // dB
    width: 0.4,    // 0..1 stereo spread
    output: 0,     // dB
    mix: 1.0,      // 0..1
  };

  // Modulation values — if patched, each is stored as 0..1
  private modValues: Record<PreampKnob, number | null> = {
    gain: null, drive: null, body: null,
    presence: null, width: null, output: null, mix: null,
  };

  private voiceInputs: Record<PreampKnob, GainNode> = {} as any;
  private onModUpdate: (() => void) | null = null;

  // Ordered input handle IDs for the AudioRouter. Indexes 0 and 1 are the
  // L and R audio inputs (both route to the same stereo inputNode — they
  // are visual conventions that match the rest of the app). Indexes 2..8
  // are the modulation sinks for each knob.
  static readonly INPUT_HANDLE_IDS = [
    "in-audio-L",
    "in-audio-R",
    ...PREAMP_KNOBS.map((k) => `in-${k}`),
  ] as const;

  constructor(ctx: AudioContext) {
    super(ctx);

    // Build processing chain
    this.inputGain = this.createStereoGain(1);
    this.bodyShelf = ctx.createBiquadFilter();
    this.bodyShelf.type = "lowshelf";
    this.bodyShelf.frequency.value = 250;
    this.configureStereo(this.bodyShelf);

    this.presenceShelf = ctx.createBiquadFilter();
    this.presenceShelf.type = "highshelf";
    this.presenceShelf.frequency.value = 5000;
    this.configureStereo(this.presenceShelf);

    this.driveShaper = ctx.createWaveShaper();
    this.driveShaper.curve = buildTubeCurve(this.manual.drive);
    this.driveShaper.oversample = "4x";
    this.configureStereo(this.driveShaper);

    // Stereo widener — Haas effect. The input stereo signal is split into L/R,
    // then the R channel is delayed by up to 15ms before being merged back.
    // When the source is mono (L == R), the tiny delay creates an instant
    // sense of stereo width without phase cancellation when re-summed to
    // mono (because Haas delays are short enough to be perceived as direction,
    // not echo).
    this.widthSplitter = ctx.createChannelSplitter(2);
    this.widthMerger = ctx.createChannelMerger(2);
    this.widthDelayR = ctx.createDelay(0.05); // up to 50ms max buffer
    this.widthDelayR.delayTime.value = 0;

    this.outputGain = this.createStereoGain(1);
    this.dryGain = this.createStereoGain(0);
    this.wetGain = this.createStereoGain(1);

    // Wet chain:
    //   input → gain → shelves → drive → splitter → { L, R→delay } → merger
    //         → outputGain → wetGain → output
    this.inputNode.connect(this.inputGain);
    this.inputGain.connect(this.bodyShelf);
    this.bodyShelf.connect(this.presenceShelf);
    this.presenceShelf.connect(this.driveShaper);
    this.driveShaper.connect(this.widthSplitter);
    // L channel goes straight through to merger input 0
    this.widthSplitter.connect(this.widthMerger, 0, 0);
    // R channel goes through the delay then to merger input 1
    this.widthSplitter.connect(this.widthDelayR, 1);
    this.widthDelayR.connect(this.widthMerger, 0, 1);
    this.widthMerger.connect(this.outputGain);
    this.outputGain.connect(this.wetGain);
    this.wetGain.connect(this.outputNode);

    // Dry path: input → dryGain → output (bypasses all processing)
    this.inputNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);

    // Apply initial values
    this.applyAll();

    // Build silent patch-target inputs, one per knob
    for (const name of PREAMP_KNOBS) {
      this.voiceInputs[name] = this.createStereoGain(1);
    }
  }

  // ── Per-voice input API ─────────────────────────────────────────────────
  //
  // Indexes 0 and 1 are the audio inputs (L/R — both map to the same stereo
  // inputNode; Web Audio handles the stereo summing internally when the user
  // plugs a stereo source into either one).
  // Indexes 2..8 are modulation sinks for each knob.

  getChannelInput(index: number): GainNode | null {
    if (index === 0 || index === 1) return this.inputNode as GainNode;
    const name = PREAMP_KNOBS[index - 2];
    return name ? this.voiceInputs[name] : null;
  }

  getChannelCount(): number {
    return 2 + PREAMP_KNOBS.length;
  }

  setChannelActive(index: number, hasInput: boolean): void {
    // Audio inputs (indexes 0 and 1) don't have modulation state to clear
    if (index === 0 || index === 1) return;
    const name = PREAMP_KNOBS[index - 2];
    if (!name) return;
    if (!hasInput && name in this.modValues) {
      this.modValues[name] = null;
      this.applyAll();
      this.onModUpdate?.();
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if ((PREAMP_KNOBS as readonly string[]).includes(name)) {
      this.manual[name as PreampKnob] = Number(value);
      this.applyAll();
      this.onModUpdate?.();
    }
  }

  // ── Data input ─────────────────────────────────────────────────────────

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    const match = targetHandle?.match(/^in-(.+)$/);
    const knob = match?.[1] as PreampKnob | undefined;
    if (!knob || !(PREAMP_KNOBS as readonly string[]).includes(knob)) return;

    const fieldName = this.pickFieldName(data, sourceHandle);
    const value = fieldName ? data[fieldName] : undefined;
    if (typeof value !== "number") return;

    this.modValues[knob] = Math.max(0, Math.min(1, value));
    this.applyAll();
    this.onModUpdate?.();
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

  // ── Effective value lookup — manual, or 0..1 mod mapped into the knob's
  //    native range. Values are returned in user-facing units.

  private effective(knob: PreampKnob): number {
    const m = this.modValues[knob];
    if (m === null) return this.manual[knob];
    switch (knob) {
      case "gain":     return m * 40;          // 0..40 dB
      case "drive":    return m;               // 0..1
      case "body":     return -12 + m * 24;    // -12..+12 dB
      case "presence": return -12 + m * 24;    // -12..+12 dB
      case "width":    return m;               // 0..1
      case "output":   return -24 + m * 30;    // -24..+6 dB
      case "mix":      return m;               // 0..1
    }
  }

  /** Push all effective values into the audio graph. */
  private applyAll(): void {
    const gainDb    = this.effective("gain");
    const drive     = this.effective("drive");
    const bodyDb    = this.effective("body");
    const presDb    = this.effective("presence");
    const width     = this.effective("width");
    const outDb     = this.effective("output");
    const mix       = this.effective("mix");

    const now = this.ctx.currentTime;
    // Input gain: linear scale from dB
    this.inputGain.gain.setTargetAtTime(dbToLinear(gainDb), now, 0.02);
    // Output gain: linear scale from dB
    this.outputGain.gain.setTargetAtTime(dbToLinear(outDb), now, 0.02);
    // Shelves
    this.bodyShelf.gain.setTargetAtTime(bodyDb, now, 0.02);
    this.presenceShelf.gain.setTargetAtTime(presDb, now, 0.02);
    // Drive: rebuild curve (only when it changes meaningfully)
    if (Math.abs((this.driveShaper as any)._lastDrive - drive) > 0.005 ||
        (this.driveShaper as any)._lastDrive === undefined) {
      this.driveShaper.curve = buildTubeCurve(drive);
      (this.driveShaper as any)._lastDrive = drive;
    }
    // Width: Haas delay on R channel, 0..15ms. Subtle at low values,
    // obvious stereo spread at high values. Above ~15ms it stops sounding
    // like stereo and starts sounding like a discrete echo, so we cap there.
    const delaySec = width * 0.015;
    this.widthDelayR.delayTime.setTargetAtTime(delaySec, now, 0.05);
    // Dry/wet mix. Equal-power crossfade so the level stays roughly constant.
    const wetLin = Math.sin((mix * Math.PI) / 2);
    const dryLin = Math.cos((mix * Math.PI) / 2);
    this.wetGain.gain.setTargetAtTime(wetLin, now, 0.02);
    this.dryGain.gain.setTargetAtTime(dryLin, now, 0.02);
  }

  // ── UI sync ────────────────────────────────────────────────────────────

  getSnapshot(): PreampSnapshot {
    const values = {} as Record<PreampKnob, number>;
    const patched = {} as Record<PreampKnob, boolean>;
    for (const k of PREAMP_KNOBS) {
      values[k] = this.effective(k);
      patched[k] = this.modValues[k] !== null;
    }
    return { values, patched };
  }

  setOnModUpdate(cb: (() => void) | null): void { this.onModUpdate = cb; }

  // ── Cleanup ────────────────────────────────────────────────────────────

  dispose(): void {
    this.stop();
    try {
      this.inputGain.disconnect();
      this.bodyShelf.disconnect();
      this.presenceShelf.disconnect();
      this.driveShaper.disconnect();
      this.widthSplitter.disconnect();
      this.widthMerger.disconnect();
      this.widthDelayR.disconnect();
      this.outputGain.disconnect();
      this.dryGain.disconnect();
      this.wetGain.disconnect();
    } catch { /* ok */ }
    super.dispose();
  }
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}
