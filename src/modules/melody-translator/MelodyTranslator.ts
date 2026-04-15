import { AudioModule } from "../base/AudioModule";

// ─── Musical tables ─────────────────────────────────────────────────────────

const NOTE_FREQ: Record<string, number> = {
  "C": 261.63, "C#": 277.18, "D": 293.66, "D#": 311.13,
  "E": 329.63, "F": 349.23, "F#": 369.99, "G": 392.00,
  "G#": 415.30, "A": 440.00, "A#": 466.16, "B": 493.88,
};

const SCALES: Record<string, number[]> = {
  major:      [0, 2, 4, 5, 7, 9, 11],
  minor:      [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  blues:      [0, 3, 5, 6, 7, 10],
  chromatic:  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  phrygian:   [0, 1, 3, 5, 7, 8, 10],
  lydian:     [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

export type Scale = keyof typeof SCALES;

const FREQ_RAMP_TIME = 0.05;

/**
 * Takes a normalized 0..1 data value and plays it as a musical note within a scale.
 *
 * - Two slightly detuned oscillators merged into true stereo (same as CryptoModule)
 * - Data value → scale degree → frequency within selected scale/root/octave
 * - All the Crypto module's tone controls: waveform, volume, pitch (semitones),
 *   scale, rootNote, octave, plus extra smoothing control
 */
export class MelodyTranslator extends AudioModule {
  private oscL: OscillatorNode | null = null;
  private oscR: OscillatorNode | null = null;
  private merger: ChannelMergerNode | null = null;
  private masterGain: GainNode;

  private field: string | null = null;
  private waveform: OscillatorType = "sine";
  private scale: Scale = "major";
  private rootNote = "C";
  private octave = 4;
  private pitch = 0;
  private volume = 1.0;
  private smoothing = 0.05;  // seconds

  // Modulation values per control, populated when a patch cord delivers data
  // to the control's input handle. Unpatched controls stay at their manual
  // value (effective* getters return null here → manual slider wins).
  private modValues: {
    volume: number | null;
    glide: number | null;
    pitch: number | null;
    octave: number | null;
    scale: number | null;
    root: number | null;
  } = { volume: null, glide: null, pitch: null, octave: null, scale: null, root: null };

  // Per-control input sinks — silent audio GainNodes so the AudioRouter has
  // a legal target to connect to. We don't use the audio signal; the router
  // also calls onDataInput() with the target handle id for the data path.
  private voiceInputs: Record<string, GainNode> = {};

  private currentValue = 0;
  private lastDataPool: Record<string, number> = {};

  // UI subscription — node component listens for modValue updates so sliders
  // can reflect incoming data in real time.
  private onModUpdate: (() => void) | null = null;
  setOnModUpdate(cb: (() => void) | null): void { this.onModUpdate = cb; }
  getModValues() { return { ...this.modValues, note: this.currentValue }; }

  // Names of the per-control inputs in the order they appear in the UI
  static readonly INPUT_CONTROLS = ["note", "volume", "glide", "pitch", "octave", "scale", "root"] as const;

  constructor(ctx: AudioContext) {
    super(ctx);

    this.masterGain = this.createStereoGain(0);
    this.masterGain.connect(this.outputNode);

    // Build one silent input GainNode per control. These are the routing
    // targets the AudioRouter connects edges to; the data path is independent.
    for (const name of MelodyTranslator.INPUT_CONTROLS) {
      this.voiceInputs[name] = this.createStereoGain(1);
    }
  }

  // ── Per-voice input API (for AudioRouter) ─────────────────────────────────

  getChannelInput(index: number): GainNode | null {
    const name = MelodyTranslator.INPUT_CONTROLS[index];
    return name ? this.voiceInputs[name] : null;
  }

  getChannelCount(): number {
    return MelodyTranslator.INPUT_CONTROLS.length;
  }

  /** Clear a control's modulation value when its input edge disconnects. */
  setChannelActive(index: number, hasInput: boolean): void {
    const name = MelodyTranslator.INPUT_CONTROLS[index];
    if (!name || name === "note") return;
    if (!hasInput && name in this.modValues) {
      (this.modValues as Record<string, number | null>)[name] = null;
      this.applyVolumeModulation();
      this.rampFrequency();
      this.onModUpdate?.();
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start(): void {
    if (this.isActive) return;

    const freq = this.calculateFrequency();

    // Two oscillators slightly detuned for stereo width
    this.oscL = this.ctx.createOscillator();
    this.oscR = this.ctx.createOscillator();
    this.oscL.type = this.waveform;
    this.oscR.type = this.waveform;
    this.oscL.frequency.value = freq;
    this.oscR.frequency.value = freq;
    this.oscL.detune.value = -4;
    this.oscR.detune.value = 4;

    // Merge into stereo (ChannelMergerNode has fixed channelCount — do NOT configureStereo)
    this.merger = this.ctx.createChannelMerger(2);
    this.oscL.connect(this.merger, 0, 0);
    this.oscR.connect(this.merger, 0, 1);
    this.merger.connect(this.masterGain);

    this.oscL.start();
    this.oscR.start();

    this.rampGain(this.masterGain.gain, this.volume);
    this.isActive = true;
  }

  stop(): void {
    if (!this.isActive) return;

    this.rampGain(this.masterGain.gain, 0);

    const cleanup = () => {
      try { this.oscL?.stop(); this.oscR?.stop(); } catch { /* already stopped */ }
      this.oscL?.disconnect();
      this.oscR?.disconnect();
      this.merger?.disconnect();
      this.oscL = null;
      this.oscR = null;
      this.merger = null;
    };
    setTimeout(cleanup, 30);
    this.isActive = false;
  }

  setParameter(name: string, value: any): void {
    switch (name) {
      case "field":
        this.field = value || null;
        this.applyFromPool();
        break;
      case "waveform":
        if (value === "sine" || value === "square" || value === "sawtooth" || value === "triangle") {
          this.waveform = value;
          if (this.oscL) this.oscL.type = this.waveform;
          if (this.oscR) this.oscR.type = this.waveform;
        }
        break;
      case "scale":
        if (typeof value === "string" && value in SCALES) {
          this.scale = value as Scale;
          this.rampFrequency();
        }
        break;
      case "rootNote":
        if (typeof value === "string" && value in NOTE_FREQ) {
          this.rootNote = value;
          this.rampFrequency();
        }
        break;
      case "octave":
        this.octave = Math.max(0, Math.min(8, Number(value)));
        this.rampFrequency();
        break;
      case "pitch":
        this.pitch = Math.max(-24, Math.min(24, Number(value)));
        this.rampFrequency();
        break;
      case "volume":
        this.volume = Math.max(0, Math.min(1, Number(value)));
        if (this.isActive) this.rampGain(this.masterGain.gain, this.volume);
        break;
      case "smoothing":
        this.smoothing = Math.max(0.001, Math.min(5, Number(value)));
        break;
    }
  }

  // ── Data input ────────────────────────────────────────────────────────────
  // Routing is entirely via the target handle: `in-note` drives the primary
  // melody value, `in-volume` / `in-pitch` / etc. drive their controls.
  // The specific field to read is either (a) the sourceHandle's field name
  // (e.g. "out-heart_rate" → "heart_rate"), or (b) the first key if sent as a
  // bundle.

  onDataInput(data: Record<string, number>, targetHandle?: string, sourceHandle?: string): void {
    this.lastDataPool = { ...this.lastDataPool, ...data };

    // Determine which field in the incoming data this cable carries
    const fieldName = this.pickFieldName(data, sourceHandle);
    const value = fieldName ? data[fieldName] : undefined;
    if (typeof value !== "number") return;
    const normalized = Math.max(0, Math.min(1, value));

    // Route to the control determined by the target handle
    const match = targetHandle?.match(/^in-(.+)$/);
    const control = match?.[1];

    switch (control) {
      case "note":
        this.currentValue = normalized;
        // Also remember the chosen field so the UI can show it in the dropdown
        if (fieldName && !this.field) this.field = fieldName;
        break;
      case "volume":
      case "glide":
      case "pitch":
      case "octave":
      case "scale":
      case "root":
        (this.modValues as Record<string, number | null>)[control] = normalized;
        break;
      default:
        // Unknown handle (or legacy "in-L" / "in-R") → treat as primary note drive
        this.currentValue = normalized;
        if (fieldName && !this.field) this.field = fieldName;
    }

    this.applyVolumeModulation();
    this.rampFrequency();
    this.onModUpdate?.();
  }

  /** Choose which key of the incoming data object to consume. */
  private pickFieldName(data: Record<string, number>, sourceHandle?: string): string | null {
    const match = sourceHandle?.match(/^out-(.+)$/);
    const handleField = match?.[1];
    if (handleField && handleField !== "L" && handleField !== "R" && handleField !== "all" && handleField in data) {
      return handleField;
    }
    // Fallback: first available key (works fine for single-field patches and
    // gives deterministic behaviour for ALL bundles when the note field is unset)
    const keys = Object.keys(data);
    if (keys.length === 1) return keys[0];
    // For bundles, prefer the explicit `field` selection if set
    if (this.field && this.field in data) return this.field;
    return keys[0] ?? null;
  }

  // ── Effective (modulated) values ──────────────────────────────────────────

  private effectiveVolume(): number {
    const m = this.modValues.volume;
    return m !== null ? m : this.volume;
  }

  private effectiveGlide(): number {
    const m = this.modValues.glide;
    // 0..1 → 0.01..2 seconds
    return m !== null ? 0.01 + m * 1.99 : this.smoothing;
  }

  private effectivePitch(): number {
    const m = this.modValues.pitch;
    // 0..1 → -24..+24 semitones (centered on 0 = +0 semitones at m=0.5)
    return m !== null ? -24 + m * 48 : this.pitch;
  }

  private effectiveOctave(): number {
    const m = this.modValues.octave;
    // 0..1 → 1..7
    return m !== null ? Math.round(1 + m * 6) : this.octave;
  }

  private effectiveScale(): Scale {
    const m = this.modValues.scale;
    if (m === null) return this.scale;
    const scales = Object.keys(SCALES) as Scale[];
    const idx = Math.min(scales.length - 1, Math.floor(m * scales.length));
    return scales[idx];
  }

  private effectiveRoot(): string {
    const m = this.modValues.root;
    if (m === null) return this.rootNote;
    const notes = Object.keys(NOTE_FREQ);
    const idx = Math.min(notes.length - 1, Math.floor(m * notes.length));
    return notes[idx];
  }

  /** Apply volume modulation on each data tick (frequency is applied in rampFrequency). */
  private applyVolumeModulation(): void {
    if (this.isActive) {
      this.rampGain(this.masterGain.gain, this.effectiveVolume());
    }
  }

  // ── Frequency calculation (value → scale degree → Hz) ────────────────────

  private calculateFrequency(): number {
    const baseFreq = NOTE_FREQ[this.effectiveRoot()] ?? 261.63;
    const octaveMultiplier = Math.pow(2, this.effectiveOctave() - 4);

    const intervals = SCALES[this.effectiveScale()] ?? SCALES.major;
    // Map value 0..1 to scale degree 0..(len-1)
    const degree = Math.floor(this.currentValue * intervals.length);
    const clamped = Math.max(0, Math.min(intervals.length - 1, degree));
    const semitoneOffset = intervals[clamped] + this.effectivePitch();

    const freq = baseFreq * octaveMultiplier * Math.pow(2, semitoneOffset / 12);
    // Clamp for exponentialRamp safety
    return Math.min(Math.max(freq, 1), 12000);
  }

  private rampFrequency(): void {
    if (!this.isActive || !this.oscL || !this.oscR) return;
    const freq = this.calculateFrequency();
    const t = this.ctx.currentTime + Math.max(FREQ_RAMP_TIME, this.effectiveGlide());
    this.oscL.frequency.exponentialRampToValueAtTime(freq, t);
    this.oscR.frequency.exponentialRampToValueAtTime(freq, t);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  dispose(): void {
    this.stop();
    try { this.masterGain.disconnect(); } catch { /* ok */ }
    super.dispose();
  }
}

// Expose scale list for UI imports
export const SCALE_NAMES = Object.keys(SCALES);
