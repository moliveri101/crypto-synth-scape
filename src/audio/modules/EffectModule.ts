import { AudioModule } from "../AudioModule";

export class EffectModule extends AudioModule {
  private effectType: string;
  private wetGain: GainNode;
  private dryGain: GainNode;
  private effectNode: AudioNode;
  private intensity: number = 0.5;
  private mix: number = 0.5;
  private parameters: Record<string, number> = {};
  private oscillators: OscillatorNode[] = [];

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
      case "lpf": {
        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 2000;
        filter.Q.value = 1;
        return filter;
      }

      case "hpf": {
        const filter = this.ctx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 200;
        filter.Q.value = 1;
        return filter;
      }

      case "bandpass":
      case "resonant-filter": {
        const filter = this.ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 1000;
        filter.Q.value = 5;
        return filter;
      }

      case "eq": {
        const filter = this.ctx.createBiquadFilter();
        filter.type = "peaking";
        filter.frequency.value = 1000;
        filter.Q.value = 1;
        filter.gain.value = 0;
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

      case "delay":
      case "pingpong-delay": {
        const delay = this.ctx.createDelay(2);
        delay.delayTime.value = 0.3;
        return delay;
      }

      case "reverb": {
        // Create a simple reverb using multiple delays
        const convolver = this.ctx.createConvolver();
        // Create impulse response for reverb
        const length = this.ctx.sampleRate * 2;
        const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
        const leftChannel = impulse.getChannelData(0);
        const rightChannel = impulse.getChannelData(1);
        
        for (let i = 0; i < length; i++) {
          const decay = Math.pow(1 - i / length, 2);
          leftChannel[i] = (Math.random() * 2 - 1) * decay;
          rightChannel[i] = (Math.random() * 2 - 1) * decay;
        }
        
        convolver.buffer = impulse;
        return convolver;
      }

      case "distortion":
      case "overdrive":
      case "fuzz": {
        const waveshaper = this.ctx.createWaveShaper();
        const amount = type === "fuzz" ? 100 : type === "distortion" ? 50 : 20;
        const samples = 44100;
        const curve = new Float32Array(samples);
        const deg = Math.PI / 180;
        
        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / samples - 1;
          curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
        }
        
        waveshaper.curve = curve;
        waveshaper.oversample = "4x";
        return waveshaper;
      }

      case "tremolo": {
        const tremolo = this.ctx.createGain();
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        
        lfo.frequency.value = 5;
        lfoGain.gain.value = 0.5;
        
        lfo.connect(lfoGain);
        lfoGain.connect(tremolo.gain);
        lfo.start();
        this.oscillators.push(lfo);
        
        return tremolo;
      }

      case "chorus":
      case "flanger":
      case "phaser": {
        const delay = this.ctx.createDelay(0.1);
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        
        // Flanger has faster LFO and shorter delay
        if (type === "flanger") {
          lfo.frequency.value = 0.5;
          lfoGain.gain.value = 0.002;
          delay.delayTime.value = 0.005;
        } else {
          lfo.frequency.value = 0.3;
          lfoGain.gain.value = 0.005;
          delay.delayTime.value = 0.02;
        }
        
        lfo.connect(lfoGain);
        lfoGain.connect(delay.delayTime);
        lfo.start();
        this.oscillators.push(lfo);
        
        return delay;
      }

      case "bitcrusher": {
        const waveshaper = this.ctx.createWaveShaper();
        const bits = 4;
        const samples = 44100;
        const curve = new Float32Array(samples);
        const step = Math.pow(0.5, bits);
        
        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / samples - 1;
          curve[i] = step * Math.floor(x / step + 0.5);
        }
        
        waveshaper.curve = curve;
        return waveshaper;
      }

      default:
        // For unimplemented effects, use gain node
        const gain = this.ctx.createGain();
        gain.gain.value = 1;
        return gain;
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
        const freq = this.parameters.cutoff || this.parameters.frequency || 1000;
        this.effectNode.frequency.value = Math.max(20, Math.min(20000, freq));
      }
      if (this.parameters.resonance !== undefined || this.parameters.Q !== undefined) {
        const q = this.parameters.resonance || this.parameters.Q || 1;
        this.effectNode.Q.value = Math.max(0.0001, Math.min(30, q));
      }
      if (this.parameters.gain !== undefined && this.effectNode.gain) {
        this.effectNode.gain.value = Math.max(-40, Math.min(40, this.parameters.gain));
      }
    } else if (this.effectNode instanceof DynamicsCompressorNode) {
      if (this.parameters.threshold !== undefined) {
        this.effectNode.threshold.value = Math.max(-100, Math.min(0, this.parameters.threshold));
      }
      if (this.parameters.ratio !== undefined) {
        this.effectNode.ratio.value = Math.max(1, Math.min(20, this.parameters.ratio));
      }
      if (this.parameters.attack !== undefined) {
        this.effectNode.attack.value = Math.max(0, Math.min(1, this.parameters.attack));
      }
      if (this.parameters.release !== undefined) {
        this.effectNode.release.value = Math.max(0, Math.min(1, this.parameters.release));
      }
    } else if (this.effectNode instanceof DelayNode) {
      if (this.parameters.time !== undefined) {
        this.effectNode.delayTime.value = Math.max(0, Math.min(2, this.parameters.time));
      }
    } else if (this.effectNode instanceof WaveShaperNode) {
      // For distortion effects, intensity affects the drive amount
      if (this.intensity !== undefined) {
        const amount = this.effectType === "fuzz" ? 100 : this.effectType === "distortion" ? 50 : 20;
        const drive = amount * this.intensity * 2;
        const samples = 44100;
        const curve = new Float32Array(samples);
        const deg = Math.PI / 180;
        
        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / samples - 1;
          curve[i] = ((3 + drive) * x * 20 * deg) / (Math.PI + drive * Math.abs(x));
        }
        
        this.effectNode.curve = curve;
      }
    }
  }

  getParameters(): Record<string, number> {
    return this.parameters;
  }

  dispose() {
    // Stop all oscillators
    this.oscillators.forEach(osc => {
      try {
        osc.stop();
        osc.disconnect();
      } catch (e) {
        // Ignore errors if already stopped
      }
    });
    this.oscillators = [];
    
    // Call parent dispose
    super.dispose();
  }
}
