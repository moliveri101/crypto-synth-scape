/**
 * Centralized AudioContext manager
 * Ensures all audio nodes share the same context
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

  initialize() {
    if (!this.audioContext || this.audioContext.state === "closed") {
      // Close any existing context first
      if (this.audioContext) {
        try {
          this.audioContext.close();
        } catch (e) {
          console.warn('Failed to close old context:', e);
        }
      }
      
      this.audioContext = new AudioContext();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
      this.masterGain.gain.value = 0.8; // Slightly lower to prevent clipping
      console.log('AudioContext initialized:', this.audioContext.state);
    } else if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
      console.log('AudioContext resumed:', this.audioContext.state);
    } else {
      console.log('AudioContext already running:', this.audioContext.state);
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

  setMasterVolume(volume: number) {
    if (this.masterGain) {
      this.masterGain.gain.value = volume;
    }
  }

  resume() {
    if (this.audioContext?.state === "suspended") {
      this.audioContext.resume();
    }
  }

  suspend() {
    if (this.audioContext?.state === "running") {
      this.audioContext.suspend();
    }
  }

  close() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.masterGain = null;
    }
  }
}

export const audioContextManager = AudioContextManager.getInstance();
