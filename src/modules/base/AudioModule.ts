import { STEREO_CHANNELS, CHANNEL_MODE, CHANNEL_INTERP, RAMP_TIME } from "./types";

/**
 * Base class for every audio module.
 *
 * Key guarantees:
 * - All I/O is **explicit stereo** (2-channel, "speakers" interpretation).
 * - Gain changes use `setTargetAtTime` to avoid clicks.
 * - Subclasses only need to implement the four abstract methods.
 * - `handleAction()` is the generic extension point for module-specific
 *   operations (trigger pad, load sample, etc.) so the hook never needs
 *   per-module knowledge.
 */
export abstract class AudioModule {
  protected ctx: AudioContext;
  public readonly inputNode: GainNode;
  public readonly outputNode: GainNode;
  protected isActive = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.inputNode = ctx.createGain();
    this.outputNode = ctx.createGain();

    // Enforce stereo on both endpoints
    this.configureStereo(this.inputNode);
    this.configureStereo(this.outputNode);
  }

  // ── Stereo helpers ──────────────────────────────────────────────────────

  /**
   * Apply the project-wide stereo channel config to any AudioNode.
   * Safely skips nodes with fixed channelCount (ChannelMergerNode,
   * ChannelSplitterNode) to avoid Web Audio spec violations.
   */
  protected configureStereo(node: AudioNode): void {
    try {
      node.channelCount = STEREO_CHANNELS;
      node.channelCountMode = CHANNEL_MODE;
      node.channelInterpretation = CHANNEL_INTERP;
    } catch {
      // Some nodes (ChannelMerger/Splitter) have immutable channelCount
    }
  }

  /**
   * Create a stereo GainNode with the project-wide channel config.
   * Convenience for subclasses that need additional gain stages.
   */
  protected createStereoGain(initialValue = 1): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = initialValue;
    this.configureStereo(g);
    return g;
  }

  /**
   * Smoothly ramp a gain param to a new value (click-free).
   */
  protected rampGain(param: AudioParam, value: number, time = RAMP_TIME): void {
    param.setTargetAtTime(value, this.ctx.currentTime, time);
  }

  /**
   * Smoothly ramp any AudioParam (frequency, pan, etc.).
   */
  protected rampParam(param: AudioParam, value: number, time = RAMP_TIME): void {
    param.setTargetAtTime(value, this.ctx.currentTime, time);
  }

  // ── Connection management ──────────────────────────────────────────────

  connect(target: AudioModule | AudioNode): void {
    if (this.ctx.state === "closed") {
      console.error("Cannot connect — AudioContext is closed");
      return;
    }
    try {
      if (target instanceof AudioModule) {
        if (this.ctx !== target.ctx) {
          console.error("AudioContext mismatch — cannot connect modules from different contexts");
          return;
        }
        this.outputNode.connect(target.inputNode);
      } else {
        this.outputNode.connect(target);
      }
    } catch (err) {
      console.error("Connection error:", err);
    }
  }

  disconnect(): void {
    try {
      this.outputNode.disconnect();
    } catch {
      // already disconnected — safe to ignore
    }
  }

  // ── Lifecycle (implemented by every subclass) ──────────────────────────

  abstract start(): void;
  abstract stop(): void;
  abstract setParameter(name: string, value: any): void;

  /**
   * Generic action dispatcher for module-specific operations.
   * Override in subclasses that expose custom actions
   * (e.g. SamplerModule: "triggerPad", DrumsModule: "trigger").
   *
   * Returns an optional data-update object that the framework will
   * shallow-merge into the React node data.
   */
  handleAction(_action: string, _payload?: any): Record<string, any> | void {
    // default: no-op
  }

  /**
   * Override in data-producing modules (crypto, satellite, etc.).
   * Returns named data fields normalized to useful ranges.
   * Called by the framework to forward data to connected consumers.
   */
  getDataOutput(): Record<string, number> | null {
    return null; // not a data producer by default
  }

  /**
   * Override in data-consuming modules (data drum machine, etc.).
   * Receives data from connected upstream data producers.
   * - `targetHandle` identifies the input handle the edge terminates at
   *   (e.g. "in-0" for the kick voice on the drum machine).
   * - `sourceHandle` identifies the output handle the edge originates at
   *   (e.g. "out-heart_rate" from the Vitals module). Translators use this
   *   to auto-select a specific field from the incoming data bundle.
   */
  onDataInput(_data: Record<string, number>, _targetHandle?: string, _sourceHandle?: string): void {
    // default: no-op
  }

  dispose(): void {
    this.stop();
    this.disconnect();
    this.isActive = false;
  }

  getIsActive(): boolean {
    return this.isActive;
  }
}
