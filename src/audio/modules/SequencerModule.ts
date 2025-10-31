import { AudioModule } from "../AudioModule";

export class SequencerModule extends AudioModule {
  private bpm: number = 120;
  private steps: boolean[] = [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false];
  private currentStep: number = 0;
  private intervalId: number | null = null;
  private gateGain: GainNode;
  private volume: number = 0.8;
  private pitch: number = 0;
  private onStepCallback?: (step: number, isActive: boolean) => void;
  private nextStepTime: number = 0;
  private lookahead: number = 25.0; // ms
  private scheduleAheadTime: number = 0.1; // sec
  private timerID: number | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    
    // Create input and output for pass-through
    this.inputNode = ctx.createGain();
    this.gateGain = ctx.createGain();
    this.gateGain.gain.value = 1; // Pass-through when stopped
    this.outputNode = this.gateGain;
    
    // Connect input to gate
    this.inputNode.connect(this.gateGain);
  }

  private scheduler() {
    // Schedule notes up to current time + scheduleAheadTime
    while (this.nextStepTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleStep(this.currentStep, this.nextStepTime);
      this.nextStep();
    }
  }

  private scheduleStep(stepNumber: number, time: number) {
    const stepActive = this.steps[stepNumber];
    const attackTime = 0.005; // 5ms attack
    const stepDuration = (60.0 / this.bpm) / 4; // 16th note duration
    const gateDuration = stepDuration * 0.75; // Gate open for 75% of step
    
    if (stepActive) {
      // Schedule gate opening with smooth attack
      this.gateGain.gain.cancelScheduledValues(time);
      this.gateGain.gain.setValueAtTime(0, time);
      this.gateGain.gain.linearRampToValueAtTime(this.volume, time + attackTime);
      // Schedule gate closing with smooth release
      this.gateGain.gain.linearRampToValueAtTime(0, time + gateDuration);
      
      // Notify UI on the next animation frame
      if (this.onStepCallback) {
        setTimeout(() => {
          this.onStepCallback?.(stepNumber, true);
        }, (time - this.ctx.currentTime) * 1000);
      }
    } else {
      // Ensure gate is closed
      this.gateGain.gain.setValueAtTime(0, time);
    }
  }

  private nextStep() {
    const stepDuration = (60.0 / this.bpm) / 4; // 16th note
    this.nextStepTime += stepDuration;
    this.currentStep = (this.currentStep + 1) % this.steps.length;
  }

  start() {
    if (this.isActive) return;
    
    this.isActive = true;
    this.currentStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.005; // Start slightly in the future
    this.gateGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.gateGain.gain.value = 0;
    
    // Start the scheduler
    this.timerID = window.setInterval(() => this.scheduler(), this.lookahead);
  }

  stop() {
    if (!this.isActive) return;
    
    if (this.timerID !== null) {
      clearInterval(this.timerID);
      this.timerID = null;
    }
    
    this.gateGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.gateGain.gain.setValueAtTime(1, this.ctx.currentTime); // Re-open gate for pass-through
    this.currentStep = 0;
    this.isActive = false;
  }

  setParameter(name: string, value: any) {
    switch (name) {
      case "bpm":
        this.bpm = value;
        // No need to restart, scheduler will pick up new BPM naturally
        break;
      case "steps":
        this.steps = value;
        break;
      case "step": {
        const [index, active] = value as [number, boolean];
        if (index >= 0 && index < this.steps.length) {
          this.steps[index] = active;
        }
        break;
      }
      case "volume":
        this.volume = value;
        break;
      case "pitch":
        this.pitch = value;
        break;
    }
  }

  setStepCallback(callback: (step: number, isActive: boolean) => void) {
    this.onStepCallback = callback;
  }

  getCurrentStep(): number {
    return this.currentStep;
  }

  getSteps(): boolean[] {
    return [...this.steps];
  }

  getVolume(): number {
    return this.volume;
  }

  getPitch(): number {
    return this.pitch;
  }

  dispose() {
    this.stop();
    super.dispose();
  }
}
