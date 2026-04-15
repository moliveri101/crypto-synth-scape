import { AudioModule } from "../base/AudioModule";

// ─── Types ──────────────────────────────────────────────────────────────────

export const DRUM_VOICES = [
  "kick", "snare", "hihat-closed", "hihat-open",
  "clap", "tom", "ride", "cowbell",
] as const;

export type DrumVoice = (typeof DRUM_VOICES)[number];

export type DataAlgorithm = "euclidean" | "threshold" | "probability" | "velocity";

export interface Step {
  active: boolean;
  velocity: number;   // 0–1
  probability: number; // 0–1
}

export interface TrackConfig {
  voice: DrumVoice;
  steps: Step[];
  volume: number;
  pitchOffset: number; // semitones
  mute: boolean;
  solo: boolean;
  dataField: string | null;
  dataAlgorithm: DataAlgorithm;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STEP_COUNT = 16;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.1;

// Pulse / gate detection on per-voice inputs
const PULSE_MONITOR_MS = 10;        // poll analysers every 10ms
const PULSE_RMS_THRESHOLD = 0.05;   // RMS above this counts as a pulse
const PULSE_DEBOUNCE_MS = 60;       // min gap between consecutive triggers per voice

const DEFAULT_STEP: Step = { active: false, velocity: 0.8, probability: 1.0 };

function makeDefaultTrack(voice: DrumVoice): TrackConfig {
  const steps = Array.from({ length: STEP_COUNT }, () => ({ ...DEFAULT_STEP }));
  // Kick on 1, 5, 9, 13
  if (voice === "kick") {
    [0, 4, 8, 12].forEach((i) => { steps[i].active = true; });
  }
  // Snare on 5, 13
  if (voice === "snare") {
    [4, 12].forEach((i) => { steps[i].active = true; });
  }
  // Hihat-closed on every other step
  if (voice === "hihat-closed") {
    [0, 2, 4, 6, 8, 10, 12, 14].forEach((i) => { steps[i].active = true; });
  }
  return {
    voice,
    steps,
    volume: 0.8,
    pitchOffset: 0,
    mute: false,
    solo: false,
    dataField: null,
    dataAlgorithm: "euclidean",
  };
}

export function createDefaultTracks(): TrackConfig[] {
  return DRUM_VOICES.map((v) => makeDefaultTrack(v));
}

// ─── Euclidean rhythm generator (Bjorklund) ─────────────────────────────────

function euclidean(steps: number, pulses: number): boolean[] {
  if (pulses <= 0) return Array(steps).fill(false);
  if (pulses >= steps) return Array(steps).fill(true);

  let pattern: number[][] = [];
  for (let i = 0; i < steps; i++) {
    pattern.push(i < pulses ? [1] : [0]);
  }

  let level = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const counts = new Map<string, number>();
    for (const p of pattern) {
      const k = p.join(",");
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    if (counts.size <= 1) break;

    // Find the two most common sub-patterns
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const mainKey = sorted[0][0];
    const remKey = sorted[sorted.length - 1][0];
    if (sorted[sorted.length - 1][1] <= 1 && level > 10) break;

    const mainPats: number[][] = [];
    const remPats: number[][] = [];
    for (const p of pattern) {
      if (p.join(",") === mainKey) mainPats.push(p);
      else remPats.push(p);
    }

    const merged: number[][] = [];
    const minLen = Math.min(mainPats.length, remPats.length);
    for (let i = 0; i < minLen; i++) {
      merged.push([...mainPats[i], ...remPats[i]]);
    }
    for (let i = minLen; i < mainPats.length; i++) merged.push(mainPats[i]);
    for (let i = minLen; i < remPats.length; i++) merged.push(remPats[i]);

    pattern = merged;
    level++;
    if (level > 20) break;
  }

  return pattern.flat().map((v) => v === 1);
}

// Beat-priority ordering: downbeats first, then upbeats, then all others
const BEAT_PRIORITY = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15];

// ─── Audio Module ───────────────────────────────────────────────────────────

export class DataDrumMachine extends AudioModule {
  private tracks: TrackConfig[];
  private bpm = 120;
  private swing = 0; // 0–1
  private currentStep = 0;
  private nextStepTime = 0;
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private stepCallback: ((step: number) => void) | null = null;
  private dataValues: Record<string, number> = {};

  // Per-track gain nodes → outputNode
  private trackGains: GainNode[];

  // Per-voice data inputs (silent audio sinks — purely for patch-cord routing)
  private voiceInputs: GainNode[];

  // Per-voice analysers for pulse / gate detection on incoming audio
  private voiceAnalysers: AnalyserNode[];
  private pulseMonitorBuffer: Uint8Array;
  private pulseMonitorHandle: ReturnType<typeof setInterval> | null = null;
  private lastPulseTime: number[] = [];

  // Most recent data received per voice via patch cord (for Generate to reuse)
  private voiceData: Map<number, Record<string, number>> = new Map();

  // Which voice inputs currently have an edge terminating at them
  private connectedVoices: Set<number> = new Set();

  constructor(ctx: AudioContext) {
    super(ctx);

    this.tracks = createDefaultTracks();

    this.trackGains = this.tracks.map(() => {
      const g = this.createStereoGain(0.8);
      g.connect(this.outputNode);
      return g;
    });

    // Per-voice inputs + analysers for pulse detection.
    // The input GainNode is at unity (gain=1) so the analyser sees the full
    // signal — but we DON'T connect the input to outputNode, so the audio
    // doesn't propagate to the speakers. The analyser is a terminal sink.
    this.voiceInputs = [];
    this.voiceAnalysers = [];
    for (let i = 0; i < this.tracks.length; i++) {
      const input = this.createStereoGain(1);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0;
      this.configureStereo(analyser);
      input.connect(analyser); // signal flows in at unity, analyser observes it, nothing else hears it
      this.voiceInputs.push(input);
      this.voiceAnalysers.push(analyser);
      this.lastPulseTime.push(0);
    }
    this.pulseMonitorBuffer = new Uint8Array(256);
  }

  // ── Per-voice input API (for AudioRouter) ─────────────────────────────────

  getChannelInput(index: number): GainNode | null {
    return this.voiceInputs[index] ?? null;
  }

  getChannelCount(): number {
    return this.voiceInputs.length;
  }

  setChannelActive(index: number, hasInput: boolean): void {
    if (index < 0 || index >= this.voiceInputs.length) return;
    if (hasInput) this.connectedVoices.add(index);
    else {
      this.connectedVoices.delete(index);
      this.voiceData.delete(index);
    }
  }

  getConnectedVoices(): number[] {
    return [...this.connectedVoices].sort((a, b) => a - b);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.currentStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.005;
    this.timerHandle = setInterval(() => this.schedule(), LOOKAHEAD_MS);

    // Start pulse detection on per-voice inputs (bypasses the step grid)
    if (this.pulseMonitorHandle === null) {
      this.pulseMonitorHandle = setInterval(() => this.monitorPulses(), PULSE_MONITOR_MS);
    }
  }

  stop(): void {
    if (!this.isActive) return;
    this.isActive = false;
    if (this.timerHandle !== null) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
    if (this.pulseMonitorHandle !== null) {
      clearInterval(this.pulseMonitorHandle);
      this.pulseMonitorHandle = null;
    }
    this.currentStep = 0;
  }

  // ── Pulse / gate detection on per-voice inputs ───────────────────────────
  // Any audio reaching a voice's input (e.g. from a Sequencer or oscillator)
  // that exceeds PULSE_RMS_THRESHOLD triggers that voice immediately,
  // bypassing the step pattern. Per-voice debounce prevents double-fires.
  private monitorPulses(): void {
    const now = performance.now();
    for (let i = 0; i < this.voiceAnalysers.length; i++) {
      // Only monitor voices that actually have a connection
      if (!this.connectedVoices.has(i)) continue;

      const a = this.voiceAnalysers[i];
      a.getByteTimeDomainData(this.pulseMonitorBuffer);

      // RMS calculation
      let sum = 0;
      for (let j = 0; j < this.pulseMonitorBuffer.length; j++) {
        const sample = (this.pulseMonitorBuffer[j] - 128) / 128;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / this.pulseMonitorBuffer.length);

      if (rms > PULSE_RMS_THRESHOLD && now - this.lastPulseTime[i] > PULSE_DEBOUNCE_MS) {
        this.lastPulseTime[i] = now;
        // Velocity scales with the pulse amplitude (clamped 0.4–1)
        const vel = Math.min(1, 0.4 + rms);
        this.triggerVoice(i, this.tracks[i].voice, this.ctx.currentTime, vel);
      }
    }
  }

  // ── Scheduling ────────────────────────────────────────────────────────────

  private schedule(): void {
    const deadline = this.ctx.currentTime + SCHEDULE_AHEAD;
    while (this.nextStepTime < deadline) {
      this.scheduleStep(this.currentStep, this.nextStepTime);
      this.advanceStep();
    }
  }

  private scheduleStep(step: number, time: number): void {
    const anySoloed = this.tracks.some((t) => t.solo);

    for (let i = 0; i < this.tracks.length; i++) {
      const track = this.tracks[i];

      // Audibility: solo takes priority, then mute
      if (anySoloed && !track.solo) continue;
      if (track.mute) continue;

      const s = track.steps[step % STEP_COUNT];
      if (!s.active) continue;
      if (Math.random() > s.probability) continue;

      // Swing: offset odd steps
      const swingOffset = step % 2 === 1 ? this.swing * this.getStepDuration() * 0.5 : 0;

      this.triggerVoice(i, track.voice, time + swingOffset, s.velocity);
    }

    // Visual callback
    if (this.stepCallback) {
      const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
      const cb = this.stepCallback;
      const s = step;
      setTimeout(() => cb(s), delayMs);
    }
  }

  private advanceStep(): void {
    this.nextStepTime += this.getStepDuration();
    this.currentStep = (this.currentStep + 1) % STEP_COUNT;
  }

  private getStepDuration(): number {
    return 60 / this.bpm / 4;
  }

  // ── Voice synthesis ───────────────────────────────────────────────────────

  private triggerVoice(trackIndex: number, voice: DrumVoice, time: number, velocity: number): void {
    const target = this.trackGains[trackIndex];
    const pitch = Math.pow(2, this.tracks[trackIndex].pitchOffset / 12);

    switch (voice) {
      case "kick":      this.playKick(target, time, velocity, pitch); break;
      case "snare":     this.playSnare(target, time, velocity, pitch); break;
      case "hihat-closed": this.playHihatClosed(target, time, velocity); break;
      case "hihat-open":   this.playHihatOpen(target, time, velocity); break;
      case "clap":      this.playClap(target, time, velocity); break;
      case "tom":       this.playTom(target, time, velocity, pitch); break;
      case "ride":      this.playRide(target, time, velocity); break;
      case "cowbell":   this.playCowbell(target, time, velocity, pitch); break;
    }
  }

  private playKick(target: GainNode, t: number, vel: number, pitch: number): void {
    const osc = this.ctx.createOscillator();
    const env = this.createStereoGain(0);
    osc.type = "sine";
    osc.frequency.setValueAtTime(150 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(40 * pitch, t + 0.5);
    env.gain.setValueAtTime(vel, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(env);
    env.connect(target);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  private playSnare(target: GainNode, t: number, vel: number, pitch: number): void {
    // Tone body
    const osc = this.ctx.createOscillator();
    const envT = this.createStereoGain(0);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180 * pitch, t);
    envT.gain.setValueAtTime(vel * 0.7, t);
    envT.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(envT);
    envT.connect(target);
    osc.start(t);
    osc.stop(t + 0.2);

    // Noise layer
    this.playNoise(target, t, 0.2, "highpass", 1000, 0.7, vel);
  }

  private playHihatClosed(target: GainNode, t: number, vel: number): void {
    this.playNoise(target, t, 0.08, "highpass", 7000, 1.0, vel);
  }

  private playHihatOpen(target: GainNode, t: number, vel: number): void {
    this.playNoise(target, t, 0.3, "highpass", 5000, 0.8, vel);
  }

  private playClap(target: GainNode, t: number, vel: number): void {
    // Multi-burst noise
    for (let i = 0; i < 3; i++) {
      this.playNoise(target, t + i * 0.01, 0.04, "bandpass", 2000, 1.5, vel * 0.8);
    }
    this.playNoise(target, t + 0.03, 0.15, "bandpass", 2000, 0.5, vel);
  }

  private playTom(target: GainNode, t: number, vel: number, pitch: number): void {
    const osc = this.ctx.createOscillator();
    const env = this.createStereoGain(0);
    osc.type = "sine";
    osc.frequency.setValueAtTime(220 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(120 * pitch, t + 0.4);
    env.gain.setValueAtTime(vel, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(env);
    env.connect(target);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  private playRide(target: GainNode, t: number, vel: number): void {
    this.playNoise(target, t, 0.4, "highpass", 6000, 0.3, vel * 0.6);
  }

  private playCowbell(target: GainNode, t: number, vel: number, pitch: number): void {
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const env = this.createStereoGain(0);
    osc1.type = "square";
    osc2.type = "square";
    osc1.frequency.setValueAtTime(560 * pitch, t);
    osc2.frequency.setValueAtTime(845 * pitch, t);
    env.gain.setValueAtTime(vel * 0.5, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc1.connect(env);
    osc2.connect(env);
    env.connect(target);
    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.2);
    osc2.stop(t + 0.2);
  }

  /** Stereo noise burst through a filter into a target node. */
  private playNoise(
    target: GainNode, t: number, decay: number,
    filterType: BiquadFilterType, freq: number, q: number, vel: number,
  ): void {
    const bufferSize = this.ctx.sampleRate * 0.5;
    const buffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);
    const L = buffer.getChannelData(0);
    const R = buffer.getChannelData(1);
    for (let i = 0; i < bufferSize; i++) {
      L[i] = Math.random() * 2 - 1;
      R[i] = Math.random() * 2 - 1;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filt = this.ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = freq;
    filt.Q.value = q;

    const env = this.createStereoGain(0);
    env.gain.setValueAtTime(vel, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + decay);

    src.connect(filt);
    filt.connect(env);
    env.connect(target);
    src.start(t);
    src.stop(t + decay);
  }

  // ── Parameters ────────────────────────────────────────────────────────────

  setParameter(name: string, value: any): void {
    switch (name) {
      case "bpm":
        this.bpm = Math.max(40, Math.min(300, value as number));
        break;
      case "swing":
        this.swing = Math.max(0, Math.min(1, value as number));
        break;
      case "tracks":
        this.tracks = value as TrackConfig[];
        break;
      case "trackStep": {
        const { trackIndex, stepIndex, step } = value as {
          trackIndex: number; stepIndex: number; step: Partial<Step>;
        };
        if (this.tracks[trackIndex]?.steps[stepIndex]) {
          Object.assign(this.tracks[trackIndex].steps[stepIndex], step);
        }
        break;
      }
      case "trackConfig": {
        const { trackIndex: ti, ...rest } = value as { trackIndex: number } & Partial<TrackConfig>;
        if (this.tracks[ti]) {
          // Detect whether the data mapping changed — if so, regenerate live
          const fieldChanged =
            "dataField" in rest && rest.dataField !== this.tracks[ti].dataField;
          const algoChanged =
            "dataAlgorithm" in rest && rest.dataAlgorithm !== this.tracks[ti].dataAlgorithm;

          Object.assign(this.tracks[ti], rest);

          // Sync gain node for volume/mute
          const vol = this.tracks[ti].mute ? 0 : this.tracks[ti].volume;
          this.rampGain(this.trackGains[ti].gain, vol);

          // Live regenerate when field or algorithm changes
          if ((fieldChanged || algoChanged) && this.tracks[ti].dataField) {
            this.generatePatternForTrack(ti);
          }
        }
        break;
      }
    }
  }

  // ── Data input (from connected source modules via patch cord) ──────────

  onDataInput(data: Record<string, number>, targetHandle?: string): void {
    // Normalize once — all fields clamped to 0..1
    const normalized: Record<string, number> = {};
    for (const [field, value] of Object.entries(data)) {
      normalized[field] = Math.max(0, Math.min(1, value));
    }

    // Per-voice routing: if the handle identifies a specific voice (in-N),
    // store the data against that voice and regenerate only that track.
    const voiceIndex = this.parseVoiceHandle(targetHandle);
    if (voiceIndex !== null) {
      this.voiceData.set(voiceIndex, normalized);
      // Merge into shared pool too, so the UI's field dropdown sees them
      Object.assign(this.dataValues, normalized);
      this.generatePatternForTrack(voiceIndex);
      return;
    }

    // Back-compat: no handle specified → shared-pool behavior
    let changed = false;
    for (const [field, value] of Object.entries(normalized)) {
      if (this.dataValues[field] !== value) {
        this.dataValues[field] = value;
        changed = true;
      }
    }
    if (changed) this.generatePatterns();
  }

  private parseVoiceHandle(handle: string | undefined): number | null {
    if (!handle) return null;
    const match = handle.match(/^in-(\d+)$/);
    if (!match) return null;
    const n = parseInt(match[1], 10);
    if (n < 0 || n >= this.tracks.length) return null;
    return n;
  }

  /** Regenerate the pattern for a single track using its most recent voice data. */
  private generatePatternForTrack(trackIndex: number): void {
    const track = this.tracks[trackIndex];
    if (!track?.dataField) return;

    // Prefer voice-specific data, fall back to shared pool
    const perVoice = this.voiceData.get(trackIndex);
    const pool = perVoice ?? this.dataValues;
    const val = pool[track.dataField] ?? 0.5;

    this.applyAlgorithmToTrack(track, val);
  }

  /** Factored algorithm application so per-track and all-tracks paths share code. */
  private applyAlgorithmToTrack(track: TrackConfig, val: number): void {
    switch (track.dataAlgorithm) {
      case "euclidean": {
        const pulses = Math.round(val * STEP_COUNT);
        const pattern = euclidean(STEP_COUNT, pulses);
        for (let i = 0; i < STEP_COUNT; i++) {
          track.steps[i].active = pattern[i];
          track.steps[i].velocity = 0.7 + val * 0.3;
          track.steps[i].probability = 1.0;
        }
        break;
      }
      case "threshold": {
        const count = Math.round(val * STEP_COUNT);
        const activeSet = new Set(BEAT_PRIORITY.slice(0, count));
        for (let i = 0; i < STEP_COUNT; i++) {
          track.steps[i].active = activeSet.has(i);
          track.steps[i].velocity = 0.8;
          track.steps[i].probability = 1.0;
        }
        break;
      }
      case "probability": {
        for (let i = 0; i < STEP_COUNT; i++) {
          track.steps[i].probability = val;
        }
        break;
      }
      case "velocity": {
        for (let i = 0; i < STEP_COUNT; i++) {
          track.steps[i].velocity = val;
        }
        break;
      }
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  handleAction(action: string, payload?: any): Record<string, any> | void {
    switch (action) {
      case "feedData": {
        const { field, value } = payload as { field: string; value: number };
        this.dataValues[field] = Math.max(0, Math.min(1, value));
        return { dataValues: { ...this.dataValues } };
      }

      case "generate":
        this.generatePatterns();
        return { tracks: JSON.parse(JSON.stringify(this.tracks)) };

      case "trigger": {
        const { trackIndex } = payload as { trackIndex: number };
        if (trackIndex >= 0 && trackIndex < this.tracks.length) {
          this.triggerVoice(trackIndex, this.tracks[trackIndex].voice, this.ctx.currentTime, 0.8);
        }
        break;
      }
    }
  }

  private generatePatterns(): void {
    for (let i = 0; i < this.tracks.length; i++) {
      const track = this.tracks[i];
      if (!track.dataField) continue;

      // Prefer voice-specific data (patch cord), fall back to shared pool
      const perVoice = this.voiceData.get(i);
      const pool = perVoice ?? this.dataValues;
      const val = pool[track.dataField] ?? 0.5;

      this.applyAlgorithmToTrack(track, val);
    }
  }

  // ── Step callback ─────────────────────────────────────────────────────────

  setStepCallback(cb: ((step: number) => void) | null): void {
    this.stepCallback = cb;
  }

  // ── Getters (for registration syncing) ────────────────────────────────────

  getTracks(): TrackConfig[] { return this.tracks; }
  getBpm(): number { return this.bpm; }
  getSwing(): number { return this.swing; }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  dispose(): void {
    this.stop();
    this.stepCallback = null;
    for (const g of this.trackGains) {
      try { g.disconnect(); } catch { /* ok */ }
    }
    for (const g of this.voiceInputs) {
      try { g.disconnect(); } catch { /* ok */ }
    }
    for (const a of this.voiceAnalysers) {
      try { a.disconnect(); } catch { /* ok */ }
    }
    this.voiceData.clear();
    this.connectedVoices.clear();
    super.dispose();
  }
}
