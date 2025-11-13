import { AudioModule } from "../AudioModule";
import { audioContextManager } from "../AudioContextManager";

export class OutputModule extends AudioModule {
  private outputGain: GainNode;
  private limiter: DynamicsCompressorNode;
  private makeupGain: GainNode;
  private analyser: AnalyserNode;
  private volume: number = 0.7; // Phase 2: Reduced default volume
  private dataArray: Uint8Array;

  constructor(ctx: AudioContext) {
    super(ctx);
    
    // Phase 2: Improved limiter settings
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1; // Changed from -3dB
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 12; // Changed from 20
    this.limiter.attack.value = 0.005; // Changed from 0.003 (5ms)
    this.limiter.release.value = 0.3; // Changed from 0.25 (300ms)
    
    // Phase 2: Add makeup gain compensation
    this.makeupGain = ctx.createGain();
    this.makeupGain.gain.value = 1.2; // Compensate for limiter reduction
    
    // Create output gain node
    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = this.volume;
    
    // Phase 6: Add analyser for metering
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.dataArray = new Uint8Array(this.analyser.fftSize);
    
    // Phase 1: Connect to AudioContextManager's masterGain instead of destination
    const masterGain = audioContextManager.getMasterGain();
    
    if (masterGain) {
      // Chain: input -> limiter -> makeup gain -> gain -> analyser -> masterGain
      this.limiter.connect(this.makeupGain);
      this.makeupGain.connect(this.outputGain);
      this.outputGain.connect(this.analyser);
      this.analyser.connect(masterGain);
    } else {
      // Fallback if masterGain not available
      this.limiter.connect(this.makeupGain);
      this.makeupGain.connect(this.outputGain);
      this.outputGain.connect(this.analyser);
      this.analyser.connect(ctx.destination);
    }
    
    // Set input/output
    this.inputNode = this.limiter;
    this.outputNode = this.analyser; // Expose analyser for potential metering
  }

  start() {
    this.isActive = true;
  }

  stop() {
    this.isActive = false;
  }

  setParameter(name: string, value: any) {
    if (name === "volume") {
      this.volume = value;
      this.outputGain.gain.value = value;
    }
  }

  // Phase 6: Get stereo peak levels (L/R)
  getPeakLevels(): { left: number; right: number } {
    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);
    
    // Approximate stereo split
    const mid = Math.floor(data.length / 2);
    let leftMax = 0;
    let rightMax = 0;
    
    for (let i = 0; i < mid; i++) {
      const normalized = Math.abs((data[i] - 128) / 128);
      if (normalized > leftMax) leftMax = normalized;
    }
    
    for (let i = mid; i < data.length; i++) {
      const normalized = Math.abs((data[i] - 128) / 128);
      if (normalized > rightMax) rightMax = normalized;
    }
    
    return { left: leftMax, right: rightMax };
  }

  // Phase 6: Get peak level for metering (backwards compatibility)
  getPeakLevel(): number {
    const levels = this.getPeakLevels();
    return Math.max(levels.left, levels.right);
  }

  // Phase 6: Check if clipping is occurring
  isClipping(): boolean {
    return this.getPeakLevel() > 0.95;
  }

  // Override connect since outputs don't connect to other modules
  connect(target: AudioModule | AudioNode) {
    // Outputs are terminal nodes, they don't connect to anything
    console.warn("Output modules don't connect to other modules");
  }

  dispose() {
    this.limiter.disconnect();
    this.makeupGain.disconnect();
    this.outputGain.disconnect();
    this.analyser.disconnect();
    super.dispose();
  }
}
