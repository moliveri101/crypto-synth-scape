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
    if (!this.audioContext) {
      // Phase 5: Set optimal sample rate and latency hint
      this.audioContext = new AudioContext({
        sampleRate: 48000,
        latencyHint: 'interactive'
      });
      
      // Phase 3: Add DC offset removal with high-pass filter at 20Hz
      const dcBlocker = this.audioContext.createBiquadFilter();
      dcBlocker.type = 'highpass';
      dcBlocker.frequency.value = 20;
      dcBlocker.Q.value = 0.7071; // Butterworth response
      
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 1.0;
      
      // Chain: masterGain -> DC blocker -> destination
      this.masterGain.connect(dcBlocker);
      dcBlocker.connect(this.audioContext.destination);
      
      console.log('AudioContext initialized:', this.audioContext, 'State:', this.audioContext.state);
    } else {
      console.log('AudioContext already exists:', this.audioContext, 'State:', this.audioContext.state);
    }
  }

  getContext(): AudioContext | null {
    return this.audioContext;
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
