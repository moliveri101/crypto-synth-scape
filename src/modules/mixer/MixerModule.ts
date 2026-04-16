import { AudioModule } from "../base/AudioModule";

interface ChannelState {
  /** Channel volume (pre-mute). 0..3 (0% to 300%). */
  volume: number;
  /** Pan position. -1 (hard L) to +1 (hard R). */
  pan: number;
  /** Mute toggle. When true, muteGain → 0; when false, muteGain → 1. */
  muted: boolean;
  /** Volume scaling GainNode (first in the chain). */
  volumeGain: GainNode;
  /** Mute GainNode (multiplied by volumeGain). */
  muteGain: GainNode;
  /** Stereo panner. */
  panner: StereoPannerNode;
}

/**
 * Multi-channel stereo mixer — simplified rewrite.
 *
 * Per-channel signal chain:
 *   input → volumeGain (0..3) → muteGain (0 or 1) → panner → mix bus
 *
 * All gain stages are always active. There's no hasInput / channel activation
 * step — the channel's audio naturally comes through when something's plugged
 * into `getChannelInput(i)`, and is silent when nothing is. This removes
 * several subtle bugs around the previous activation gate.
 */
export class MixerModule extends AudioModule {
  private channels: ChannelState[] = [];
  private mixGain: GainNode;
  private masterVolume = 1.0;
  private readonly numChannels: number;

  constructor(ctx: AudioContext, channelCount: number) {
    super(ctx);
    this.numChannels = channelCount;

    // Master mix bus — per-channel signals sum here, then flow to outputNode.
    this.mixGain = this.createStereoGain(this.masterVolume);
    this.mixGain.connect(this.outputNode);

    // Also pipe the module's generic inputNode into the mix bus as a
    // fallback path. This preserves back-compat for callers that use
    // module-to-module connect() without specifying a channel handle.
    this.inputNode.connect(this.mixGain);

    for (let i = 0; i < this.numChannels; i++) {
      // volumeGain — user-controlled scalar, always active (0..3)
      const volumeGain = this.createStereoGain(1.0);
      // muteGain — boolean: 1 when unmuted, 0 when muted. Separate node so
      // user-set volume doesn't get lost when toggling mute.
      const muteGain = this.createStereoGain(1.0);
      const panner = ctx.createStereoPanner();
      this.configureStereo(panner);
      panner.pan.value = 0;

      volumeGain.connect(muteGain);
      muteGain.connect(panner);
      panner.connect(this.mixGain);

      this.channels.push({
        volume: 1.0,
        pan: 0,
        muted: false,
        volumeGain,
        muteGain,
        panner,
      });
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** The AudioRouter wires per-channel input edges into these GainNodes. */
  getChannelInput(index: number): GainNode | null {
    return this.channels[index]?.volumeGain ?? null;
  }

  getChannelCount(): number {
    return this.numChannels;
  }

  /**
   * Called by the router when a channel's edge is added/removed. Kept as a
   * no-op for the new design — volume/mute always apply — but we retain the
   * method so the router's existing logic continues to compile.
   */
  setChannelActive(_index: number, _hasInput: boolean): void {
    // no-op in the new design
  }

  getChannelData(index: number): {
    volume: number;
    pan: number;
    muted: boolean;
  } | null {
    const ch = this.channels[index];
    if (!ch) return null;
    return { volume: ch.volume, pan: ch.pan, muted: ch.muted };
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }

  setParameter(name: string, value: any): void {
    if (name === "masterVolume") {
      this.masterVolume = Number(value);
      this.rampGain(this.mixGain.gain, this.masterVolume);
      return;
    }

    // Channel-scoped parameters: channel_0_volume, channel_1_pan, etc.
    const match = name.match(/^channel_(\d+)_(volume|pan|muted)$/);
    if (!match) return;

    const index = parseInt(match[1], 10);
    const param = match[2];
    const ch = this.channels[index];
    if (!ch) return;

    switch (param) {
      case "volume": {
        ch.volume = Number(value);
        this.rampGain(ch.volumeGain.gain, ch.volume);
        break;
      }
      case "pan": {
        ch.pan = Math.max(-1, Math.min(1, Number(value)));
        this.rampParam(ch.panner.pan, ch.pan);
        break;
      }
      case "muted": {
        ch.muted = Boolean(value);
        this.rampGain(ch.muteGain.gain, ch.muted ? 0 : 1);
        break;
      }
    }
  }

  dispose(): void {
    for (const ch of this.channels) {
      try {
        ch.volumeGain.disconnect();
        ch.muteGain.disconnect();
        ch.panner.disconnect();
      } catch { /* ok */ }
    }
    try { this.mixGain.disconnect(); } catch { /* ok */ }
    this.channels = [];
    super.dispose();
  }
}
