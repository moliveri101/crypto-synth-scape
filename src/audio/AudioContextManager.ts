import { STEREO_CHANNELS, CHANNEL_MODE, CHANNEL_INTERP, RAMP_TIME } from "@/modules/base/types";

/**
 * Centralized AudioContext manager (singleton).
 * Ensures every audio node in the app shares the same context
 * and that all I/O is configured for explicit stereo.
 */
class AudioContextManager {
  private static instance: AudioContextManager;
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  private constructor() {}

  static getInstance(): AudioContextManager {
    if (!AudioContextManager.instance) {
      AudioContextManager.instance = new AudioContextManager();
    }
    return AudioContextManager.instance;
  }

  initialize(): AudioContext {
    if (!this.audioContext || this.audioContext.state === "closed") {
      if (this.audioContext) {
        try { this.audioContext.close(); } catch { /* already closed */ }
      }

      this.audioContext = new AudioContext();

      this.masterGain = this.audioContext.createGain();
      this.masterGain.channelCount = STEREO_CHANNELS;
      this.masterGain.channelCountMode = CHANNEL_MODE;
      this.masterGain.channelInterpretation = CHANNEL_INTERP;
      this.masterGain.gain.value = 0.8;
      this.masterGain.connect(this.audioContext.destination);
    } else if (this.audioContext.state === "suspended") {
      // await is intentionally fire-and-forget here — callers that need
      // the context running should use resume() which returns a Promise.
      this.audioContext.resume();
    }

    return this.audioContext;
  }

  getContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === "closed") {
      this.initialize();
    }
    return this.audioContext!;
  }

  getMasterGain(): GainNode | null {
    return this.masterGain;
  }

  /** Click-free master volume change. */
  setMasterVolume(volume: number): void {
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        Math.max(0, Math.min(1, volume)),
        this.audioContext!.currentTime,
        RAMP_TIME,
      );
    }
  }

  async resume(): Promise<void> {
    if (this.audioContext?.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  async suspend(): Promise<void> {
    if (this.audioContext?.state === "running") {
      await this.audioContext.suspend();
    }
  }

  close(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.masterGain = null;
    }
  }
}

export const audioContextManager = AudioContextManager.getInstance();
