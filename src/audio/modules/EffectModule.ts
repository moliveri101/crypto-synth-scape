import { AudioModule } from "../AudioModule";

export class EffectModule extends AudioModule {
  private effectType: string;
  private wetGain: GainNode;
  private dryGain: GainNode;
  private effectNode: AudioNode;
  private intensity: number = 0.5;
  private mix: number = 0.5;
  private parameters: Record<string, number> = {};

  constructor(ctx: AudioContext, effectType: string) {
    super(ctx);
    this.effectType = effectType;

    // Create input/output nodes
    this.inputNode = ctx.createGain();
    this.outputNode = ctx.createGain();

    // Create wet/dry mix nodes
    this.wetGain = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain.gain.value = 0.5;
    this.dryGain.gain.value = 0.5;

    // Create effect-specific node
    this.effectNode = this.createEffectNode(effectType);

    // Wire up: input -> dry -> output
    this.inputNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);

    // Wire up: input -> effect -> wet -> output
    this.inputNode.connect(this.effectNode);
    this.effectNode.connect(this.wetGain);
    this.wetGain.connect(this.outputNode);

    this.isActive = true;
  }

  private createEffectNode(type: string): AudioNode {
    switch (type) {
      case "lpf":
      case "hpf":
      case "bandpass":
      case "resonant-filter": {
        const filter = this.ctx.createBiquadFilter();
        filter.type = type === "lpf" ? "lowpass" : type === "hpf" ? "highpass" : "bandpass";
        filter.frequency.value = 1000;
        filter.Q.value = 1;
        return filter;
      }

      case "compressor": {
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 30;
        compressor.ratio.value = 12;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;
        return compressor;
      }

      case "delay": {
        const delay = this.ctx.createDelay(2);
        delay.delayTime.value = 0.5;
        return delay;
      }

      default:
        // For other effects, use gain node as placeholder
        return this.ctx.createGain();
    }
  }

  start() {
    this.isActive = true;
    this.updateBypass();
  }

  stop() {
    this.isActive = false;
    this.updateBypass();
  }

  setParameter(name: string, value: any) {
    switch (name) {
      case "intensity":
        this.intensity = value;
        this.applyParameters();
        break;
      case "mix":
        this.mix = value;
        this.wetGain.gain.value = value;
        this.dryGain.gain.value = 1 - value;
        break;
      case "isActive":
        this.isActive = value;
        this.updateBypass();
        break;
      default:
        // Custom effect parameters
        this.parameters[name] = value;
        this.applyParameters();
        break;
    }
  }

  private updateBypass() {
    if (this.isActive) {
      this.wetGain.gain.value = this.mix;
      this.dryGain.gain.value = 1 - this.mix;
    } else {
      this.wetGain.gain.value = 0;
      this.dryGain.gain.value = 1;
    }
  }

  private applyParameters() {
    // Apply parameters to the effect node
    if (this.effectNode instanceof BiquadFilterNode) {
      if (this.parameters.cutoff !== undefined || this.parameters.frequency !== undefined) {
        this.effectNode.frequency.value = this.parameters.cutoff || this.parameters.frequency || 1000;
      }
      if (this.parameters.resonance !== undefined || this.parameters.Q !== undefined) {
        this.effectNode.Q.value = this.parameters.resonance || this.parameters.Q || 1;
      }
    } else if (this.effectNode instanceof DynamicsCompressorNode) {
      if (this.parameters.threshold !== undefined) {
        this.effectNode.threshold.value = this.parameters.threshold;
      }
      if (this.parameters.ratio !== undefined) {
        this.effectNode.ratio.value = this.parameters.ratio;
      }
    } else if (this.effectNode instanceof DelayNode) {
      if (this.parameters.time !== undefined) {
        this.effectNode.delayTime.value = this.parameters.time;
      }
    }
  }

  getParameters(): Record<string, number> {
    return this.parameters;
  }
}
