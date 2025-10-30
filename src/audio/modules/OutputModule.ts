import { AudioModule } from "../AudioModule";

export class OutputModule extends AudioModule {
  private outputGain: GainNode;
  private volume: number = 1.0;

  constructor(ctx: AudioContext) {
    super(ctx);
    
    // Create output gain node
    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = this.volume;
    this.outputGain.connect(ctx.destination);
    
    // Set input/output
    this.inputNode = this.outputGain;
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
}
