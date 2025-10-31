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

    // Map speed to rhythm (BPM equivalent) - typical satellite speed 7-8 km/s
    // Scale speed (0-10 km/s) to BPM (60-180)
    const bpm = Math.max(60, Math.min(180, 60 + speed * 12));
    const pulseInterval = (60 / bpm) * 1000; // ms per beat

    // Map altitude to frequency (Hz) - ISS altitude ~400km
    // Scale altitude (200-600 km) to frequency (200-800 Hz)
    const frequency = Math.max(200, Math.min(800, 200 + satellite.altitude * 1.5));
    this.oscillator.frequency.setValueAtTime(frequency, this.ctx.currentTime);

    // Map latitude to pitch variation (vibrato/modulation)
    // Latitude ranges from -90 to 90
    const pitchModDepth = Math.abs(satellite.latitude) / 90; // 0 to 1
    const pitchMod = Math.sin(this.ctx.currentTime * 5) * pitchModDepth * 20;
    this.oscillator.frequency.exponentialRampToValueAtTime(
      frequency + pitchMod,
      this.ctx.currentTime + 0.1
    );

    // Map longitude to volume variation
    // Longitude ranges from -180 to 180
    const volumeBase = 0.3 + (Math.abs(satellite.longitude) / 180) * 0.5; // 0.3 to 0.8
    const volumeMod = Math.sin(this.ctx.currentTime * 2) * 0.1;
    this.gainNode.gain.setValueAtTime(
      Math.max(0.1, Math.min(0.9, volumeBase + volumeMod)),
      this.ctx.currentTime
    );

    // Store for next update
    this.prevLatitude = satellite.latitude;
    this.prevLongitude = satellite.longitude;
    this.prevAltitude = satellite.altitude;

    console.log('Satellite audio params:', { speed, frequency, bpm, pitchModDepth, volumeBase });
  }

  start() {
    if (this.isActive) return;

    this.oscillator = this.ctx.createOscillator();
    this.oscillator.type = "sine";
    this.oscillator.frequency.value = 440;
    this.oscillator.connect(this.gainNode);
    this.oscillator.start();
    this.isActive = true;

    // Start updating from satellite data every 2 seconds
    this.updateInterval = window.setInterval(() => {
      if (this.satellite) {
        this.fetchAndUpdate();
      }
    }, 2000);
  }

  stop() {
    if (!this.isActive) return;

    if (this.oscillator) {
      this.oscillator.stop();
      this.oscillator.disconnect();
      this.oscillator = null;
    }

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

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
    super.dispose();
  }
}
