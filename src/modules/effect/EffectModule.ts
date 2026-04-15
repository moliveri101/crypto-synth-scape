import { AudioModule } from "../base/AudioModule";

// ─── All 29 supported effect types ──────────────────────────────────────────
export const EFFECT_TYPES = [
  "lowpass",
  "highpass",
  "bandpass",
  "notch",
  "allpass",
  "peaking",
  "lowshelf",
  "highshelf",
  "delay",
  "ping-pong-delay",
  "reverb",
  "chorus",
  "flanger",
  "phaser",
  "tremolo",
  "vibrato",
  "distortion",
  "overdrive",
  "bitcrusher",
  "compressor",
  "gate",
  "limiter",
  "eq3",
  "stereo-widener",
  "auto-pan",
  "ring-modulator",
  "frequency-shifter",
  "pitch-shifter",
  "wavefolder",
] as const;

export type EffectType = (typeof EFFECT_TYPES)[number];

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeDistortionCurve(drive: number): Float32Array {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const k = drive * 100;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

function makeBitcrusherCurve(bits: number): Float32Array {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const steps = Math.pow(2, bits);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

function makeFoldCurve(folds: number): Float32Array {
  const samples = 44100;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.sin(x * folds * Math.PI);
  }
  return curve;
}

async function generateReverbImpulse(
  ctx: AudioContext,
  size: number,
  decay: number,
  damping: number,
): Promise<AudioBuffer> {
  const length = Math.max(0.1, size) * ctx.sampleRate;
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const env = Math.pow(1 - i / length, decay);
      const noise = Math.random() * 2 - 1;
      // simple damping: attenuate high-frequency content over time
      data[i] = noise * env * (1 - damping * (i / length));
    }
  }
  return buffer;
}

// ─── EffectModule ───────────────────────────────────────────────────────────

export class EffectModule extends AudioModule {
  readonly effectType: EffectType;

  // wet/dry mix
  private dryGain: GainNode;
  private wetGain: GainNode;
  private inputGain: GainNode;
  private outputGain: GainNode;

  // core effect nodes — populated per type
  private effectNodes: AudioNode[] = [];
  private oscillators: OscillatorNode[] = [];

  // cache for expensive regeneration
  private lastDrive = -1;
  private lastBits = -1;
  private lastReverbSize = -1;
  private lastReverbDecay = -1;
  private lastReverbDamping = -1;
  private lastFolds = -1;

  // references to specific node types for parameter updates
  private filter?: BiquadFilterNode;
  private filter2?: BiquadFilterNode;
  private filter3?: BiquadFilterNode;
  private compressor?: DynamicsCompressorNode;
  private delayNode?: DelayNode;
  private delayNodeR?: DelayNode;
  private feedbackGain?: GainNode;
  private feedbackGainR?: GainNode;
  private waveshaper?: WaveShaperNode;
  private convolver?: ConvolverNode;
  private lfo?: OscillatorNode;
  private lfoGain?: GainNode;
  private lfo2?: OscillatorNode;
  private lfoGain2?: GainNode;

  // stored parameters for cache comparison
  private params: Record<string, any> = {};

  constructor(ctx: AudioContext, effectType: string) {
    super(ctx);
    this.effectType = effectType as EffectType;

    // stereo wet/dry architecture
    this.inputGain = this.createStereoGain();
    this.outputGain = this.createStereoGain();
    this.dryGain = this.createStereoGain(0.5);
    this.wetGain = this.createStereoGain(0.5);

    // override base class I/O to use our own input/output
    (this as any).inputNode = this.inputGain;
    (this as any).outputNode = this.outputGain;

    // dry path: input → dry → output
    this.inputGain.connect(this.dryGain);
    this.dryGain.connect(this.outputGain);

    // wet path built by createEffectNode
    this.createEffectNode();
  }

  // ── Effect graph construction ─────────────────────────────────────────────

  private createEffectNode(): void {
    switch (this.effectType) {
      // ── Filters ──
      case "lowpass":
      case "highpass":
      case "bandpass":
      case "notch":
      case "allpass":
      case "peaking":
      case "lowshelf":
      case "highshelf": {
        const f = this.ctx.createBiquadFilter();
        f.type = this.effectType;
        f.frequency.value = 1000;
        f.Q.value = 1;
        this.configureStereo(f);
        this.filter = f;
        this.wireWetPath([f]);
        break;
      }

      // ── Delay ──
      case "delay": {
        const d = this.ctx.createDelay(5);
        d.delayTime.value = 0.3;
        this.configureStereo(d);
        const fb = this.createStereoGain(0.4);
        d.connect(fb);
        fb.connect(d);
        this.delayNode = d;
        this.feedbackGain = fb;
        this.wireWetPath([d]);
        break;
      }

      // ── Ping-pong delay (true L/R alternation) ──
      case "ping-pong-delay": {
        const splitter = this.ctx.createChannelSplitter(2);
        const merger = this.ctx.createChannelMerger(2);

        const delayL = this.ctx.createDelay(5);
        delayL.delayTime.value = 0.3;
        const delayR = this.ctx.createDelay(5);
        delayR.delayTime.value = 0.3;

        const fbL = this.ctx.createGain();
        fbL.gain.value = 0.4;
        const fbR = this.ctx.createGain();
        fbR.gain.value = 0.4;

        // split input into L/R
        this.inputGain.connect(splitter);

        // L channel → delayL → merger L, and cross-feed to delayR
        splitter.connect(delayL, 0);
        delayL.connect(merger, 0, 0);
        delayL.connect(fbR);
        fbR.connect(delayR);

        // R channel → delayR → merger R, and cross-feed to delayL
        splitter.connect(delayR, 1);
        delayR.connect(merger, 0, 1);
        delayR.connect(fbL);
        fbL.connect(delayL);

        merger.connect(this.wetGain);
        this.wetGain.connect(this.outputGain);

        this.delayNode = delayL;
        this.delayNodeR = delayR;
        this.feedbackGain = fbL;
        this.feedbackGainR = fbR;
        this.effectNodes.push(splitter, delayL, delayR, fbL, fbR, merger);
        break;
      }

      // ── Reverb ──
      case "reverb": {
        const conv = this.ctx.createConvolver();
        this.configureStereo(conv);
        this.convolver = conv;
        this.lastReverbSize = 2;
        this.lastReverbDecay = 2;
        this.lastReverbDamping = 0.3;
        generateReverbImpulse(this.ctx, 2, 2, 0.3).then((buf) => {
          if (this.convolver) this.convolver.buffer = buf;
        });
        this.wireWetPath([conv]);
        break;
      }

      // ── Chorus ──
      case "chorus": {
        const d = this.ctx.createDelay(0.1);
        d.delayTime.value = 0.02;
        this.configureStereo(d);
        const lfo = this.ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 1.5;
        const lfoG = this.ctx.createGain();
        lfoG.gain.value = 0.005;
        lfo.connect(lfoG);
        lfoG.connect(d.delayTime);
        lfo.start();
        this.lfo = lfo;
        this.lfoGain = lfoG;
        this.delayNode = d;
        this.oscillators.push(lfo);
        this.wireWetPath([d]);
        break;
      }

      // ── Flanger ──
      case "flanger": {
        const d = this.ctx.createDelay(0.02);
        d.delayTime.value = 0.005;
        this.configureStereo(d);
        const fb = this.createStereoGain(0.5);
        d.connect(fb);
        fb.connect(d);
        const lfo = this.ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 0.25;
        const lfoG = this.ctx.createGain();
        lfoG.gain.value = 0.003;
        lfo.connect(lfoG);
        lfoG.connect(d.delayTime);
        lfo.start();
        this.lfo = lfo;
        this.lfoGain = lfoG;
        this.delayNode = d;
        this.feedbackGain = fb;
        this.oscillators.push(lfo);
        this.wireWetPath([d]);
        break;
      }

      // ── Phaser ──
      case "phaser": {
        const filters: BiquadFilterNode[] = [];
        let prev: AudioNode = this.inputGain;
        for (let i = 0; i < 4; i++) {
          const ap = this.ctx.createBiquadFilter();
          ap.type = "allpass";
          ap.frequency.value = 1000 + i * 500;
          ap.Q.value = 0.5;
          this.configureStereo(ap);
          filters.push(ap);
          this.effectNodes.push(ap);
        }
        // chain filters
        filters[0].connect(filters[1]);
        filters[1].connect(filters[2]);
        filters[2].connect(filters[3]);

        const lfo = this.ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 0.5;
        const lfoG = this.ctx.createGain();
        lfoG.gain.value = 500;
        lfo.connect(lfoG);
        for (const f of filters) lfoG.connect(f.frequency);
        lfo.start();
        this.lfo = lfo;
        this.lfoGain = lfoG;
        this.filter = filters[0];
        this.oscillators.push(lfo);

        // manual wet path: input → filters → wet → output
        this.inputGain.connect(filters[0]);
        filters[3].connect(this.wetGain);
        this.wetGain.connect(this.outputGain);
        break;
      }

      // ── Tremolo ──
      case "tremolo": {
        const tGain = this.createStereoGain(1);
        const lfo = this.ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 4;
        const lfoG = this.ctx.createGain();
        lfoG.gain.value = 0.5;
        lfo.connect(lfoG);
        lfoG.connect(tGain.gain);
        lfo.start();
        this.lfo = lfo;
        this.lfoGain = lfoG;
        this.oscillators.push(lfo);
        this.wireWetPath([tGain]);
        break;
      }

      // ── Vibrato ──
      case "vibrato": {
        const d = this.ctx.createDelay(0.1);
        d.delayTime.value = 0.01;
        this.configureStereo(d);
        const lfo = this.ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 5;
        const lfoG = this.ctx.createGain();
        lfoG.gain.value = 0.005;
        lfo.connect(lfoG);
        lfoG.connect(d.delayTime);
        lfo.start();
        this.lfo = lfo;
        this.lfoGain = lfoG;
        this.delayNode = d;
        this.oscillators.push(lfo);
        this.wireWetPath([d]);
        break;
      }

      // ── Distortion ──
      case "distortion": {
        const ws = this.ctx.createWaveShaper();
        ws.oversample = "4x";
        this.configureStereo(ws);
        this.lastDrive = 0.5;
        ws.curve = makeDistortionCurve(0.5);
        this.waveshaper = ws;
        this.wireWetPath([ws]);
        break;
      }

      // ── Overdrive ──
      case "overdrive": {
        const ws = this.ctx.createWaveShaper();
        ws.oversample = "2x";
        this.configureStereo(ws);
        this.lastDrive = 0.3;
        ws.curve = makeDistortionCurve(0.3);
        // tone filter after overdrive
        const tone = this.ctx.createBiquadFilter();
        tone.type = "lowpass";
        tone.frequency.value = 3000;
        this.configureStereo(tone);
        this.waveshaper = ws;
        this.filter = tone;
        this.wireWetPath([ws, tone]);
        break;
      }

      // ── Bitcrusher ──
      case "bitcrusher": {
        const ws = this.ctx.createWaveShaper();
        ws.oversample = "none";
        this.configureStereo(ws);
        this.lastBits = 8;
        ws.curve = makeBitcrusherCurve(8);
        this.waveshaper = ws;
        this.wireWetPath([ws]);
        break;
      }

      // ── Compressor ──
      case "compressor": {
        const c = this.ctx.createDynamicsCompressor();
        c.threshold.value = -24;
        c.knee.value = 12;
        c.ratio.value = 4;
        c.attack.value = 0.003;
        c.release.value = 0.25;
        this.configureStereo(c);
        this.compressor = c;
        this.wireWetPath([c]);
        break;
      }

      // ── Gate ──
      case "gate": {
        // simulate gate with a very high-ratio compressor and low threshold
        const c = this.ctx.createDynamicsCompressor();
        c.threshold.value = -40;
        c.knee.value = 0;
        c.ratio.value = 20;
        c.attack.value = 0.001;
        c.release.value = 0.05;
        this.configureStereo(c);
        this.compressor = c;
        this.wireWetPath([c]);
        break;
      }

      // ── Limiter ──
      case "limiter": {
        const c = this.ctx.createDynamicsCompressor();
        c.threshold.value = -3;
        c.knee.value = 0;
        c.ratio.value = 20;
        c.attack.value = 0.001;
        c.release.value = 0.05;
        this.configureStereo(c);
        this.compressor = c;
        this.wireWetPath([c]);
        break;
      }

      // ── 3-band EQ ──
      case "eq3": {
        const lo = this.ctx.createBiquadFilter();
        lo.type = "lowshelf";
        lo.frequency.value = 320;
        lo.gain.value = 0;
        this.configureStereo(lo);

        const mid = this.ctx.createBiquadFilter();
        mid.type = "peaking";
        mid.frequency.value = 1000;
        mid.Q.value = 0.5;
        mid.gain.value = 0;
        this.configureStereo(mid);

        const hi = this.ctx.createBiquadFilter();
        hi.type = "highshelf";
        hi.frequency.value = 3200;
        hi.gain.value = 0;
        this.configureStereo(hi);

        this.filter = lo;
        this.filter2 = mid;
        this.filter3 = hi;
        this.wireWetPath([lo, mid, hi]);
        break;
      }

      // ── Stereo widener ──
      case "stereo-widener": {
        // mid/side technique via delay offset
        const d = this.ctx.createDelay(0.05);
        d.delayTime.value = 0.01;
        this.configureStereo(d);
        this.delayNode = d;
        this.wireWetPath([d]);
        break;
      }

      // ── Auto-pan ──
      case "auto-pan": {
        const panner = this.ctx.createStereoPanner();
        this.configureStereo(panner);
        const lfo = this.ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 2;
        const lfoG = this.ctx.createGain();
        lfoG.gain.value = 1;
        lfo.connect(lfoG);
        lfoG.connect(panner.pan);
        lfo.start();
        this.lfo = lfo;
        this.lfoGain = lfoG;
        this.oscillators.push(lfo);
        this.wireWetPath([panner]);
        break;
      }

      // ── Ring modulator ──
      case "ring-modulator": {
        const ringGain = this.createStereoGain(0);
        const carrier = this.ctx.createOscillator();
        carrier.type = "sine";
        carrier.frequency.value = 440;
        carrier.connect(ringGain.gain);
        carrier.start();
        this.lfo = carrier;
        this.oscillators.push(carrier);
        this.wireWetPath([ringGain]);
        break;
      }

      // ── Frequency shifter (approximation via ring mod + filter) ──
      case "frequency-shifter": {
        const ringGain = this.createStereoGain(0);
        const carrier = this.ctx.createOscillator();
        carrier.type = "sine";
        carrier.frequency.value = 100;
        carrier.connect(ringGain.gain);
        carrier.start();
        const bpf = this.ctx.createBiquadFilter();
        bpf.type = "bandpass";
        bpf.frequency.value = 1000;
        bpf.Q.value = 2;
        this.configureStereo(bpf);
        this.lfo = carrier;
        this.filter = bpf;
        this.oscillators.push(carrier);
        this.wireWetPath([ringGain, bpf]);
        break;
      }

      // ── Pitch shifter (delay-based approximation) ──
      case "pitch-shifter": {
        const d = this.ctx.createDelay(1);
        d.delayTime.value = 0.1;
        this.configureStereo(d);
        const lfo = this.ctx.createOscillator();
        lfo.type = "sawtooth";
        lfo.frequency.value = 2;
        const lfoG = this.ctx.createGain();
        lfoG.gain.value = 0.05;
        lfo.connect(lfoG);
        lfoG.connect(d.delayTime);
        lfo.start();
        this.lfo = lfo;
        this.lfoGain = lfoG;
        this.delayNode = d;
        this.oscillators.push(lfo);
        this.wireWetPath([d]);
        break;
      }

      // ── Wavefolder ──
      case "wavefolder": {
        const ws = this.ctx.createWaveShaper();
        ws.oversample = "4x";
        this.configureStereo(ws);
        this.lastFolds = 3;
        ws.curve = makeFoldCurve(3);
        this.waveshaper = ws;
        this.wireWetPath([ws]);
        break;
      }

      default:
        // fallback: pass-through
        this.wireWetPath([]);
    }
  }

  /** Wire an array of nodes as the wet path: input → nodes → wet → output */
  private wireWetPath(nodes: AudioNode[]): void {
    this.effectNodes.push(...nodes);
    if (nodes.length === 0) {
      this.inputGain.connect(this.wetGain);
    } else {
      this.inputGain.connect(nodes[0]);
      for (let i = 0; i < nodes.length - 1; i++) {
        nodes[i].connect(nodes[i + 1]);
      }
      nodes[nodes.length - 1].connect(this.wetGain);
    }
    this.wetGain.connect(this.outputGain);
  }

  // ── Bypass ────────────────────────────────────────────────────────────────

  private updateBypass(): void {
    if (this.isActive) {
      // active: normal wet/dry mix
      this.rampGain(this.wetGain.gain, this.params.mix ?? 0.5);
      this.rampGain(this.dryGain.gain, 1 - (this.params.mix ?? 0.5));
    } else {
      // bypassed: full dry, no wet
      this.rampGain(this.wetGain.gain, 0);
      this.rampGain(this.dryGain.gain, 1);
    }
  }

  start(): void {
    this.isActive = true;
    this.updateBypass();
  }

  stop(): void {
    this.isActive = false;
    this.updateBypass();
  }

  // ── Parameter application ─────────────────────────────────────────────────

  setParameter(name: string, value: any): void {
    this.params[name] = value;
    this.applyParameters();
  }

  private applyParameters(): void {
    const p = this.params;

    // wet/dry mix
    if (p.mix !== undefined) {
      this.updateBypass();
    }

    // BiquadFilterNode params
    if (this.filter) {
      if (p.frequency !== undefined) this.rampParam(this.filter.frequency, p.frequency);
      if (p.Q !== undefined) this.rampParam(this.filter.Q, p.Q);
      if (p.gain !== undefined) this.rampParam(this.filter.gain, p.gain);
      if (p.detune !== undefined) this.rampParam(this.filter.detune, p.detune);
      // overdrive tone
      if (p.tone !== undefined && this.effectType === "overdrive") {
        this.rampParam(this.filter.frequency, p.tone);
      }
    }

    // EQ3 mid/high bands
    if (this.filter2) {
      if (p.midFrequency !== undefined) this.rampParam(this.filter2.frequency, p.midFrequency);
      if (p.midGain !== undefined) this.rampParam(this.filter2.gain, p.midGain);
      if (p.midQ !== undefined) this.rampParam(this.filter2.Q, p.midQ);
    }
    if (this.filter3) {
      if (p.highFrequency !== undefined) this.rampParam(this.filter3.frequency, p.highFrequency);
      if (p.highGain !== undefined) this.rampParam(this.filter3.gain, p.highGain);
    }
    // EQ3 low band uses this.filter
    if (this.effectType === "eq3" && this.filter) {
      if (p.lowFrequency !== undefined) this.rampParam(this.filter.frequency, p.lowFrequency);
      if (p.lowGain !== undefined) this.rampParam(this.filter.gain, p.lowGain);
    }

    // DynamicsCompressorNode params
    if (this.compressor) {
      if (p.threshold !== undefined) this.rampParam(this.compressor.threshold, p.threshold);
      if (p.knee !== undefined) this.rampParam(this.compressor.knee, p.knee);
      if (p.ratio !== undefined) this.rampParam(this.compressor.ratio, p.ratio);
      if (p.attack !== undefined) this.rampParam(this.compressor.attack, p.attack);
      if (p.release !== undefined) this.rampParam(this.compressor.release, p.release);
    }

    // DelayNode params
    if (this.delayNode) {
      if (p.delayTime !== undefined) this.rampParam(this.delayNode.delayTime, p.delayTime);
    }
    if (this.delayNodeR) {
      if (p.delayTime !== undefined) this.rampParam(this.delayNodeR.delayTime, p.delayTime);
    }

    // Feedback
    if (this.feedbackGain) {
      if (p.feedback !== undefined) this.rampGain(this.feedbackGain.gain, p.feedback);
    }
    if (this.feedbackGainR) {
      if (p.feedback !== undefined) this.rampGain(this.feedbackGainR.gain, p.feedback);
    }

    // WaveShaper — cached curve regeneration
    if (this.waveshaper) {
      if (this.effectType === "distortion" || this.effectType === "overdrive") {
        const drive = p.drive ?? this.lastDrive;
        if (drive !== this.lastDrive) {
          this.lastDrive = drive;
          this.waveshaper.curve = makeDistortionCurve(drive);
        }
      }
      if (this.effectType === "bitcrusher") {
        const bits = p.bits ?? this.lastBits;
        if (bits !== this.lastBits) {
          this.lastBits = bits;
          this.waveshaper.curve = makeBitcrusherCurve(bits);
        }
      }
      if (this.effectType === "wavefolder") {
        const folds = p.folds ?? this.lastFolds;
        if (folds !== this.lastFolds) {
          this.lastFolds = folds;
          this.waveshaper.curve = makeFoldCurve(folds);
        }
      }
    }

    // ConvolverNode — cached impulse regeneration
    if (this.convolver) {
      const size = p.size ?? this.lastReverbSize;
      const decay = p.decay ?? this.lastReverbDecay;
      const damping = p.damping ?? this.lastReverbDamping;
      if (
        size !== this.lastReverbSize ||
        decay !== this.lastReverbDecay ||
        damping !== this.lastReverbDamping
      ) {
        this.lastReverbSize = size;
        this.lastReverbDecay = decay;
        this.lastReverbDamping = damping;
        generateReverbImpulse(this.ctx, size, decay, damping).then((buf) => {
          if (this.convolver) this.convolver.buffer = buf;
        });
      }
    }

    // LFO rate/depth
    if (this.lfo) {
      if (p.rate !== undefined) this.rampParam(this.lfo.frequency, p.rate);
      if (p.carrierFrequency !== undefined) this.rampParam(this.lfo.frequency, p.carrierFrequency);
      if (p.shift !== undefined) this.rampParam(this.lfo.frequency, p.shift);
    }
    if (this.lfoGain) {
      if (p.depth !== undefined) this.rampParam(this.lfoGain.gain, p.depth);
    }

    // stereo widener width
    if (this.effectType === "stereo-widener" && this.delayNode) {
      if (p.width !== undefined) {
        this.rampParam(this.delayNode.delayTime, p.width * 0.03);
      }
    }

    // pitch shifter semitones → lfo frequency
    if (this.effectType === "pitch-shifter" && this.lfo) {
      if (p.semitones !== undefined) {
        this.rampParam(this.lfo.frequency, Math.abs(p.semitones) * 0.5 + 0.5);
      }
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  dispose(): void {
    // stop and disconnect all oscillators
    for (const osc of this.oscillators) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
      try {
        osc.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.oscillators = [];

    // disconnect all effect nodes
    for (const node of this.effectNodes) {
      try {
        node.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.effectNodes = [];

    // disconnect gain stages
    try { this.inputGain.disconnect(); } catch { /* */ }
    try { this.outputGain.disconnect(); } catch { /* */ }
    try { this.dryGain.disconnect(); } catch { /* */ }
    try { this.wetGain.disconnect(); } catch { /* */ }

    // clear references
    this.filter = undefined;
    this.filter2 = undefined;
    this.filter3 = undefined;
    this.compressor = undefined;
    this.delayNode = undefined;
    this.delayNodeR = undefined;
    this.feedbackGain = undefined;
    this.feedbackGainR = undefined;
    this.waveshaper = undefined;
    this.convolver = undefined;
    this.lfo = undefined;
    this.lfoGain = undefined;
    this.lfo2 = undefined;
    this.lfoGain2 = undefined;

    super.dispose();
  }
}
