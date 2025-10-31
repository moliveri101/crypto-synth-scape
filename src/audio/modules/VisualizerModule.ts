import { AudioModule } from "../AudioModule";

/**
 * Visualizer module that analyzes audio for visual feedback
 */
export class VisualizerModule extends AudioModule {
  public analyser: AnalyserNode;

  constructor(ctx: AudioContext) {
    super(ctx);
    
    // Create analyser node
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;
    
    // The analyser node is both input and output
    this.inputNode = this.analyser;
    this.outputNode = this.analyser;
  }

  start(): void {
    this.isActive = true;
  }

  stop(): void {
    this.isActive = false;
  }

  setParameter(name: string, value: any): void {
    switch (name) {
      case "fftSize":
        this.analyser.fftSize = value;
        break;
      case "smoothing":
        this.analyser.smoothingTimeConstant = value;
        break;
    }
  }

  getAnalyser(): AnalyserNode {
    return this.analyser;
  }
}
