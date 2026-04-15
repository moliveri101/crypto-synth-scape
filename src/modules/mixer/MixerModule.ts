import { AudioModule } from "../base/AudioModule";

interface ChannelState {
  gain: GainNode;
  panner: StereoPannerNode;
  volume: number;
  pan: number;
  muted: boolean;
  hasInput: boolean;
}

/**
 * Multi-channel stereo mixer.
 *
 * Each channel has its own GainNode -> StereoPannerNode -> mix bus.
 * Channels start silent and are activated when an input is connected
 * via `setChannelActive()`.
 */
export class MixerModule extends AudioModule {
  private channels: ChannelState[] = [];
  private mixGain: GainNode;
  private masterVolume = 0.8;
  private readonly numChannels: number;

  constructor(ctx: AudioContext, channelCount: number) {
    super(ctx);

    this.numChannels = channelCount;

    // Mix bus — all channels sum into this
    this.mixGain = this.createStereoGain(this.masterVolume);

    // Wire base class I/O to the mix bus
    // inputNode is not used directly for connections — channels are connected
    // individually via getChannelInput(). We still keep it for AudioModule
    // compatibility; route it into the mix bus as a fallback path.
    this.inputNode.connect(this.mixGain);
    this.mixGain.connect(this.outputNode);

    // Build per-channel strips
    for (let i = 0; i < this.numChannels; i++) {
      const gain = this.createStereoGain(0); // starts silent
      const panner = ctx.createStereoPanner();
      this.configureStereo(panner);
      panner.pan.value = 0;

      gain.connect(panner);
      panner.connect(this.mixGain);

      this.channels.push({
        gain,
        panner,
        volume: 0.8,
        pan: 0,
        muted: false,
        hasInput: false,
      });
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /** Returns the input GainNode for a specific channel. */
  getChannelInput(index: number): GainNode | null {
    const ch = this.channels[index];
    return ch ? ch.gain : null;
  }

  /**
   * Mark a channel as having (or losing) an active input connection.
   * When activated, the channel gain ramps to its volume (respecting mute).
   * When deactivated, the channel gain ramps to 0.
   */
  setChannelActive(index: number, hasInput: boolean): void {
    const ch = this.channels[index];
    if (!ch) return;

    ch.hasInput = hasInput;
    const target = hasInput && !ch.muted ? ch.volume : 0;
    this.rampGain(ch.gain.gain, target);
  }

  getChannelCount(): number {
    return this.numChannels;
  }

  getChannelData(index: number): {
    volume: number;
    pan: number;
    muted: boolean;
    hasInput: boolean;
  } | null {
    const ch = this.channels[index];
    if (!ch) return null;
    return {
      volume: ch.volume,
      pan: ch.pan,
      muted: ch.muted,
      hasInput: ch.hasInput,
    };
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  start(): void {
    this.isActive = true;
  }

  stop(): void {
    this.isActive = false;
  }

  setParameter(name: string, value: any): void {
    if (name === "masterVolume") {
      this.masterVolume = value as number;
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
        ch.volume = value as number;
        if (ch.hasInput && !ch.muted) {
          this.rampGain(ch.gain.gain, ch.volume);
        }
        break;
      }
      case "pan": {
        ch.pan = value as number;
        this.rampParam(ch.panner.pan, ch.pan);
        break;
      }
      case "muted": {
        ch.muted = value as boolean;
        const target = ch.hasInput && !ch.muted ? ch.volume : 0;
        this.rampGain(ch.gain.gain, target);
        break;
      }
    }
  }

  dispose(): void {
    for (const ch of this.channels) {
      try {
        ch.gain.disconnect();
        ch.panner.disconnect();
      } catch {
        // already disconnected
      }
    }
    try {
      this.mixGain.disconnect();
    } catch {
      // already disconnected
    }
    this.channels = [];
    super.dispose();
  }
}
