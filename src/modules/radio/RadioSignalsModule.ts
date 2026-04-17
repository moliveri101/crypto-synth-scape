import { AudioModule } from "../base/AudioModule";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RadioSnapshot {
  // Solar wind (from DSCOVR / ACE satellites at L1)
  windSpeed: number;    // km/s         typical 300-800
  windDensity: number;  // particles/cm³ typical 1-20
  windTemp: number;     // Kelvin       typical 1e4..1e6
  // Interplanetary magnetic field
  bt: number;           // nT (total)   typical 0-30
  bz: number;           // nT (N/S)    range -30..+30 (-ve = geomagnetic storm)
  // Geomagnetic activity index
  kp: number;           // 0-9
  // Solar electromagnetic radiation
  xrayFlux: number;     // W/m² (log)   ~1e-9 to 1e-3
  f107: number;         // 10.7cm solar radio flux (SFU)  ~65-300
  // Bookkeeping
  lastUpdate: number;
  isLive: boolean;      // true when the last fetch succeeded
}

// ─── Data sources ──────────────────────────────────────────────────────────
// All from NOAA Space Weather Prediction Center (swpc.noaa.gov) — free,
// CORS-enabled, no API keys required. Updated every 1-60 minutes.

const URL_WIND_PLASMA = "https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json";
const URL_WIND_MAG    = "https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json";
const URL_KP          = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
const URL_XRAY        = "https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json";
const URL_F107        = "https://services.swpc.noaa.gov/json/f107_cm_flux.json";

const POLL_MS = 60_000; // 1 minute
const TICK_MS = 100;    // UI smoothness

// Baseline defaults if everything fails — keep the UI alive with typical
// quiet-day values so downstream consumers still get sensible output.
const DEFAULTS: RadioSnapshot = {
  windSpeed: 400,
  windDensity: 5,
  windTemp: 100_000,
  bt: 5,
  bz: 0,
  kp: 2,
  xrayFlux: 1e-8,
  f107: 120,
  lastUpdate: Date.now(),
  isLive: false,
};

// ─── Module ────────────────────────────────────────────────────────────────

/**
 * Radio Signals — live space-weather/cosmic radio data source.
 *
 * Pulls real measurements of:
 *   • Solar wind speed, density, temperature (DSCOVR L1 satellite)
 *   • Interplanetary magnetic field (Bt, Bz components)
 *   • Planetary K-index (geomagnetic activity 0-9)
 *   • X-ray flux from the Sun (GOES satellite)
 *   • Solar F10.7cm radio flux (daily average)
 *
 * These are all publicly-accessible NOAA Space Weather Prediction Center
 * feeds updated in near-real-time. When a CME or solar flare hits Earth,
 * you'll hear/see it in the module within a minute.
 *
 * Start/Stop is decoupled from polling — data always flows to consumers
 * once the module is on the canvas. Play only controls an optional audio
 * drone that modulates with the data.
 */
export class RadioSignalsModule extends AudioModule {
  private snapshot: RadioSnapshot = { ...DEFAULTS };
  private masterGain: GainNode;
  private osc: OscillatorNode | null = null;
  private volume = 0.4;

  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private onSnapshotUpdate: ((s: RadioSnapshot) => void) | null = null;

  // Track which endpoints succeeded last poll so we can tell the UI
  private livePartialState = {
    wind: false, mag: false, kp: false, xray: false, f107: false,
  };

  constructor(ctx: AudioContext) {
    super(ctx);
    this.masterGain = this.createStereoGain(0);
    this.masterGain.connect(this.outputNode);

    // Start polling immediately + tick for smoothness
    this.fetchAll();
    this.pollHandle = setInterval(() => this.fetchAll(), POLL_MS);
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  start(): void {
    if (this.isActive) return;
    // Optional audio — a low drone whose pitch tracks Kp index (higher Kp =
    // more disturbed field = higher pitch). Subtle by design; most users
    // will want the data outputs rather than this internal tone.
    this.osc = this.ctx.createOscillator();
    this.osc.type = "sine";
    this.osc.frequency.value = this.kpToFrequency();
    this.osc.connect(this.masterGain);
    this.osc.start();
    this.rampGain(this.masterGain.gain, this.volume);
    this.isActive = true;
  }

  stop(): void {
    if (!this.isActive) return;
    this.rampGain(this.masterGain.gain, 0);
    const osc = this.osc;
    setTimeout(() => {
      try { osc?.stop(); } catch { /* ok */ }
      osc?.disconnect();
    }, 30);
    this.osc = null;
    this.isActive = false;
  }

  setParameter(name: string, value: any): void {
    if (name === "volume") {
      this.volume = Number(value);
      if (this.isActive) this.rampGain(this.masterGain.gain, this.volume);
    }
  }

  // ── Fetching ───────────────────────────────────────────────────────────

  private async fetchAll(): Promise<void> {
    await Promise.all([
      this.fetchWindPlasma(),
      this.fetchWindMag(),
      this.fetchKp(),
      this.fetchXray(),
      this.fetchF107(),
    ]);
    const livePartial = this.livePartialState;
    this.snapshot.isLive = livePartial.wind || livePartial.mag || livePartial.kp
                        || livePartial.xray || livePartial.f107;
    this.snapshot.lastUpdate = Date.now();
    this.onSnapshotUpdate?.(this.snapshot);
  }

  /** Array-style NOAA JSON: first row is column headers, rest are data rows. */
  private async fetchArrayJson(url: string): Promise<any[] | null> {
    try {
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) return null;
      const json = await resp.json();
      if (!Array.isArray(json) || json.length < 2) return null;
      return json;
    } catch { return null; }
  }

  private async fetchWindPlasma(): Promise<void> {
    // plasma-1-day.json format:
    // [ ["time_tag","density","speed","temperature"], ["2024-…", "5.2", "420", "100000"], ... ]
    const rows = await this.fetchArrayJson(URL_WIND_PLASMA);
    if (!rows) { this.livePartialState.wind = false; return; }
    // Walk backward to find the last row with all three values populated
    for (let i = rows.length - 1; i >= 1; i--) {
      const r = rows[i];
      const density = parseFloat(r[1]);
      const speed = parseFloat(r[2]);
      const temp = parseFloat(r[3]);
      if (isFinite(density) && isFinite(speed) && isFinite(temp)) {
        this.snapshot.windDensity = density;
        this.snapshot.windSpeed = speed;
        this.snapshot.windTemp = temp;
        this.livePartialState.wind = true;
        return;
      }
    }
    this.livePartialState.wind = false;
  }

  private async fetchWindMag(): Promise<void> {
    // mag-1-day.json format:
    // [ ["time_tag","bx_gsm","by_gsm","bz_gsm","lon_gsm","lat_gsm","bt"], ... ]
    const rows = await this.fetchArrayJson(URL_WIND_MAG);
    if (!rows) { this.livePartialState.mag = false; return; }
    for (let i = rows.length - 1; i >= 1; i--) {
      const r = rows[i];
      const bz = parseFloat(r[3]);
      const bt = parseFloat(r[6]);
      if (isFinite(bz) && isFinite(bt)) {
        this.snapshot.bz = bz;
        this.snapshot.bt = bt;
        this.livePartialState.mag = true;
        return;
      }
    }
    this.livePartialState.mag = false;
  }

  private async fetchKp(): Promise<void> {
    // noaa-planetary-k-index.json format:
    // [ ["time_tag","Kp","a_running","station_count"], ["2024-…","2","3.7","8"], ... ]
    const rows = await this.fetchArrayJson(URL_KP);
    if (!rows) { this.livePartialState.kp = false; return; }
    for (let i = rows.length - 1; i >= 1; i--) {
      const r = rows[i];
      const kp = parseFloat(r[1]);
      if (isFinite(kp)) {
        this.snapshot.kp = kp;
        this.livePartialState.kp = true;
        return;
      }
    }
    this.livePartialState.kp = false;
  }

  private async fetchXray(): Promise<void> {
    // xrays-1-day.json is an array of {time_tag, satellite, flux, energy}
    try {
      const resp = await fetch(URL_XRAY, { cache: "no-store" });
      if (!resp.ok) { this.livePartialState.xray = false; return; }
      const json: any[] = await resp.json();
      // Prefer the long-channel (0.1-0.8 nm) records — that's the standard
      // solar-flare indicator. Take the most recent.
      const long = json.filter((r) => r.energy === "0.1-0.8nm");
      const rows = long.length > 0 ? long : json;
      for (let i = rows.length - 1; i >= 0; i--) {
        const flux = parseFloat(rows[i].flux);
        if (isFinite(flux) && flux > 0) {
          this.snapshot.xrayFlux = flux;
          this.livePartialState.xray = true;
          return;
        }
      }
    } catch { /* silent — leave previous value */ }
    this.livePartialState.xray = false;
  }

  private async fetchF107(): Promise<void> {
    // f107_cm_flux.json is an array of {time_tag, flux, ...}
    try {
      const resp = await fetch(URL_F107, { cache: "no-store" });
      if (!resp.ok) { this.livePartialState.f107 = false; return; }
      const json: any[] = await resp.json();
      for (let i = json.length - 1; i >= 0; i--) {
        const flux = parseFloat(json[i].flux);
        if (isFinite(flux)) {
          this.snapshot.f107 = flux;
          this.livePartialState.f107 = true;
          return;
        }
      }
    } catch { /* silent */ }
    this.livePartialState.f107 = false;
  }

  // ── Ticker ─────────────────────────────────────────────────────────────
  // The snapshot values only move when a poll succeeds. Between polls we
  // add tiny random jitter so the UI feels alive (real sensors do wobble).

  private tick(): void {
    // Small random wobble on the values — imitates sensor noise. Kept
    // proportional so quiet-day values stay quiet.
    const jitter = () => (Math.random() - 0.5) * 2;
    this.snapshot.windSpeed += jitter() * 2;
    this.snapshot.windDensity += jitter() * 0.1;
    this.snapshot.bt += jitter() * 0.1;
    this.snapshot.bz += jitter() * 0.1;

    if (this.isActive && this.osc) {
      // Retune the audio drone subtly to current Kp
      const freq = this.kpToFrequency();
      this.osc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.5);
    }

    this.onSnapshotUpdate?.(this.snapshot);
  }

  /** Map Kp (0-9) to an audio frequency. Higher Kp = higher drone pitch. */
  private kpToFrequency(): number {
    const k = Math.max(0, Math.min(9, this.snapshot.kp));
    return 55 * Math.pow(2, k / 5); // 55Hz at Kp=0 → ~240Hz at Kp=9
  }

  // ── Data output ────────────────────────────────────────────────────────

  getDataOutput(): Record<string, number> {
    const s = this.snapshot;
    // Normalize each reading into a 0..1 range suitable for translators.
    // Caps are based on real-world extremes (the worst storms on record).
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    return {
      wind_speed:   clamp((s.windSpeed - 200) / 800),          // 200..1000 km/s
      wind_density: clamp(s.windDensity / 50),                  // 0..50 /cm³
      wind_temp:    clamp(Math.log10(Math.max(1, s.windTemp)) / 7),
      bt:           clamp(s.bt / 30),                            // 0..30 nT
      bz:           clamp((s.bz + 30) / 60),                     // -30..+30 → 0..1
      bz_south:     clamp(-s.bz / 20),                           // just the southward part (storm risk)
      kp:           clamp(s.kp / 9),                             // 0..9
      xray_flux:    clamp((Math.log10(Math.max(1e-12, s.xrayFlux)) + 9) / 6), // log-compressed
      f107:         clamp((s.f107 - 65) / 235),                  // 65..300 SFU
    };
  }

  // ── UI hooks ───────────────────────────────────────────────────────────

  setOnSnapshotUpdate(cb: ((s: RadioSnapshot) => void) | null): void {
    this.onSnapshotUpdate = cb;
  }
  getSnapshot(): RadioSnapshot { return this.snapshot; }

  // ── Cleanup ────────────────────────────────────────────────────────────

  dispose(): void {
    this.stop();
    if (this.pollHandle !== null) clearInterval(this.pollHandle);
    if (this.tickHandle !== null) clearInterval(this.tickHandle);
    this.pollHandle = null;
    this.tickHandle = null;
    try { this.masterGain.disconnect(); } catch { /* ok */ }
    this.onSnapshotUpdate = null;
    super.dispose();
  }
}
