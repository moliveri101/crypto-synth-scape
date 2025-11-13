import { AudioModule } from "../AudioModule";

export class OutputModule extends AudioModule {
  private outputGain: GainNode;
  private limiter: DynamicsCompressorNode;
  private volume: number = 0.9; // Slightly reduced to prevent clipping

  constructor(ctx: AudioContext) {
    super(ctx);
    
    // Create limiter to prevent clipping
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3; // Start limiting at -3dB
    this.limiter.knee.value = 0; // Hard knee for brick-wall limiting
    this.limiter.ratio.value = 20; // High ratio for limiting
    this.limiter.attack.value = 0.003; // Fast attack (3ms)
    this.limiter.release.value = 0.25; // 250ms release
    
    // Create output gain node
    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = this.volume;
    
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
      this.volume = value;
      this.outputGain.gain.value = value;
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
