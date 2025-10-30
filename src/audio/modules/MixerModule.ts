import { AudioModule } from "../AudioModule";

export class MixerModule extends AudioModule {
  private channelCount: number;
  private channelGains: GainNode[] = [];
  private channelPanners: StereoPannerNode[] = [];
  private mixGain: GainNode;
  private channels: Array<{ volume: number; pan: number; muted: boolean }>;

  constructor(ctx: AudioContext, channelCount: number) {
    super(ctx);
    this.channelCount = channelCount;
    
    // Initialize channel data
    this.channels = Array.from({ length: channelCount }, () => ({
      volume: 0.8,
      pan: 0,
      muted: false
    }));

    // Create audio nodes for each channel
    this.channelGains = Array.from({ length: channelCount }, () => {
      const gain = ctx.createGain();
      gain.gain.value = 0; // Start muted until input connected
      return gain;
    });

    this.channelPanners = Array.from({ length: channelCount }, () => {
      const panner = ctx.createStereoPanner();
      panner.pan.value = 0;
      return panner;
    });

    // Create mix bus
    this.mixGain = ctx.createGain();
    this.mixGain.gain.value = 0.7;

    // Wire up: gain -> panner -> mix bus
    this.channelGains.forEach((gain, i) => {
      gain.connect(this.channelPanners[i]);
      this.channelPanners[i].connect(this.mixGain);
    });

    // Set input/output nodes
    // Note: For mixers, each channel is a separate input
    this.inputNode = this.mixGain; // Not used directly
    this.outputNode = this.mixGain;
  }

  getChannelInput(channelIndex: number): AudioNode | null {
    return this.channelGains[channelIndex] || null;
  }

  setChannelActive(channelIndex: number, hasInput: boolean) {
    if (channelIndex >= 0 && channelIndex < this.channelCount) {
      const channelData = this.channels[channelIndex];
      if (!hasInput) {
        // No input, mute channel
        this.channelGains[channelIndex].gain.value = 0;
      } else if (!channelData.muted) {
        // Has input and not muted, restore volume
        this.channelGains[channelIndex].gain.value = channelData.volume;
      }
    }
  }

  start() {
    this.isActive = true;
  }

  stop() {
    this.isActive = false;
  }

  setParameter(name: string, value: any) {
    if (name === "masterVolume") {
      this.mixGain.gain.value = value;
    } else if (name.startsWith("channel_")) {
      const parts = name.split("_");
      const channelIndex = parseInt(parts[1]);
      const param = parts[2];

      if (channelIndex >= 0 && channelIndex < this.channelCount) {
        switch (param) {
          case "volume":
            this.channels[channelIndex].volume = value;
            if (!this.channels[channelIndex].muted) {
              this.channelGains[channelIndex].gain.value = value;
            }
            break;
          case "pan":
            this.channels[channelIndex].pan = value;
            this.channelPanners[channelIndex].pan.value = value;
            break;
          case "muted":
            this.channels[channelIndex].muted = value;
            this.channelGains[channelIndex].gain.value = value ? 0 : this.channels[channelIndex].volume;
            break;
        }
      }
    }
  }

  getChannelCount(): number {
    return this.channelCount;
  }

  getChannelData(index: number) {
    return this.channels[index];
  }
}
