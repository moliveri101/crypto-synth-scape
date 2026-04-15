import { AudioModule } from "../base/AudioModule";
import { STEREO_CHANNELS, RAMP_TIME } from "../base/types";

// ─── Drum type catalogue ─────────────────────────────────────────────────────
const DRUM_TYPES = [
  "kick", "snare", "hihat", "clap", "tom",
  "low-tom", "mid-tom", "high-tom", "cowbell",
  "ride", "crash", "shaker", "clave", "rim",
  "rimshot", "bongo", "conga",
] as const;

export type DrumType = (typeof DRUM_TYPES)[number];

// ─── Gate-detection constants ────────────────────────────────────────────────
const RMS_THRESHOLD = 0.1;
const DEBOUNCE_MS = 50;
const MONITOR_INTERVAL_MS = 30;

/**
 * DrumsModule -- 17 drum voices triggered by gate detection or manual trigger.
 *
 * Signal flow:  drum voice envelope → outputNode
 * Gate input:   inputNode → analyser (RMS monitor)
 */
export class DrumsModule extends AudioModule {
  private analyser: AnalyserNode;
  private monitorBuffer: Uint8Array;
  private monitorInterval: ReturnType<typeof setInterval> | null = null;
  private lastTriggerTime = 0;

  private selectedDrum: DrumType = "kick";
  private pitch = 1.0;

  constructor(ctx: AudioContext) {
    super(ctx);

    // ── Analyser for gate detection ────────────────────────────────────────
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.configureStereo(this.analyser);
    this.inputNode.connect(this.analyser);

    // Pre-allocate monitoring buffer ONCE
    this.monitorBuffer = new Uint8Array(this.analyser.fftSize);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  start(): void {
    if (this.isActive) return;
    this.isActive = true;

    this.monitorInterval = setInterval(() => {
      this.analyser.getByteTimeDomainData(this.monitorBuffer);

      // RMS calculation
      let sum = 0;
      for (let i = 0; i < this.monitorBuffer.length; i++) {
        const sample = (this.monitorBuffer[i] - 128) / 128;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / this.monitorBuffer.length);

      if (rms > RMS_THRESHOLD) {
        const now = performance.now();
        if (now - this.lastTriggerTime > DEBOUNCE_MS) {
          this.lastTriggerTime = now;
          this.trigger();
        }
      }
    }, MONITOR_INTERVAL_MS);
  }

  stop(): void {
    if (!this.isActive) return;
    this.isActive = false;

    if (this.monitorInterval !== null) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  setParameter(name: string, value: any): void {
    switch (name) {
      case "volume":
        this.rampGain(this.outputNode.gain, Number(value));
        break;
      case "pitch":
        this.pitch = Number(value);
        break;
      case "selectedDrum":
        if (DRUM_TYPES.includes(value as DrumType)) {
          this.selectedDrum = value as DrumType;
        }
        break;
    }
  }

  handleAction(action: string, _payload?: any): Record<string, any> | void {
    if (action === "trigger") {
      this.trigger();
    }
  }

  dispose(): void {
    this.stop();
    try { this.analyser.disconnect(); } catch { /* ok */ }
    super.dispose();
  }

  // ── Public trigger ───────────────────────────────────────────────────────

  trigger(): void {
    const now = this.ctx.currentTime;
    switch (this.selectedDrum) {
      case "kick":        this.playKick(now); break;
      case "snare":       this.playSnare(now); break;
      case "hihat":       this.playHihat(now); break;
      case "clap":        this.playClap(now); break;
      case "tom":         this.playTom(now, 200); break;
      case "low-tom":     this.playTom(now, 100); break;
      case "mid-tom":     this.playTom(now, 200); break;
      case "high-tom":    this.playTom(now, 320); break;
      case "cowbell":     this.playCowbell(now); break;
      case "ride":        this.playRide(now); break;
      case "crash":       this.playCrash(now); break;
      case "shaker":      this.playShaker(now); break;
      case "clave":       this.playClave(now); break;
      case "rim":         this.playRim(now); break;
      case "rimshot":     this.playRimshot(now); break;
      case "bongo":       this.playBongo(now); break;
      case "conga":       this.playConga(now); break;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Start an oscillator with an envelope GainNode routed to outputNode.
   * The oscillator and gain auto-disconnect when the osc stops.
   */
  private startOsc(
    type: OscillatorType,
    freq: number,
    startTime: number,
    stopTime: number,
    envelope: (g: GainNode, t: number) => void,
  ): OscillatorNode {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq * this.pitch;

    const env = this.createStereoGain(0);
    osc.connect(env);
    env.connect(this.outputNode);

    envelope(env, startTime);
    osc.start(startTime);
    osc.stop(stopTime);

    return osc;
  }

  /**
   * Create a stereo noise burst routed through an envelope to outputNode.
   * Uses 2-channel buffer with decorrelated (independent) noise per channel.
   */
  private startNoise(
    duration: number,
    startTime: number,
    envelope: (g: GainNode, t: number) => void,
  ): AudioBufferSourceNode {
    const sampleRate = this.ctx.sampleRate;
    const length = Math.ceil(sampleRate * duration);
    const buffer = this.ctx.createBuffer(STEREO_CHANNELS, length, sampleRate);

    // Decorrelated noise: independent random data per channel
    for (let ch = 0; ch < STEREO_CHANNELS; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const env = this.createStereoGain(0);
    src.connect(env);
    env.connect(this.outputNode);

    envelope(env, startTime);
    src.start(startTime);
    src.stop(startTime + duration);

    return src;
  }

  // ── Drum voices ──────────────────────────────────────────────────────────

  private playKick(t: number): void {
    // Body oscillator with pitch sweep
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150 * this.pitch, t);
    osc.frequency.exponentialRampToValueAtTime(40 * this.pitch, t + 0.12);

    const env = this.createStereoGain(0);
    env.gain.setValueAtTime(1, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    osc.connect(env);
    env.connect(this.outputNode);
    osc.start(t);
    osc.stop(t + 0.5);

    // Click transient
    this.startOsc("square", 800 * this.pitch, t, t + 0.015, (g, st) => {
      g.gain.setValueAtTime(0.3, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.015);
    });
  }

  private playSnare(t: number): void {
    // Body tone
    this.startOsc("triangle", 180 * this.pitch, t, t + 0.15, (g, st) => {
      g.gain.setValueAtTime(0.7, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.15);
    });

    // Noise layer
    this.startNoise(0.2, t, (g, st) => {
      g.gain.setValueAtTime(0.6, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.2);
    });
  }

  private playHihat(t: number): void {
    // High-frequency bandpass noise for metallic character
    const duration = 0.08;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.ceil(sampleRate * duration);
    const buffer = this.ctx.createBuffer(STEREO_CHANNELS, length, sampleRate);
    for (let ch = 0; ch < STEREO_CHANNELS; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = "highpass";
    bp.frequency.value = 7000 * this.pitch;

    const env = this.createStereoGain(0);
    env.gain.setValueAtTime(0.5, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + duration);

    src.connect(bp);
    bp.connect(env);
    env.connect(this.outputNode);
    src.start(t);
    src.stop(t + duration);
  }

  private playClap(t: number): void {
    // Multi-layer noise bursts to simulate a clap
    const offsets = [0, 0.01, 0.02, 0.035];
    for (const offset of offsets) {
      this.startNoise(0.04, t + offset, (g, st) => {
        g.gain.setValueAtTime(0.4, st);
        g.gain.exponentialRampToValueAtTime(0.001, st + 0.04);
      });
    }
    // Tail
    this.startNoise(0.15, t + 0.04, (g, st) => {
      g.gain.setValueAtTime(0.5, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.15);
    });
  }

  private playTom(t: number, baseFreq: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(baseFreq * this.pitch * 1.5, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * this.pitch, t + 0.05);

    const env = this.createStereoGain(0);
    env.gain.setValueAtTime(0.8, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    osc.connect(env);
    env.connect(this.outputNode);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  private playCowbell(t: number): void {
    // Two detuned square oscillators
    this.startOsc("square", 560 * this.pitch, t, t + 0.3, (g, st) => {
      g.gain.setValueAtTime(0.3, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.3);
    });
    this.startOsc("square", 845 * this.pitch, t, t + 0.3, (g, st) => {
      g.gain.setValueAtTime(0.3, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.3);
    });
  }

  private playRide(t: number): void {
    // Longer metallic noise
    this.startNoise(0.6, t, (g, st) => {
      g.gain.setValueAtTime(0.3, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.6);
    });

    // High-frequency shimmer
    this.startOsc("sine", 6500 * this.pitch, t, t + 0.4, (g, st) => {
      g.gain.setValueAtTime(0.08, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.4);
    });
  }

  private playCrash(t: number): void {
    // Wide noise burst
    this.startNoise(1.2, t, (g, st) => {
      g.gain.setValueAtTime(0.5, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 1.2);
    });
  }

  private playShaker(t: number): void {
    // Short high noise
    this.startNoise(0.06, t, (g, st) => {
      g.gain.setValueAtTime(0.25, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.06);
    });
  }

  private playClave(t: number): void {
    // Sharp attack, high sine
    this.startOsc("sine", 2500 * this.pitch, t, t + 0.04, (g, st) => {
      g.gain.setValueAtTime(0.6, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.04);
    });
  }

  private playRim(t: number): void {
    // Short triangular click
    this.startOsc("triangle", 800 * this.pitch, t, t + 0.03, (g, st) => {
      g.gain.setValueAtTime(0.5, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.03);
    });
  }

  private playRimshot(t: number): void {
    // Triangle body + noise snap
    this.startOsc("triangle", 500 * this.pitch, t, t + 0.06, (g, st) => {
      g.gain.setValueAtTime(0.6, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.06);
    });
    this.startNoise(0.04, t, (g, st) => {
      g.gain.setValueAtTime(0.5, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.04);
    });
  }

  private playBongo(t: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(400 * this.pitch, t);
    osc.frequency.exponentialRampToValueAtTime(280 * this.pitch, t + 0.04);

    const env = this.createStereoGain(0);
    env.gain.setValueAtTime(0.7, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(env);
    env.connect(this.outputNode);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  private playConga(t: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(300 * this.pitch, t);
    osc.frequency.exponentialRampToValueAtTime(180 * this.pitch, t + 0.06);

    const env = this.createStereoGain(0);
    env.gain.setValueAtTime(0.8, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(env);
    env.connect(this.outputNode);
    osc.start(t);
    osc.stop(t + 0.25);
  }
}
