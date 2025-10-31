import { AudioModule } from "../AudioModule";
import { SatelliteData } from "@/types/modules";

export class SatelliteModule extends AudioModule {
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode;
  private satellite: SatelliteData | null = null;
  private prevLatitude: number = 0;
  private prevLongitude: number = 0;
  private prevAltitude: number = 0;
  private updateInterval: number | null = null;
  private pulseInterval: number = 600; // ms per pulse (default 100 BPM)
  private pulseTimeoutId: number | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0.5;
    this.outputNode = this.gainNode;
  }

  setSatellite(satellite: SatelliteData) {
    this.satellite = satellite;
    this.prevLatitude = satellite.latitude;
    this.prevLongitude = satellite.longitude;
    this.prevAltitude = satellite.altitude;
  }

  updateFromSatellite(satellite: SatelliteData) {
    if (!this.oscillator || !this.isActive) return;

    // Calculate speed from position changes (in km/s approximation)
    const latDiff = Math.abs(satellite.latitude - this.prevLatitude);
    const lonDiff = Math.abs(satellite.longitude - this.prevLongitude);
    const altDiff = Math.abs(satellite.altitude - this.prevAltitude);
    const speed = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff + altDiff * altDiff);

    // Map speed to pulse rate (BPM) - typical satellite speed 7-8 km/s
    // Scale speed (0-10 km/s) to BPM (30-120) for audible, countable pulses
    const bpm = Math.max(30, Math.min(120, 30 + speed * 9));
    this.pulseInterval = (60 / bpm) * 1000; // ms per beat

    // Map altitude directly to frequency (Hz) - ISS altitude ~400km
    const frequency = Math.max(200, Math.min(800, satellite.altitude));
    this.oscillator.frequency.setValueAtTime(frequency, this.ctx.currentTime);

    // Map latitude to subtle pitch variation (vibrato/modulation)
    const pitchModDepth = Math.abs(satellite.latitude) / 90; // 0 to 1

    // Map longitude to base volume - direct mapping with minimum
    const volumeBase = Math.max(0.1, (Math.abs(satellite.longitude) + 180) / 360);

    // Store for next update
    this.prevLatitude = satellite.latitude;
    this.prevLongitude = satellite.longitude;
    this.prevAltitude = satellite.altitude;

    console.log('Satellite audio params:', { speed, frequency, bpm, pulseInterval: this.pulseInterval, pitchModDepth, volumeBase });
  }

  private schedulePulse() {
    if (!this.isActive || !this.oscillator) return;

    const now = this.ctx.currentTime;
    const attackTime = 0.01; // 10ms attack
    const decayTime = 0.09; // 90ms decay
    const pulseDuration = attackTime + decayTime; // 100ms total

    // Get current base volume from longitude
    const volumeBase = Math.max(0.1, (Math.abs(this.satellite?.longitude || 0) + 180) / 360);

    // Create pulse envelope
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(0.1, now);
    this.gainNode.gain.linearRampToValueAtTime(volumeBase, now + attackTime);
    this.gainNode.gain.linearRampToValueAtTime(0.1, now + pulseDuration);

    // Schedule next pulse
    this.pulseTimeoutId = window.setTimeout(() => {
      this.schedulePulse();
    }, this.pulseInterval);
  }

  start() {
    if (this.isActive) return;

    this.oscillator = this.ctx.createOscillator();
    this.oscillator.type = "sine";
    this.oscillator.frequency.value = 440;
    this.oscillator.connect(this.gainNode);
    this.oscillator.start();
    this.isActive = true;

    // Start pulse scheduling
    this.schedulePulse();

    // Start updating from satellite data every 2 seconds
    this.updateInterval = window.setInterval(() => {
      if (this.satellite) {
        this.fetchAndUpdate();
      }
    }, 2000);
  }

  stop() {
    if (!this.isActive) return;

    if (this.pulseTimeoutId) {
      clearTimeout(this.pulseTimeoutId);
      this.pulseTimeoutId = null;
    }

    if (this.oscillator) {
      this.oscillator.stop();
      this.oscillator.disconnect();
      this.oscillator = null;
    }

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    this.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
    this.gainNode.gain.setValueAtTime(0.5, this.ctx.currentTime);
    this.isActive = false;
  }

  private async fetchAndUpdate() {
    if (!this.satellite) return;

    try {
      const response = await fetch(
        `https://tmrygmhnzxploeytuacn.supabase.co/functions/v1/fetch-satellite-data`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ satelliteId: this.satellite.id })
        }
      );

      if (response.ok) {
        const data = await response.json();
        this.updateFromSatellite(data);
      }
    } catch (error) {
      console.error('Failed to fetch satellite data:', error);
    }
  }

  setParameter(name: string, value: any) {
    switch (name) {
      case "volume":
        this.gainNode.gain.setValueAtTime(value, this.ctx.currentTime);
        break;
      case "waveform":
        if (this.oscillator) {
          this.oscillator.type = value;
        }
        break;
    }
  }

  dispose() {
    this.stop();
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    if (this.pulseTimeoutId) {
      clearTimeout(this.pulseTimeoutId);
    }
    super.dispose();
  }
}
