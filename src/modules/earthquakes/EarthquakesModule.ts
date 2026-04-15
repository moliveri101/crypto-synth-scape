import { AudioModule } from "../base/AudioModule";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Quake {
  id: string;
  magnitude: number;
  depth: number; // km
  place: string;
  time: number; // epoch ms
  latitude: number;
  longitude: number;
}

export type FeedWindow = "hour" | "day" | "week";

// ─── Constants ──────────────────────────────────────────────────────────────

const FEED_URL: Record<FeedWindow, string> = {
  hour: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
  day: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
  week: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson",
};

const POLL_MS = 60_000; // poll USGS every 60s

/**
 * Polls the USGS earthquake feed, tracks new quakes, and emits audio pulses
 * (sine bursts at ~60 Hz) whose amplitude and duration scale with magnitude.
 *
 * The pulse output connects downstream like any audio source — plug it into
 * a Data Drum Machine voice input to have each new earthquake trigger that drum.
 *
 * Also exposes `getDataOutput()` with normalized fields for data consumers.
 */
export class EarthquakesModule extends AudioModule {
  private window: FeedWindow = "hour";
  private minMagnitude = 2.5;
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private seenIds: Set<string> = new Set();
  private recentQuakes: Quake[] = []; // newest first
  private onQuakesUpdate: ((quakes: Quake[]) => void) | null = null;

  // Running stats used by getDataOutput()
  private latestMagnitude = 0;
  private latestDepth = 0;
  private energySum = 0; // sum of recent magnitudes (decays)

  constructor(ctx: AudioContext) {
    super(ctx);
    // outputNode already configured stereo by the base class
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  start(): void {
    if (this.isActive) return;
    this.isActive = true;

    // Prime-fetch immediately, then poll
    this.fetchFeed();
    this.pollHandle = setInterval(() => this.fetchFeed(), POLL_MS);
  }

  stop(): void {
    if (!this.isActive) return;
    this.isActive = false;
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  setParameter(name: string, value: any): void {
    switch (name) {
      case "window":
        if (value === "hour" || value === "day" || value === "week") {
          this.window = value;
          this.seenIds.clear();
          this.recentQuakes = [];
          if (this.isActive) this.fetchFeed();
        }
        break;
      case "minMagnitude":
        this.minMagnitude = Math.max(0, Math.min(10, Number(value)));
        break;
    }
  }

  handleAction(action: string, _payload?: any): Record<string, any> | void {
    if (action === "triggerPulse") {
      // Manual test pulse
      this.emitPulse(4.5);
    }
  }

  // ── Feed polling ───────────────────────────────────────────────────────

  private async fetchFeed(): Promise<void> {
    try {
      const resp = await fetch(FEED_URL[this.window], { cache: "no-store" });
      if (!resp.ok) return;
      const json: any = await resp.json();
      if (!Array.isArray(json.features)) return;

      const quakes: Quake[] = json.features
        .map((f: any) => ({
          id: f.id,
          magnitude: f.properties?.mag ?? 0,
          depth: f.geometry?.coordinates?.[2] ?? 0,
          place: f.properties?.place ?? "Unknown",
          time: f.properties?.time ?? Date.now(),
          latitude: f.geometry?.coordinates?.[1] ?? 0,
          longitude: f.geometry?.coordinates?.[0] ?? 0,
        }))
        .filter((q: Quake) => q.magnitude >= this.minMagnitude);

      // Detect newly-arrived quakes (not in seenIds yet)
      const newQuakes: Quake[] = [];
      for (const q of quakes) {
        if (!this.seenIds.has(q.id)) {
          newQuakes.push(q);
          this.seenIds.add(q.id);
        }
      }

      // Keep the recent list sorted newest-first, capped at 50
      this.recentQuakes = quakes
        .slice()
        .sort((a, b) => b.time - a.time)
        .slice(0, 50);

      if (this.recentQuakes.length > 0) {
        this.latestMagnitude = this.recentQuakes[0].magnitude;
        this.latestDepth = this.recentQuakes[0].depth;
      }
      // Exponential-ish decay on energy
      this.energySum = this.energySum * 0.7 + newQuakes.reduce((s, q) => s + q.magnitude, 0);

      // Emit one pulse per NEW quake (skip initial hydration to avoid flooding)
      const isInitialHydration = this.seenIds.size === quakes.length && this.recentQuakes.length > 5;
      if (!isInitialHydration) {
        for (const q of newQuakes) {
          this.emitPulse(q.magnitude);
        }
      }

      this.onQuakesUpdate?.(this.recentQuakes);
    } catch {
      // network error — ignore, retry next tick
    }
  }

  // ── Audio pulse generator ─────────────────────────────────────────────
  // A short sine burst whose amplitude and duration scale with magnitude.
  // This is the signal you route to a Data Drum Machine voice input.
  private emitPulse(magnitude: number): void {
    const ctx = this.ctx;
    if (ctx.state === "closed") return;

    // Map magnitude 0–10 → pitch 40–180 Hz, duration 0.05–0.6s, amplitude 0.2–1.0
    const mag = Math.max(0, Math.min(10, magnitude));
    const norm = mag / 10;
    const freq = 40 + norm * 140;
    const duration = 0.05 + norm * 0.55;
    const peak = 0.2 + norm * 0.8;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = this.createStereoGain(0);
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    // Slight pitch-sweep down adds impact
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.5), now + duration);

    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peak, now + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(env);
    env.connect(this.outputNode);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  // ── Data output for downstream consumers ──────────────────────────────

  getDataOutput(): Record<string, number> {
    return {
      magnitude: Math.min(1, this.latestMagnitude / 10),           // 0..1 from 0..10
      depth: Math.min(1, this.latestDepth / 700),                  // 0..1 from 0..700km
      count: Math.min(1, this.recentQuakes.length / 50),           // recent count normalized
      energy: Math.min(1, this.energySum / 30),                    // decaying energy
    };
  }

  // ── Feed callback for the UI ──────────────────────────────────────────

  setOnQuakesUpdate(cb: ((quakes: Quake[]) => void) | null): void {
    this.onQuakesUpdate = cb;
  }

  getRecentQuakes(): Quake[] { return this.recentQuakes; }

  // ── Cleanup ───────────────────────────────────────────────────────────

  dispose(): void {
    this.stop();
    this.onQuakesUpdate = null;
    this.seenIds.clear();
    this.recentQuakes = [];
    super.dispose();
  }
}
