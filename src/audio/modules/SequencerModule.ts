import { AudioModule } from "../AudioModule";

export class SequencerModule extends AudioModule {
  private bpm: number = 120;
  private steps: boolean[] = Array(16).fill(false);
  private currentStep: number = 0;
  private intervalId: number | null = null;
  private gateGain: GainNode;
  private volume: number = 0.8;
  private pitch: number = 0;
  private onStepCallback?: (step: number, isActive: boolean) => void;

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

  start() {
    if (this.isActive) return;
    
    this.isActive = true;
    this.currentStep = 0;
    this.gateGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.gateGain.gain.value = 0; // Close gate when starting
    
    const intervalTime = (60000 / this.bpm) / 4; // 16th note timing
    const attackTime = 0.005; // 5ms attack to avoid clicks
    const gateLength = intervalTime * 0.8; // Gate open for 80% of step duration
    
    this.intervalId = window.setInterval(() => {
      const stepActive = this.steps[this.currentStep];
      const now = this.ctx.currentTime;
      
      // Control gate with smooth ramping
      if (stepActive) {
        // Smooth attack
        this.gateGain.gain.cancelScheduledValues(now);
        this.gateGain.gain.setValueAtTime(this.gateGain.gain.value, now);
        this.gateGain.gain.linearRampToValueAtTime(this.volume, now + attackTime);
        // Smooth release before next step
        this.gateGain.gain.linearRampToValueAtTime(0, now + gateLength / 1000);
        
        if (this.onStepCallback) {
          this.onStepCallback(this.currentStep, true);
        }
      } else {
        // Ensure gate is closed
        this.gateGain.gain.cancelScheduledValues(now);
        this.gateGain.gain.setValueAtTime(0, now);
      }
      
      // Advance to next step
      this.currentStep = (this.currentStep + 1) % this.steps.length;
    }, intervalTime);
  }

  stop() {
    if (!this.isActive) return;
    
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.gateGain.gain.value = 1; // Re-open gate for pass-through
    this.currentStep = 0;
    this.isActive = false;
  }

  setParameter(name: string, value: any) {
    switch (name) {
      case "bpm":
        this.bpm = value;
        if (this.isActive) {
          // Restart with new BPM
          this.stop();
          this.start();
        }
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
