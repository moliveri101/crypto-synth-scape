import { AudioModule } from "../AudioModule";

export class OutputModule extends AudioModule {
  private outputGain: GainNode;
  private limiter: DynamicsCompressorNode;
  private volume: number = 0.9; // Slightly reduced to prevent clipping

  constructor(ctx: AudioContext) {
    super(ctx);
    
    // Create limiter to prevent clipping and distortion
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6; // Start limiting at -6dB (more headroom)
    this.limiter.knee.value = 3; // Smooth knee for natural limiting
    this.limiter.ratio.value = 20; // High ratio for brick-wall limiting
    this.limiter.attack.value = 0.001; // Very fast attack (1ms)
    this.limiter.release.value = 0.1; // Fast release (100ms)
    
    // Create output gain node
    this.outputGain = ctx.createGain();
    this.outputGain.gain.setValueAtTime(this.volume, ctx.currentTime);
    
    // Chain: input -> limiter -> gain -> destination
    this.limiter.connect(this.outputGain);
    this.outputGain.connect(ctx.destination);
    
    // Set input/output
    this.inputNode = this.limiter;
    this.outputNode = ctx.destination as any; // Outputs don't connect to anything else
  }

  start() {
    this.isActive = true;
  }

  stop() {
    this.isActive = false;
  }

  setParameter(name: string, value: any) {
    if (name === "volume") {
      this.volume = Math.max(0, Math.min(1, value));
      // Smooth volume changes to prevent clicks/pops
      this.outputGain.gain.setTargetAtTime(
        this.volume,
        this.ctx.currentTime,
        0.01 // 10ms smoothing
      );
    }
  }

  // Override connect since outputs don't connect to other modules
  connect(target: AudioModule | AudioNode) {
    // Outputs are terminal nodes, they don't connect to anything
    console.warn("Output modules don't connect to other modules");
  }

  dispose() {
    this.limiter.disconnect();
    this.outputGain.disconnect();
    super.dispose();
  }
}
