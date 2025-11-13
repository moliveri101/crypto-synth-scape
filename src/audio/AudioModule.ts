/**
 * Base class for all audio modules
 * Provides standardized input/output interface
 */
export abstract class AudioModule {
  protected ctx: AudioContext;
  public inputNode: AudioNode;
  public outputNode: AudioNode;
  protected isActive: boolean = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    // Subclasses will set inputNode and outputNode
    this.inputNode = ctx.createGain();
    this.outputNode = ctx.createGain();
  }

  /**
   * Connect this module's output to another module's input
   */
  connect(target: AudioModule | AudioNode) {
    if (!this.outputNode) {
      console.warn('No output node to connect from');
      return;
    }

    try {
      if (target instanceof AudioModule) {
        // Verify contexts match exactly (same instance)
        if (this.ctx !== target.ctx) {
          console.error('AudioContext mismatch! Cannot connect modules with different contexts.');
          return;
        }
        
        // Check if contexts are closed
        if (this.ctx.state === 'closed' || target.ctx.state === 'closed') {
          console.error('Cannot connect - AudioContext is closed');
          return;
        }
        
        this.outputNode.connect(target.inputNode);
      } else {
        // Connecting to raw AudioNode - verify context
        const targetContext = (target as any).context;
        if (targetContext && targetContext !== this.ctx) {
          console.error('AudioNode context mismatch! Cannot connect.');
          return;
        }
        this.outputNode.connect(target);
      }
    } catch (error) {
      console.error('Connection error:', error);
    }
  }

  /**
   * Disconnect this module from all outputs
   */
  disconnect() {
    try {
      this.outputNode.disconnect();
    } catch (error) {
      console.error("Failed to disconnect:", error);
    }
  }

  /**
   * Start the module (if applicable)
   */
  abstract start(): void;

  /**
   * Stop the module (if applicable)
   */
  abstract stop(): void;

  /**
   * Set a parameter value
   */
  abstract setParameter(name: string, value: any): void;

  /**
   * Clean up resources
   */
  dispose() {
    this.disconnect();
    this.isActive = false;
  }

  getIsActive(): boolean {
    return this.isActive;
  }
}
