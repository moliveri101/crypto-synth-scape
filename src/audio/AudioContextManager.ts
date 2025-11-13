/**
 * Centralized AudioContext manager
 * Ensures all audio nodes share the same context
 */
class AudioContextManager {
  private static instance: AudioContextManager;
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

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
      
      // Phase 3: Add DC offset removal with high-pass filter at 5Hz (less aggressive)
      const dcBlocker = this.audioContext.createBiquadFilter();
      dcBlocker.type = 'highpass';
      dcBlocker.frequency.value = 5;
      dcBlocker.Q.value = 0.5; // Gentle slope to avoid phase issues
      
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

  // Phase 6: Add analyser access for metering
  getAnalyser(): AnalyserNode | null {
    if (!this.audioContext || !this.masterGain) return null;
    
    // Check if analyser already exists
    if (!this.analyser) {
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.3;
      
      // Insert analyser before destination (after DC blocker)
      // We need to reconnect the chain: masterGain -> dcBlocker -> analyser -> destination
      this.masterGain.disconnect();
      const dcBlocker = this.audioContext.createBiquadFilter();
      dcBlocker.type = 'highpass';
      dcBlocker.frequency.value = 5;
      dcBlocker.Q.value = 0.5;
      
      this.masterGain.connect(dcBlocker);
      dcBlocker.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
    }
    
    return this.analyser;
  }

  // Phase 6: Get stereo peak levels
  getPeakLevels(): { left: number; right: number } {
    const analyser = this.getAnalyser();
    if (!analyser) return { left: 0, right: 0 };
    
    const dataArray = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(dataArray);
    
    // Split stereo: first half = left, second half = right (approximation)
    const mid = Math.floor(dataArray.length / 2);
    let leftMax = 0;
    let rightMax = 0;
    
    for (let i = 0; i < mid; i++) {
      const leftNormalized = Math.abs((dataArray[i] - 128) / 128);
      if (leftNormalized > leftMax) leftMax = leftNormalized;
    }
    
    for (let i = mid; i < dataArray.length; i++) {
      const rightNormalized = Math.abs((dataArray[i] - 128) / 128);
      if (rightNormalized > rightMax) rightMax = rightNormalized;
    }
    
    return { left: leftMax, right: rightMax };
  }

  // Phase 6: Check if any audio is flowing
  isAudioActive(): boolean {
    const levels = this.getPeakLevels();
    return levels.left > 0.01 || levels.right > 0.01;
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
