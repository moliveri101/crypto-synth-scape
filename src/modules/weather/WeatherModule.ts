import { AudioModule } from "../base/AudioModule";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WeatherSnapshot {
  temperature: number;     // °C
  humidity: number;        // %
  windSpeed: number;       // m/s
  windDirection: number;   // degrees
  pressure: number;        // hPa
  cloudCover: number;      // %
  precipitation: number;   // mm
  fetchedAt: number;       // epoch ms
}

export interface Location {
  name: string;
  latitude: number;
  longitude: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const POLL_MS = 5 * 60 * 1000; // 5 minutes
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

/**
 * Open-Meteo weather poller.
 *
 * - No API key required
 * - Polls every 5 minutes
 * - Exposes normalized data fields via getDataOutput()
 * - Optionally emits a subtle drone: sine oscillator whose frequency is
 *   driven by temperature, amplitude by humidity, and vibrato by wind speed.
 *   The drone is disabled by default so the module is a pure data source
 *   unless you explicitly turn audio on.
 */
export class WeatherModule extends AudioModule {
  private location: Location = { name: "London", latitude: 51.5074, longitude: -0.1278 };
  private snapshot: WeatherSnapshot | null = null;
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private audioEnabled = false;
  private onSnapshotUpdate: ((s: WeatherSnapshot, loc: Location) => void) | null = null;

  // Drone nodes (created lazily)
  private osc: OscillatorNode | null = null;
  private oscGain: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    // Poll immediately and on interval — decoupled from audio playback,
    // so the UI always shows live values and downstream consumers receive
    // data whether or not the drone is turned on.
    this.fetchWeather();
    this.pollHandle = setInterval(() => this.fetchWeather(), POLL_MS);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────
  // Play/Stop now only controls the optional drone audio. Data polling
  // continues for the module's entire lifetime.

  start(): void {
    if (this.isActive) return;
    this.isActive = true;
    if (this.audioEnabled) this.startDrone();
  }

  stop(): void {
    if (!this.isActive) return;
    this.isActive = false;
    this.stopDrone();
  }

  setParameter(name: string, value: any): void {
    switch (name) {
      case "location":
        // value: { name, latitude, longitude }
        if (value && typeof value.latitude === "number" && typeof value.longitude === "number") {
          this.location = {
            name: String(value.name ?? "Custom"),
            latitude: value.latitude,
            longitude: value.longitude,
          };
          if (this.isActive) this.fetchWeather();
        }
        break;
      case "audioEnabled": {
        const enabled = Boolean(value);
        if (enabled !== this.audioEnabled) {
          this.audioEnabled = enabled;
          if (this.isActive) {
            if (enabled) this.startDrone();
            else this.stopDrone();
          }
        }
        break;
      }
    }
  }

  // ── Weather polling ────────────────────────────────────────────────────

  private async fetchWeather(): Promise<void> {
    try {
      const url =
        `${FORECAST_URL}?latitude=${this.location.latitude}&longitude=${this.location.longitude}` +
        `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,pressure_msl,cloud_cover,precipitation`;
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) return;
      const json: any = await resp.json();
      const c = json.current;
      if (!c) return;

      this.snapshot = {
        temperature: c.temperature_2m ?? 15,
        humidity: c.relative_humidity_2m ?? 50,
        windSpeed: c.wind_speed_10m ?? 0,
        windDirection: c.wind_direction_10m ?? 0,
        pressure: c.pressure_msl ?? 1013,
        cloudCover: c.cloud_cover ?? 0,
        precipitation: c.precipitation ?? 0,
        fetchedAt: Date.now(),
      };

      this.updateDrone();
      this.onSnapshotUpdate?.(this.snapshot, this.location);
    } catch {
      // network error — retry on next tick
    }
  }

  // ── Drone audio (optional) ─────────────────────────────────────────────

  private startDrone(): void {
    if (this.osc) return; // already running
    const ctx = this.ctx;
    const now = ctx.currentTime;

    this.osc = ctx.createOscillator();
    this.osc.type = "sine";
    this.oscGain = this.createStereoGain(0);

    // Vibrato LFO modulating the main oscillator frequency
    this.lfo = ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 4; // 4 Hz vibrato base
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0;

    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.osc.frequency);
    this.osc.connect(this.oscGain);
    this.oscGain.connect(this.outputNode);

    this.osc.start(now);
    this.lfo.start(now);

    this.updateDrone();
    // Fade in
    this.oscGain.gain.setValueAtTime(0, now);
    this.oscGain.gain.linearRampToValueAtTime(1, now + 0.5);
  }

  private stopDrone(): void {
    if (!this.osc) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Quick fade to avoid clicks
    if (this.oscGain) {
      this.oscGain.gain.cancelScheduledValues(now);
      this.oscGain.gain.setValueAtTime(this.oscGain.gain.value, now);
      this.oscGain.gain.linearRampToValueAtTime(0, now + 0.2);
    }

    const osc = this.osc;
    const lfo = this.lfo;
    const oscGain = this.oscGain;
    const lfoGain = this.lfoGain;

    setTimeout(() => {
      try { osc?.stop(); osc?.disconnect(); } catch { /* ok */ }
      try { lfo?.stop(); lfo?.disconnect(); } catch { /* ok */ }
      try { oscGain?.disconnect(); } catch { /* ok */ }
      try { lfoGain?.disconnect(); } catch { /* ok */ }
    }, 250);

    this.osc = null;
    this.lfo = null;
    this.oscGain = null;
    this.lfoGain = null;
  }

  private updateDrone(): void {
    if (!this.osc || !this.oscGain || !this.lfo || !this.lfoGain || !this.snapshot) return;
    const now = this.ctx.currentTime;

    // Temperature → pitch: -20°C → 80 Hz, +40°C → 400 Hz
    const t = Math.max(-30, Math.min(50, this.snapshot.temperature));
    const freq = 80 + ((t + 20) / 60) * 320;
    this.osc.frequency.setTargetAtTime(Math.max(20, freq), now, 2);

    // Humidity → amplitude: 0% → 0.1, 100% → 0.25 (kept subtle)
    const amp = 0.1 + (Math.min(100, Math.max(0, this.snapshot.humidity)) / 100) * 0.15;
    this.oscGain.gain.setTargetAtTime(amp, now, 2);

    // Wind speed → vibrato depth: 0 m/s → 0 Hz, 20 m/s → 8 Hz
    const wind = Math.min(30, Math.max(0, this.snapshot.windSpeed));
    const vibratoDepth = (wind / 20) * 8;
    this.lfoGain.gain.setTargetAtTime(vibratoDepth, now, 2);

    // Pressure → vibrato rate: 950 hPa → 1 Hz, 1050 hPa → 6 Hz
    const p = Math.min(1050, Math.max(950, this.snapshot.pressure));
    const lfoRate = 1 + ((p - 950) / 100) * 5;
    this.lfo.frequency.setTargetAtTime(lfoRate, now, 2);
  }

  // ── Data output for downstream consumers ──────────────────────────────

  getDataOutput(): Record<string, number> | null {
    if (!this.snapshot) return null;
    const s = this.snapshot;
    return {
      temperature: Math.max(0, Math.min(1, (s.temperature + 30) / 80)), // -30..+50°C → 0..1
      humidity: Math.max(0, Math.min(1, s.humidity / 100)),
      wind: Math.max(0, Math.min(1, s.windSpeed / 30)),                   // 0..30 m/s
      pressure: Math.max(0, Math.min(1, (s.pressure - 950) / 100)),       // 950..1050 hPa
      clouds: Math.max(0, Math.min(1, s.cloudCover / 100)),
      precipitation: Math.max(0, Math.min(1, s.precipitation / 20)),      // 0..20mm
    };
  }

  // ── UI hooks ───────────────────────────────────────────────────────────

  setOnSnapshotUpdate(cb: ((s: WeatherSnapshot, loc: Location) => void) | null): void {
    this.onSnapshotUpdate = cb;
  }

  getSnapshot(): WeatherSnapshot | null { return this.snapshot; }
  getLocation(): Location { return this.location; }

  // ── Cleanup ───────────────────────────────────────────────────────────

  dispose(): void {
    this.stop();
    // Shut down the polling — it's module-lifetime, not playback-bound
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    this.onSnapshotUpdate = null;
    super.dispose();
  }
}
