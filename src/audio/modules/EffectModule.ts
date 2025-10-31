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
  private feedbackGain?: GainNode;
  private filterNode?: BiquadFilterNode;
  private lfoGain?: GainNode;

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
    const effectNodes = this.createEffectNode(effectType);
    this.effectNode = effectNodes.main;
    this.feedbackGain = effectNodes.feedback;
    this.filterNode = effectNodes.filter;
    this.lfoGain = effectNodes.lfoGain;

    // Wire up: input -> dry -> output
    this.inputNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);

    // Wire up: input -> effect -> wet -> output
    this.inputNode.connect(this.effectNode);
    this.effectNode.connect(this.wetGain);
    this.wetGain.connect(this.outputNode);

    this.isActive = true;
  }

  private createEffectNode(type: string): { main: AudioNode; feedback?: GainNode; filter?: BiquadFilterNode; lfoGain?: GainNode } {
    switch (type) {
      case "lpf": {
        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 1000;
        filter.Q.value = 8; // More dramatic resonance
        return { main: filter };
      }

      case "hpf": {
        const filter = this.ctx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 500;
        filter.Q.value = 8; // More dramatic resonance
        return { main: filter };
      }

      case "bandpass":
      case "resonant-filter": {
        const filter = this.ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 1000;
        filter.Q.value = 20; // Much more dramatic resonance
        return { main: filter };
      }

      case "eq": {
        const filter = this.ctx.createBiquadFilter();
        filter.type = "peaking";
        filter.frequency.value = 1000;
        filter.Q.value = 1;
        filter.gain.value = 0;
        return { main: filter };
      }

      case "compressor": {
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 30;
        compressor.ratio.value = 12;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;
        return { main: compressor };
      }

      case "delay":
      case "pingpong-delay": {
        const delay = this.ctx.createDelay(2);
        const feedbackGain = this.ctx.createGain();
        const filterNode = this.ctx.createBiquadFilter();
        
        delay.delayTime.value = 0.375; // Musical timing (dotted 8th)
        feedbackGain.gain.value = 0.65; // More dramatic feedback
        filterNode.type = "lowpass";
        filterNode.frequency.value = 3000; // Darker tape-style delay
        
        // Create feedback loop with filter for tape-style degradation
        delay.connect(filterNode);
        filterNode.connect(feedbackGain);
        feedbackGain.connect(delay);
        
        return { main: delay, feedback: feedbackGain, filter: filterNode };
      }

      case "reverb": {
        // Create a lush hall reverb
        const convolver = this.ctx.createConvolver();
        const length = this.ctx.sampleRate * 4; // Longer for bigger space
        const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
        const leftChannel = impulse.getChannelData(0);
        const rightChannel = impulse.getChannelData(1);
        
        for (let i = 0; i < length; i++) {
          const decay = Math.pow(1 - i / length, 1.5); // Slower decay for hall
          const earlyReflection = i < this.ctx.sampleRate * 0.1 ? Math.random() * 0.3 : 0;
          leftChannel[i] = ((Math.random() * 2 - 1) * decay + earlyReflection) * 0.8;
          rightChannel[i] = ((Math.random() * 2 - 1) * decay + earlyReflection) * 0.8;
        }
        
        convolver.buffer = impulse;
        return { main: convolver };
      }

      case "distortion":
      case "overdrive":
      case "fuzz": {
        const waveshaper = this.ctx.createWaveShaper();
        // More dramatic distortion curves
        const amount = type === "fuzz" ? 200 : type === "distortion" ? 100 : 30;
        const samples = 44100;
        const curve = new Float32Array(samples);
        
        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / samples - 1;
          if (type === "fuzz") {
            // Hard clipping for fuzz with asymmetrical curve
            curve[i] = Math.max(-0.8, Math.min(0.9, x * amount)) * (x > 0 ? 1 : 0.9);
          } else if (type === "distortion") {
            // Aggressive soft clipping for distortion
            curve[i] = Math.tanh(x * amount) * 0.9;
          } else {
            // Smooth tube-like overdrive
            const k = 2 * amount / (1 - amount);
            curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
          }
        }
        
        waveshaper.curve = curve;
        waveshaper.oversample = "4x";
        return { main: waveshaper };
      }

      case "tremolo": {
        const tremolo = this.ctx.createGain();
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        
        lfo.type = "sine"; // Classic tremolo waveform
        lfo.frequency.value = 6; // Classic tremolo speed
        tremolo.gain.value = 0.5; // Center point
        lfoGain.gain.value = 0.4; // Dramatic depth
        
        lfo.connect(lfoGain);
        lfoGain.connect(tremolo.gain);
        lfo.start();
        this.oscillators.push(lfo);
        
        return { main: tremolo, lfoGain };
      }

      case "chorus":
      case "flanger":
      case "phaser": {
        const delay = this.ctx.createDelay(0.1);
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        const feedbackGain = this.ctx.createGain();
        
        // More dramatic modulation settings
        if (type === "flanger") {
          lfo.type = "sine";
          lfo.frequency.value = 0.7; // Faster sweep
          lfoGain.gain.value = 0.004; // Deeper modulation
          delay.delayTime.value = 0.003;
          feedbackGain.gain.value = 0.7; // More resonance
        } else if (type === "phaser") {
          lfo.type = "sine";
          lfo.frequency.value = 0.5;
          lfoGain.gain.value = 0.008; // More dramatic sweep
          delay.delayTime.value = 0.015;
          feedbackGain.gain.value = 0.6;
        } else {
          // Chorus with lush, wide modulation
          lfo.type = "sine";
          lfo.frequency.value = 0.4;
          lfoGain.gain.value = 0.01; // Wider modulation
          delay.delayTime.value = 0.025;
          feedbackGain.gain.value = 0.2; // Subtle feedback
        }
        
        lfo.connect(lfoGain);
        lfoGain.connect(delay.delayTime);
        lfo.start();
        this.oscillators.push(lfo);
        
        // Add feedback loop for resonance
        delay.connect(feedbackGain);
        feedbackGain.connect(delay);
        
        return { main: delay, feedback: feedbackGain, lfoGain };
      }

      case "bitcrusher": {
        const waveshaper = this.ctx.createWaveShaper();
        const bits = 6; // More dramatic bit reduction
        const samples = 44100;
        const curve = new Float32Array(samples);
        const step = Math.pow(0.5, bits);
        
        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / samples - 1;
          // Add some non-linearity for more character
          curve[i] = step * Math.floor(x / step + 0.5) * 1.1;
        }
        
        waveshaper.curve = curve;
        return { main: waveshaper };
      }

      default:
        // For unimplemented effects, use gain node
        const gain = this.ctx.createGain();
        gain.gain.value = 1;
        return { main: gain };
    }
  }

  start() {
    // Don't override isActive - respect the user's bypass setting
    // Just ensure the audio graph is ready
    this.updateBypass();
  }

  stop() {
    // Don't change isActive when stopping playback
    // The bypass state should persist
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
    // Apply parameters based on effect type
    if (this.effectNode instanceof BiquadFilterNode) {
      // Handle filters (LPF, HPF, Bandpass, EQ, Resonant)
      if (this.parameters.cutoff !== undefined || this.parameters.frequency !== undefined) {
        const freq = this.parameters.cutoff || this.parameters.frequency || 1000;
        this.effectNode.frequency.value = Math.max(20, Math.min(20000, freq));
      }
      if (this.parameters.resonance !== undefined || this.parameters.Q !== undefined) {
        const q = this.parameters.resonance || this.parameters.Q || 1;
        this.effectNode.Q.value = Math.max(0.0001, Math.min(30, q));
      }
      
      // EQ-specific parameters
      if (this.effectType === "eq" && this.effectNode.gain) {
        if (this.parameters.lowGain !== undefined) {
          this.effectNode.gain.value = Math.max(-40, Math.min(40, this.parameters.lowGain));
        }
        if (this.parameters.lowFreq !== undefined) {
          this.effectNode.frequency.value = Math.max(20, Math.min(500, this.parameters.lowFreq));
        }
      }
    } else if (this.effectNode instanceof DynamicsCompressorNode) {
      // Compressor parameters
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
      if (this.parameters.knee !== undefined) {
        this.effectNode.knee.value = Math.max(0, Math.min(40, this.parameters.knee));
      }
    } else if (this.effectNode instanceof DelayNode) {
      // Delay parameters
      if (this.parameters.time !== undefined) {
        this.effectNode.delayTime.value = Math.max(0.001, Math.min(2, this.parameters.time));
      }
      // Delay feedback
      if (this.feedbackGain && this.parameters.feedback !== undefined) {
        this.feedbackGain.gain.value = Math.max(0, Math.min(0.95, this.parameters.feedback));
      }
      // Delay filter
      if (this.filterNode && this.parameters.filterFreq !== undefined) {
        this.filterNode.frequency.value = Math.max(200, Math.min(8000, this.parameters.filterFreq));
      }
    } else if (this.effectNode instanceof WaveShaperNode) {
      // Distortion effects: drive/amount/fuzz parameter
      const driveParam = this.parameters.drive || this.parameters.amount || this.parameters.fuzz || this.intensity;
      if (driveParam !== undefined) {
        const baseAmount = this.effectType === "fuzz" ? 100 : this.effectType === "distortion" ? 50 : 20;
        const drive = baseAmount * driveParam * 2;
        const samples = 44100;
        const curve = new Float32Array(samples);
        const deg = Math.PI / 180;
        
        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / samples - 1;
          curve[i] = ((3 + drive) * x * 20 * deg) / (Math.PI + drive * Math.abs(x));
        }
        
        this.effectNode.curve = curve;
      }
      
      // Bitcrusher bit depth
      if (this.effectType === "bitcrusher" && this.parameters.bits !== undefined) {
        const bits = Math.max(1, Math.min(16, this.parameters.bits));
        const samples = 44100;
        const curve = new Float32Array(samples);
        const step = Math.pow(0.5, bits);
        
        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / samples - 1;
          curve[i] = step * Math.floor(x / step + 0.5);
        }
        
        this.effectNode.curve = curve;
      }
    } else if (this.effectNode instanceof ConvolverNode) {
      // Reverb parameters (requires regenerating impulse response)
      if (this.parameters.size !== undefined || this.parameters.decay !== undefined || this.parameters.damping !== undefined) {
        const size = this.parameters.size || 0.5;
        const decay = this.parameters.decay || 2;
        const damping = this.parameters.damping || 0.5;
        
        const length = this.ctx.sampleRate * decay * (0.5 + size * 1.5);
        const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
        const leftChannel = impulse.getChannelData(0);
        const rightChannel = impulse.getChannelData(1);
        
        for (let i = 0; i < length; i++) {
          const decay_factor = Math.pow(1 - i / length, 2);
          const damping_factor = 1 - (damping * i / length);
          leftChannel[i] = (Math.random() * 2 - 1) * decay_factor * damping_factor;
          rightChannel[i] = (Math.random() * 2 - 1) * decay_factor * damping_factor;
        }
        
        this.effectNode.buffer = impulse;
      }
    }
    
    // Modulation effects (tremolo, chorus, flanger, phaser)
    if (this.oscillators.length > 0) {
      const lfo = this.oscillators[0];
      if (this.parameters.rate !== undefined) {
        const rate = Math.max(0.01, Math.min(20, this.parameters.rate));
        lfo.frequency.value = rate;
      }
    }
    
    // LFO depth control for modulation effects
    if (this.lfoGain && this.parameters.depth !== undefined) {
      const depth = Math.max(0, Math.min(1, this.parameters.depth));
      if (this.effectType === "flanger") {
        this.lfoGain.gain.value = depth * 0.005;
      } else if (this.effectType === "tremolo") {
        this.lfoGain.gain.value = depth;
      } else {
        this.lfoGain.gain.value = depth * 0.01;
      }
    }
    
    // Feedback control for chorus/flanger/phaser
    if (this.feedbackGain && this.parameters.feedback !== undefined && 
        (this.effectType === "chorus" || this.effectType === "flanger" || this.effectType === "phaser")) {
      this.feedbackGain.gain.value = Math.max(-0.95, Math.min(0.95, this.parameters.feedback));
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
