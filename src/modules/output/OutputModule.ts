import { AudioModule } from "../base/AudioModule";

/**
 * Terminal output module.
 *
 * Chain: inputNode (limiter) -> outputGain -> ctx.destination
 *
 * The limiter is a DynamicsCompressorNode configured as a brick-wall
 * limiter to protect speakers. Volume is controlled via the outputGain
 * stage using click-free ramps.
 */
export class OutputModule extends AudioModule {
  private limiter: DynamicsCompressorNode;
  private outputGain: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);

    // Limiter: brick-wall at -6 dB
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 3;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.1;
    this.configureStereo(this.limiter);

    // Output volume stage
    this.outputGain = this.createStereoGain(0.8);
    this.configureStereo(this.outputGain);

    // The inputNode IS the limiter so upstream modules connect directly to it
    (this as any).inputNode = this.limiter;

    // The outputNode is the gain stage (NOT ctx.destination) so the base
    // class connect()/disconnect() still work for introspection, but the
    // final hop to the destination is internal.
    (this as any).outputNode = this.outputGain;

    // Internal chain: limiter -> outputGain -> destination
    this.limiter.connect(this.outputGain);
    this.outputGain.connect(ctx.destination);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start(): void {
    this.isActive = true;
  }

  stop(): void {
    this.isActive = false;
  }

  // ── Parameters ────────────────────────────────────────────────────────────

  setParameter(name: string, value: any): void {
    switch (name) {
      case "volume":
        this.rampGain(this.outputGain.gain, Number(value));
        break;
    }
  }

  // ── Connection override ───────────────────────────────────────────────────

  /**
   * OutputModule is a terminal node. Warn callers that connecting its
   * output to another target is likely a mistake.
   */
  connect(target: AudioModule | AudioNode): void {
    if (typeof console !== "undefined") {
      console.warn(
        "OutputModule is a terminal node -- connecting its output is unusual. " +
          "Audio already routes to ctx.destination.",
      );
    }
    super.connect(target);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  dispose(): void {
    try { this.outputGain.disconnect(); } catch { /* already disconnected */ }
    try { this.limiter.disconnect(); } catch { /* already disconnected */ }
    super.dispose();
  }
}
