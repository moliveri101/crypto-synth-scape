import { AudioModule } from "../base/AudioModule";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VitalsSnapshot {
  heartRate: number;        // bpm
  hrv: number;              // ms (RMSSD)
  breathing: number;        // breaths per minute
  temperature: number;      // °C
  spo2: number;             // %
  stress: number;           // 0–100
  recovery: number;         // 0–100
  steps: number;            // running count
  calories: number;         // kcal today
}

export type ActivityLevel = "resting" | "light" | "moderate" | "vigorous";

// Targets for each activity level — what the body would settle at
const ACTIVITY_TARGETS: Record<ActivityLevel, Partial<VitalsSnapshot> & { activity: number }> = {
  resting:   { heartRate: 62,  hrv: 65, breathing: 13, temperature: 36.7, spo2: 98, stress: 20, recovery: 80, activity: 0.1 },
  light:     { heartRate: 95,  hrv: 50, breathing: 17, temperature: 37.0, spo2: 97, stress: 35, recovery: 70, activity: 0.35 },
  moderate:  { heartRate: 130, hrv: 35, breathing: 22, temperature: 37.4, spo2: 96, stress: 50, recovery: 55, activity: 0.65 },
  vigorous:  { heartRate: 165, hrv: 22, breathing: 28, temperature: 37.9, spo2: 95, stress: 70, recovery: 35, activity: 0.95 },
};

// ─── Constants ──────────────────────────────────────────────────────────────

const SIM_TICK_MS = 250;          // simulator runs 4×/sec
const PULSE_FREQ = 65;            // Hz of the heartbeat pulse
const PULSE_DURATION = 0.06;      // seconds

/**
 * Mock vitals streaming module — simulates a Hume Health–style wearable.
 *
 * - Generates believable health metrics (HR, HRV, breathing, temp, SpO2, etc.)
 *   based on a user-selected activity level
 * - Emits a short audio pulse on every simulated heartbeat (route to a drum
 *   voice input for literal biofeedback music)
 * - Exposes all metrics as normalized 0..1 fields via getDataOutput()
 */
export class VitalsModule extends AudioModule {
  private snapshot: VitalsSnapshot = {
    heartRate: 72, hrv: 55, breathing: 14, temperature: 36.8,
    spo2: 98, stress: 25, recovery: 75, steps: 0, calories: 0,
  };
  private activityLevel: ActivityLevel = "resting";
  private currentActivity = 0.1;

  private connected = false;
  private simHandle: ReturnType<typeof setInterval> | null = null;
  private nextBeatTime = 0;
  private lastBeatPerfTime = 0;
  private onSnapshotUpdate: ((s: VitalsSnapshot, activityValue: number) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    // Simulation runs as soon as the module exists — decoupled from audio
    // playback so the UI always shows live data and downstream consumers
    // (translators, drum machine) see continuous values without requiring Play.
    this.nextBeatTime = this.ctx.currentTime + 0.1;
    this.simHandle = setInterval(() => this.tick(), SIM_TICK_MS);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────
  // Play/Stop now only controls whether the heartbeat pulse sounds out loud.
  // Data simulation continues regardless.

  start(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.nextBeatTime = this.ctx.currentTime + 0.1;
  }

  stop(): void {
    if (!this.isActive) return;
    this.isActive = false;
  }

  setParameter(name: string, value: any): void {
    switch (name) {
      case "activityLevel":
        if (value === "resting" || value === "light" || value === "moderate" || value === "vigorous") {
          this.activityLevel = value;
        }
        break;
      case "connected":
        this.connected = Boolean(value);
        break;
    }
  }

  handleAction(action: string, _payload?: any): Record<string, any> | void {
    if (action === "triggerPulse") {
      this.emitHeartbeatPulse(0.7);
    }
  }

  // ── Simulator ──────────────────────────────────────────────────────────
  // Each tick:
  //   1. Drift each metric toward its activity-level target with small noise
  //   2. Schedule heartbeat pulses based on the current heart rate
  //   3. Increment step/calorie counters proportional to activity
  //   4. Notify the UI

  private tick(): void {
    const target = ACTIVITY_TARGETS[this.activityLevel];

    // Smooth approach (10% per tick) + small natural variability
    const drift = (current: number, goal: number, noise = 0) =>
      current + (goal - current) * 0.1 + (Math.random() - 0.5) * noise;

    this.snapshot.heartRate   = drift(this.snapshot.heartRate,   target.heartRate!,   2);
    this.snapshot.hrv         = drift(this.snapshot.hrv,         target.hrv!,         3);
    this.snapshot.breathing   = drift(this.snapshot.breathing,   target.breathing!,   1);
    this.snapshot.temperature = drift(this.snapshot.temperature, target.temperature!, 0.05);
    this.snapshot.spo2        = drift(this.snapshot.spo2,        target.spo2!,        0.3);
    this.snapshot.stress      = drift(this.snapshot.stress,      target.stress!,      2);
    this.snapshot.recovery    = drift(this.snapshot.recovery,    target.recovery!,    2);
    this.currentActivity      = drift(this.currentActivity,      target.activity,     0.02);

    // Steps / calories ramp with activity
    this.snapshot.steps    += Math.round(this.currentActivity * 30);
    this.snapshot.calories += this.currentActivity * 0.5;

    // Audio heartbeats only play when the module is "on"
    if (this.isActive) this.scheduleHeartbeats();

    this.onSnapshotUpdate?.(this.snapshot, this.currentActivity);
  }

  private scheduleHeartbeats(): void {
    if (!this.isActive) return;
    const ctx = this.ctx;
    if (ctx.state === "closed") return;

    const horizon = ctx.currentTime + 1.0;
    while (this.nextBeatTime < horizon) {
      // Velocity scaled by stress (more anxious = slightly stronger thumps)
      const vel = 0.35 + (this.snapshot.stress / 100) * 0.5;
      this.emitHeartbeatPulseAt(this.nextBeatTime, vel);

      // Inter-beat interval from current HR, with HRV adding jitter
      const baseInterval = 60 / Math.max(30, this.snapshot.heartRate);
      const jitter = (Math.random() - 0.5) * (this.snapshot.hrv / 1000);
      this.nextBeatTime += Math.max(0.2, baseInterval + jitter);
    }
  }

  private emitHeartbeatPulse(velocity: number): void {
    this.emitHeartbeatPulseAt(this.ctx.currentTime, velocity);
  }

  private emitHeartbeatPulseAt(time: number, velocity: number): void {
    const ctx = this.ctx;
    if (ctx.state === "closed") return;

    const osc = ctx.createOscillator();
    const env = this.createStereoGain(0);
    osc.type = "sine";
    osc.frequency.setValueAtTime(PULSE_FREQ, time);
    // Subtle pitch dip for the "lub" character
    osc.frequency.exponentialRampToValueAtTime(PULSE_FREQ * 0.6, time + PULSE_DURATION);

    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(velocity, time + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, time + PULSE_DURATION);

    osc.connect(env);
    env.connect(this.outputNode);
    osc.start(time);
    osc.stop(time + PULSE_DURATION + 0.02);

    this.lastBeatPerfTime = performance.now();
  }

  // ── Data output for downstream consumers ──────────────────────────────

  getDataOutput(): Record<string, number> {
    const s = this.snapshot;
    return {
      heart_rate:    Math.max(0, Math.min(1, (s.heartRate - 40) / 160)),     // 40..200 → 0..1
      hrv:           Math.max(0, Math.min(1, (s.hrv - 10) / 90)),            // 10..100 → 0..1
      breathing:     Math.max(0, Math.min(1, (s.breathing - 8) / 22)),       // 8..30 → 0..1
      temperature:   Math.max(0, Math.min(1, (s.temperature - 35) / 4)),     // 35..39°C → 0..1
      spo2:          Math.max(0, Math.min(1, (s.spo2 - 90) / 10)),           // 90..100% → 0..1
      stress:        Math.max(0, Math.min(1, s.stress / 100)),
      recovery:      Math.max(0, Math.min(1, s.recovery / 100)),
      activity:      this.currentActivity,
    };
  }

  // ── UI hooks ───────────────────────────────────────────────────────────

  setOnSnapshotUpdate(cb: ((s: VitalsSnapshot, activity: number) => void) | null): void {
    this.onSnapshotUpdate = cb;
  }

  getSnapshot(): VitalsSnapshot { return this.snapshot; }
  getActivityValue(): number { return this.currentActivity; }
  isConnected(): boolean { return this.connected; }

  // ── Cleanup ───────────────────────────────────────────────────────────

  dispose(): void {
    this.stop();
    // Shut down the simulator — it's now module-lifetime, not playback-bound
    if (this.simHandle !== null) {
      clearInterval(this.simHandle);
      this.simHandle = null;
    }
    this.onSnapshotUpdate = null;
    super.dispose();
  }
}
