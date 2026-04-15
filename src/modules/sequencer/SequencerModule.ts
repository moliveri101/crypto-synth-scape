import { AudioModule } from "../base/AudioModule";

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.1;
const ATTACK_TIME = 0.005;
const GATE_OPEN_RATIO = 0.75;

/**
 * 16-step gate sequencer with Web Audio scheduling.
 *
 * Architecture: inputNode -> gateGain -> outputNode
 * When stopped the gate is fully open (gain = 1) for pass-through.
 * When playing, the gate opens on active steps and closes on inactive ones.
 */
export class SequencerModule extends AudioModule {
  private gateGain: GainNode;
  private bpm = 120;
  private steps: boolean[] = new Array(16).fill(false);
  private volume = 1;
  private pitch = 0;

  private currentStep = 0;
  private nextStepTime = 0;
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private stepCallback: ((step: number) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);

    this.gateGain = this.createStereoGain(1); // open for pass-through when stopped
    this.configureStereo(this.gateGain);

    this.inputNode.connect(this.gateGain);
    this.gateGain.connect(this.outputNode);
  }

  // ── Step callback ────────────────────────────────────────────────────────

  setStepCallback(cb: ((step: number) => void) | null): void {
    this.stepCallback = cb;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  start(): void {
    if (this.isActive) return;
    this.isActive = true;

    this.currentStep = 0;
    this.nextStepTime = this.ctx.currentTime;

    // Close gate immediately — scheduler will open it on active steps
    this.gateGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.timerHandle = setInterval(() => this.schedule(), LOOKAHEAD_MS);
  }

  stop(): void {
    if (!this.isActive) return;
    this.isActive = false;

    if (this.timerHandle !== null) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }

    // Re-open gate for pass-through
    this.gateGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.gateGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.01);

    this.currentStep = 0;
  }

  setParameter(name: string, value: any): void {
    switch (name) {
      case "bpm":
        this.bpm = Math.max(1, value as number);
        break;

      case "steps":
        // Full array replacement
        if (Array.isArray(value)) {
          this.steps = value.map(Boolean);
        }
        break;

      case "step": {
        // Single step toggle: [index, active]
        const [index, active] = value as [number, boolean];
        if (index >= 0 && index < this.steps.length) {
          this.steps[index] = active;
        }
        break;
      }

      case "volume":
        this.volume = value as number;
        break;

      case "pitch":
        this.pitch = value as number;
        break;
    }
  }

  dispose(): void {
    if (this.timerHandle !== null) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
    this.stepCallback = null;
    try {
      this.gateGain.disconnect();
    } catch {
      // already disconnected
    }
    super.dispose();
  }

  // ── Web Audio scheduler ──────────────────────────────────────────────────

  private schedule(): void {
    const deadline = this.ctx.currentTime + SCHEDULE_AHEAD;

    while (this.nextStepTime < deadline) {
      this.scheduleStep(this.currentStep, this.nextStepTime);
      this.advanceStep();
    }
  }

  private scheduleStep(step: number, time: number): void {
    if (this.steps.length === 0) return;

    const stepDuration = this.getStepDuration();
    const isActive = this.steps[step % this.steps.length];

    if (isActive) {
      // Attack ramp: 0 -> volume over ATTACK_TIME
      this.gateGain.gain.setTargetAtTime(this.volume, time, ATTACK_TIME);

      // Hold gate open for 75% of the step, then close
      const gateOffTime = time + stepDuration * GATE_OPEN_RATIO;
      this.gateGain.gain.setTargetAtTime(0, gateOffTime, ATTACK_TIME);
    } else {
      // Inactive step: ensure gate is closed
      this.gateGain.gain.setTargetAtTime(0, time, ATTACK_TIME);
    }

    // Fire visual callback synced to step time
    if (this.stepCallback) {
      const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
      const cb = this.stepCallback;
      const s = step;
      setTimeout(() => cb(s), delayMs);
    }
  }

  private advanceStep(): void {
    const stepDuration = this.getStepDuration();
    this.nextStepTime += stepDuration;

    if (this.steps.length > 0) {
      this.currentStep = (this.currentStep + 1) % this.steps.length;
    }
  }

  /** Duration of a single 16th note in seconds based on current BPM. */
  private getStepDuration(): number {
    // 1 beat = 60/bpm seconds; 16th note = 1/4 beat
    return 60 / this.bpm / 4;
  }
}
