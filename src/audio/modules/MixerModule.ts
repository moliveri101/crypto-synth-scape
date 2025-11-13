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
      volume: 1.0,
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
    this.mixGain.gain.value = 1.0;

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
      const targetVolume = !hasInput ? 0 : (channelData.muted ? 0 : channelData.volume);
      
      // Smooth transition to prevent clicks/pops
      this.channelGains[channelIndex].gain.setTargetAtTime(
        targetVolume,
        this.ctx.currentTime,
        0.01 // 10ms smoothing
      );
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
      // Smooth master volume changes
      this.mixGain.gain.setTargetAtTime(
        Math.max(0, Math.min(1, value)),
        this.ctx.currentTime,
        0.01
      );
    } else if (name.startsWith("channel_")) {
      const parts = name.split("_");
      const channelIndex = parseInt(parts[1]);
      const param = parts[2];

      if (channelIndex >= 0 && channelIndex < this.channelCount) {
        switch (param) {
          case "volume":
            this.channels[channelIndex].volume = Math.max(0, Math.min(1, value));
            if (!this.channels[channelIndex].muted) {
              // Smooth channel volume changes
              this.channelGains[channelIndex].gain.setTargetAtTime(
                this.channels[channelIndex].volume,
                this.ctx.currentTime,
                0.01
              );
            }
            break;
          case "pan":
            this.channels[channelIndex].pan = Math.max(-1, Math.min(1, value));
            // Smooth pan changes
            this.channelPanners[channelIndex].pan.setTargetAtTime(
              this.channels[channelIndex].pan,
              this.ctx.currentTime,
              0.01
            );
            break;
          case "muted":
            this.channels[channelIndex].muted = value;
            const targetVol = value ? 0 : this.channels[channelIndex].volume;
            this.channelGains[channelIndex].gain.setTargetAtTime(
              targetVol,
              this.ctx.currentTime,
              0.01
            );
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
