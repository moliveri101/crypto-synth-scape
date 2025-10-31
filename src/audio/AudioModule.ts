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
    try {
      const targetCtx: BaseAudioContext | null =
        target instanceof AudioModule ? target.ctx : (target as AudioNode).context ?? null;

      console.log('Connecting:', {
        sourceContext: this.ctx,
        sourceState: this.ctx.state,
        targetContext: targetCtx || (target instanceof AudioModule ? target.ctx : 'AudioNode'),
        targetState: targetCtx ? targetCtx.state : (target instanceof AudioModule ? target.ctx.state : 'N/A')
      });
      
      // Guard against connecting nodes from different or closed AudioContexts
      if (!this.ctx || !targetCtx || this.ctx.state === 'closed' || targetCtx.state === 'closed' || this.ctx !== targetCtx) {
        console.warn('Skipping connect due to mismatched or closed AudioContext', {
          sourceState: this.ctx?.state,
          targetState: targetCtx?.state
        });
        return;
      }
      
      if (target instanceof AudioModule) {
        this.outputNode.connect(target.inputNode);
      } else {
        this.outputNode.connect(target);
      }
    } catch (error) {
      console.error("Failed to connect:", error);
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
