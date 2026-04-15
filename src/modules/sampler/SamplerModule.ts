import { AudioModule } from "../base/AudioModule";
import { RAMP_TIME } from "../base/types";

// ─── Pad configuration ───────────────────────────────────────────────────────
const NUM_PADS = 8;

export interface PadState {
  buffer: AudioBuffer | null;
  volume: number;
  pitch: number;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  isPlaying: boolean;
}

function createDefaultPad(): PadState {
  return {
    buffer: null,
    volume: 1,
    pitch: 1,
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    isPlaying: false,
  };
}

/**
 * SamplerModule -- 8-pad sample player with per-pad controls.
 *
 * Signal chain (fixed):
 *   pad gains → filterNode → mainGain → outputNode
 *
 * inputNode is mainGain (for pass-through audio from other modules).
 * outputNode is a separate stereo gain (the module endpoint).
 */
export class SamplerModule extends AudioModule {
  private pads: PadState[] = [];
  private activeSources: Map<number, AudioBufferSourceNode> = new Map();
  private padGains: Map<number, GainNode> = new Map();

  private filterNode: BiquadFilterNode;
  private mainGain: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);

    // ── Build internal signal chain ──────────────────────────────────────
    this.mainGain = this.createStereoGain(1);
    this.filterNode = ctx.createBiquadFilter();
    this.filterNode.type = "lowpass";
    this.filterNode.frequency.value = 20000;
    this.filterNode.Q.value = 0.707;
    this.configureStereo(this.filterNode);

    // Filter → mainGain → outputNode
    this.filterNode.connect(this.mainGain);
    this.mainGain.connect(this.outputNode);

    // inputNode passes through to mainGain (for external audio routing)
    this.inputNode.connect(this.mainGain);

    // ── Initialise pads ──────────────────────────────────────────────────
    for (let i = 0; i < NUM_PADS; i++) {
      this.pads.push(createDefaultPad());

      const g = this.createStereoGain(1);
      // Pad gains route through the filter
      g.connect(this.filterNode);
      this.padGains.set(i, g);
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  start(): void {
    if (this.isActive) return;
    this.isActive = true;
  }

  stop(): void {
    if (!this.isActive) return;
    this.isActive = false;
    this.stopAllPads();
  }

  setParameter(name: string, value: any): void {
    // Global parameters
    switch (name) {
      case "volume":
        this.rampGain(this.outputNode.gain, Number(value));
        return;
      case "filterFreq":
        this.rampParam(this.filterNode.frequency, Number(value));
        return;
      case "filterRes":
        this.rampParam(this.filterNode.Q, Number(value));
        return;
    }

    // Per-pad parameters: pad_{i}_{param}
    const padMatch = name.match(/^pad_(\d+)_(.+)$/);
    if (!padMatch) return;

    const padIndex = parseInt(padMatch[1], 10);
    const param = padMatch[2];
    if (padIndex < 0 || padIndex >= NUM_PADS) return;

    const pad = this.pads[padIndex];

    switch (param) {
      case "volume": {
        pad.volume = Number(value);
        const g = this.padGains.get(padIndex);
        if (g) this.rampGain(g.gain, pad.volume);
        break;
      }
      case "pitch":
        pad.pitch = Number(value);
        // Update live source if playing
        { const src = this.activeSources.get(padIndex);
          if (src) src.playbackRate.setTargetAtTime(pad.pitch, this.ctx.currentTime, RAMP_TIME);
        }
        break;
      case "loop":
        pad.loop = Boolean(value);
        { const src = this.activeSources.get(padIndex);
          if (src) src.loop = pad.loop;
        }
        break;
      case "loopStart":
        pad.loopStart = Number(value);
        { const src = this.activeSources.get(padIndex);
          if (src) src.loopStart = pad.loopStart;
        }
        break;
      case "loopEnd":
        pad.loopEnd = Number(value);
        { const src = this.activeSources.get(padIndex);
          if (src) src.loopEnd = pad.loopEnd;
        }
        break;
    }
  }

  handleAction(action: string, payload?: any): Record<string, any> | void {
    switch (action) {
      case "triggerPad": {
        const idx = payload?.padIndex ?? 0;
        this.triggerPad(idx);
        return { pads: this.serializePads() };
      }
      case "stopPad": {
        const idx = payload?.padIndex ?? 0;
        this.stopPad(idx);
        return { pads: this.serializePads() };
      }
      case "loadSample": {
        const idx = payload?.padIndex ?? 0;
        const file = payload?.file as File | undefined;
        if (file) {
          this.loadSampleFromFile(idx, file);
        }
        return { pads: this.serializePads() };
      }
      case "recordToPad": {
        const idx = payload?.padIndex ?? 0;
        this.recordToPad(idx);
        return { pads: this.serializePads() };
      }
    }
  }

  dispose(): void {
    this.stopAllPads();
    try { this.filterNode.disconnect(); } catch { /* ok */ }
    try { this.mainGain.disconnect(); } catch { /* ok */ }
    this.padGains.forEach((g) => {
      try { g.disconnect(); } catch { /* ok */ }
    });
    this.padGains.clear();
    this.activeSources.clear();
    super.dispose();
  }

  // ── Pad operations ───────────────────────────────────────────────────────

  triggerPad(padIndex: number): void {
    if (padIndex < 0 || padIndex >= NUM_PADS) return;
    const pad = this.pads[padIndex];
    if (!pad.buffer) return;

    // Stop existing playback on this pad
    this.stopPad(padIndex);

    const src = this.ctx.createBufferSource();
    src.buffer = pad.buffer;
    src.playbackRate.value = pad.pitch;
    src.loop = pad.loop;
    src.loopStart = pad.loopStart;
    src.loopEnd = pad.loopEnd > 0 ? pad.loopEnd : pad.buffer.duration;

    const padGain = this.padGains.get(padIndex);
    if (padGain) {
      src.connect(padGain);
    }

    src.onended = () => {
      if (this.activeSources.get(padIndex) === src) {
        this.activeSources.delete(padIndex);
        pad.isPlaying = false;
      }
    };

    this.activeSources.set(padIndex, src);
    pad.isPlaying = true;
    src.start();
  }

  stopPad(padIndex: number): void {
    if (padIndex < 0 || padIndex >= NUM_PADS) return;
    const src = this.activeSources.get(padIndex);
    if (src) {
      try { src.stop(); } catch { /* already stopped */ }
      try { src.disconnect(); } catch { /* ok */ }
      this.activeSources.delete(padIndex);
    }
    this.pads[padIndex].isPlaying = false;
  }

  stopAllPads(): void {
    for (let i = 0; i < NUM_PADS; i++) {
      this.stopPad(i);
    }
  }

  /**
   * Decode an audio File and load it into a pad's buffer.
   */
  async loadSampleFromFile(padIndex: number, file: File): Promise<void> {
    if (padIndex < 0 || padIndex >= NUM_PADS) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.pads[padIndex].buffer = audioBuffer;
      this.pads[padIndex].loopEnd = audioBuffer.duration;
    } catch (err) {
      console.error(`SamplerModule: failed to load sample for pad ${padIndex}:`, err);
    }
  }

  /**
   * Record from the inputNode into a pad.
   * Captures 4 seconds of audio from whatever is routed into this module.
   */
  async recordToPad(padIndex: number): Promise<void> {
    if (padIndex < 0 || padIndex >= NUM_PADS) return;

    const RECORD_SECONDS = 4;
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * RECORD_SECONDS;

    try {
      // Use an OfflineAudioContext to capture from a MediaStreamDestination
      const dest = this.ctx.createMediaStreamDestination();
      this.inputNode.connect(dest);

      const mediaRecorder = new MediaRecorder(dest.stream);
      const chunks: Blob[] = [];

      const recordPromise = new Promise<AudioBuffer>((resolve, reject) => {
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          try {
            this.inputNode.disconnect(dest);
          } catch { /* ok */ }

          if (chunks.length === 0) {
            // No data captured; create silent buffer
            const silent = this.ctx.createBuffer(2, length, sampleRate);
            resolve(silent);
            return;
          }

          try {
            const blob = new Blob(chunks, { type: chunks[0].type });
            const arrayBuffer = await blob.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            resolve(audioBuffer);
          } catch (err) {
            reject(err);
          }
        };

        mediaRecorder.onerror = (e) => reject(e);
      });

      mediaRecorder.start();
      setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }, RECORD_SECONDS * 1000);

      const buffer = await recordPromise;
      this.pads[padIndex].buffer = buffer;
      this.pads[padIndex].loopEnd = buffer.duration;
    } catch (err) {
      console.error(`SamplerModule: failed to record to pad ${padIndex}:`, err);
    }
  }

  // ── Serialisation ────────────────────────────────────────────────────────

  /**
   * Produce a plain-object snapshot of pad states for React.
   * Excludes the AudioBuffer (non-serialisable).
   */
  private serializePads(): Array<Omit<PadState, "buffer"> & { hasBuffer: boolean }> {
    return this.pads.map((p) => ({
      volume: p.volume,
      pitch: p.pitch,
      loop: p.loop,
      loopStart: p.loopStart,
      loopEnd: p.loopEnd,
      isPlaying: p.isPlaying,
      hasBuffer: p.buffer !== null,
    }));
  }
}
