import { AudioModule } from "../base/AudioModule";
import { supabase } from "@/integrations/supabase/client";

export interface SatelliteData {
  name: string;
  id: number;
  altitude: number;
  latitude: number;
  longitude: number;
  timestamp: number;
}

const FREQ_RAMP_TIME = 0.05;

export class SatelliteModule extends AudioModule {
  private oscL: OscillatorNode | null = null;
  private oscR: OscillatorNode | null = null;
  private merger: ChannelMergerNode | null = null;
  private masterGain: GainNode;

  private satellite: SatelliteData | null = null;
  private prevLatitude: number = 0;
  private prevLongitude: number = 0;
  private prevAltitude: number = 0;

  private updateInterval: number | null = null;
  private pulseInterval: number = 600; // ms per pulse (default ~100 BPM)
  private pulseTimeoutId: number | null = null;

  private onDataUpdate:
    | ((data: { speed: number; altitude: number; latitude: number; longitude: number }) => void)
    | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);

    if (ctx.state === "closed") {
      throw new Error("Cannot create SatelliteModule with closed AudioContext");
    }

    this.masterGain = this.createStereoGain(0.5);
    this.masterGain.connect(this.outputNode);
  }

  // ── Satellite data ────────────────────────────────────────────────────────

  setSatellite(satellite: SatelliteData): void {
    this.satellite = satellite;
    this.prevLatitude = satellite.latitude;
    this.prevLongitude = satellite.longitude;
    this.prevAltitude = satellite.altitude;

    // Start auto-polling as soon as we have a satellite assigned.
    // Data fetching is decoupled from audio start — the UI should show
    // live position even when audio isn't playing.
    this.startAutoPolling();
  }

  private startAutoPolling(): void {
    // Always (re)kick off initial fetch so UI populates immediately
    this.fetchAndUpdate();
    if (this.updateInterval == null) {
      this.updateInterval = window.setInterval(() => {
        if (this.satellite) this.fetchAndUpdate();
      }, 60_000);
    }
  }

  setDataUpdateCallback(
    callback: ((data: { speed: number; altitude: number; latitude: number; longitude: number }) => void) | null,
  ): void {
    this.onDataUpdate = callback;
  }

  updateFromSatellite(satellite: SatelliteData): void {
    // Speed from position delta (approximate km/s) — compute even if audio isn't running,
    // so the UI shows live numbers as soon as fetches arrive.
    const latDiff = Math.abs(satellite.latitude - this.prevLatitude);
    const lonDiff = Math.abs(satellite.longitude - this.prevLongitude);
    const altDiff = Math.abs(satellite.altitude - this.prevAltitude);
    const speed = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff + altDiff * altDiff);

    // Audio updates — only apply when oscillators exist AND module is active
    if (this.oscL && this.oscR && this.isActive) {
      const bpm = Math.max(30, Math.min(120, 30 + speed * 9));
      this.pulseInterval = (60 / bpm) * 1000;

      const freq = Math.max(1, Math.min(800, Math.max(200, satellite.altitude)));
      const t = this.ctx.currentTime + FREQ_RAMP_TIME;
      this.oscL.frequency.exponentialRampToValueAtTime(freq, t);
      this.oscR.frequency.exponentialRampToValueAtTime(freq, t);
    }

    // Store for next delta
    this.prevLatitude = satellite.latitude;
    this.prevLongitude = satellite.longitude;
    this.prevAltitude = satellite.altitude;

    // Notify UI — always, regardless of audio state
    if (this.onDataUpdate) {
      this.onDataUpdate({
        speed,
        altitude: satellite.altitude,
        latitude: satellite.latitude,
        longitude: satellite.longitude,
      });
    }
  }

  // ── Pulse scheduling ──────────────────────────────────────────────────────

  private schedulePulse(): void {
    if (!this.isActive || !this.oscL) return;

    const now = this.ctx.currentTime;
    const attackTime = 0.01;
    const decayTime = 0.09;
    const pulseDuration = attackTime + decayTime;

    const volumeBase = Math.max(0.1, (Math.abs(this.satellite?.longitude || 0) + 180) / 360);

    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(0.1, now);
    this.masterGain.gain.linearRampToValueAtTime(volumeBase, now + attackTime);
    this.masterGain.gain.linearRampToValueAtTime(0.1, now + pulseDuration);

    this.pulseTimeoutId = window.setTimeout(() => {
      this.schedulePulse();
    }, this.pulseInterval);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.isActive) return;

    if (this.ctx.state === "closed") {
      console.error("SatelliteModule: Cannot start with closed AudioContext");
      return;
    }

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    const freq = 440;

    // Two oscillators with slight detuning for stereo width
    this.oscL = this.ctx.createOscillator();
    this.oscR = this.ctx.createOscillator();
    this.oscL.type = "sine";
    this.oscR.type = "sine";
    this.oscL.frequency.value = freq;
    this.oscR.frequency.value = freq;
    this.oscL.detune.value = -2;
    this.oscR.detune.value = 2;

    // Merge into true stereo (ChannelMergerNode has fixed channelCount — do NOT configureStereo)
    this.merger = this.ctx.createChannelMerger(2);
    this.oscL.connect(this.merger, 0, 0);
    this.oscR.connect(this.merger, 0, 1);
    this.merger.connect(this.masterGain);

    this.oscL.start();
    this.oscR.start();
    this.isActive = true;

    // Start pulse envelope (polling is handled by startAutoPolling on setSatellite)
    this.schedulePulse();
    // Ensure polling is active even if start() is called before setSatellite
    if (this.satellite && this.updateInterval == null) this.startAutoPolling();
  }

  stop(): void {
    if (!this.isActive) return;

    if (this.pulseTimeoutId != null) {
      clearTimeout(this.pulseTimeoutId);
      this.pulseTimeoutId = null;
    }

    // Note: updateInterval is NOT cleared here — polling continues so the UI
    // keeps showing live data even when audio playback is stopped.
    // It's only cleared in dispose().

    try {
      this.oscL?.stop();
      this.oscR?.stop();
    } catch {
      // already stopped
    }
    this.oscL?.disconnect();
    this.oscR?.disconnect();
    this.merger?.disconnect();
    this.oscL = null;
    this.oscR = null;
    this.merger = null;

    this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.rampGain(this.masterGain.gain, 0.5);
    this.isActive = false;
  }

  // ── Parameters ────────────────────────────────────────────────────────────

  setParameter(name: string, value: any): void {
    switch (name) {
      case "volume":
        this.rampGain(this.masterGain.gain, value);
        break;
      case "waveform":
        if (this.oscL) this.oscL.type = value as OscillatorType;
        if (this.oscR) this.oscR.type = value as OscillatorType;
        break;
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  handleAction(action: string, payload?: any): Record<string, any> | void {
    switch (action) {
      case "setSatellite":
        if (payload) this.setSatellite(payload as SatelliteData);
        break;
      case "setDataUpdateCallback":
        this.setDataUpdateCallback(payload ?? null);
        break;
    }
  }

  // ── Data output for downstream consumers (translators, drum machine) ──

  getDataOutput(): Record<string, number> | null {
    if (!this.satellite) return null;
    const s = this.satellite;

    // Approximate speed from deltas stored by updateFromSatellite
    const latDiff = Math.abs(s.latitude - this.prevLatitude);
    const lonDiff = Math.abs(s.longitude - this.prevLongitude);
    const altDiff = Math.abs(s.altitude - this.prevAltitude);
    const speed = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff + altDiff * altDiff);

    return {
      // altitude: LEO sats ~200-2000km, MEO ~20000km, GEO ~36000km
      altitude: Math.max(0, Math.min(1, s.altitude / 2000)),
      // altitude (alt scale for very high orbits)
      altitude_high: Math.max(0, Math.min(1, s.altitude / 40000)),
      // latitude normalized: -90..90 → 0..1
      latitude: Math.max(0, Math.min(1, (s.latitude + 90) / 180)),
      // |latitude| normalized: equator=0, pole=1
      latitude_abs: Math.max(0, Math.min(1, Math.abs(s.latitude) / 90)),
      // longitude normalized: -180..180 → 0..1
      longitude: Math.max(0, Math.min(1, (s.longitude + 180) / 360)),
      // speed/motion normalized (rough, typical LEO velocity is ~7.5 km/s)
      speed: Math.max(0, Math.min(1, speed / 10)),
    };
  }

  // ── Data fetch ────────────────────────────────────────────────────────────

  private async fetchAndUpdate(): Promise<void> {
    if (!this.satellite) return;

    try {
      const { data, error } = await supabase.functions.invoke("fetch-satellite-data", {
        body: { satelliteId: this.satellite.id },
      });

      if (error) {
        console.error("SatelliteModule: API error:", error);
        return;
      }

      if (data) {
        this.updateFromSatellite(data);
      }
    } catch (err) {
      console.error("SatelliteModule: fetch failed:", err);
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  dispose(): void {
    this.stop();

    // Clear callback reference
    this.onDataUpdate = null;

    // Defensive: clear any lingering timers (stop() should have done this)
    if (this.updateInterval != null) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    if (this.pulseTimeoutId != null) {
      clearTimeout(this.pulseTimeoutId);
      this.pulseTimeoutId = null;
    }

    this.masterGain.disconnect();
    super.dispose();
  }
}
