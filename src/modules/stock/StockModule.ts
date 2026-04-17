import { AudioModule } from "../base/AudioModule";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StockData {
  symbol: string;
  name: string;
  currentPrice: number;
  previousClose: number;
  changePercent: number;
  volume: number;
  dayHigh: number;
  dayLow: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const FREQ_RAMP_TIME = 0.05;

// Yahoo Finance chart endpoint — publicly accessible and CORS-friendly for
// most symbols. If it fails (network error, CORS refusal, invalid symbol) we
// fall back to the simulation path so the module stays useful offline.
const YAHOO_URL = (sym: string) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`;

// Poll live data this often. Yahoo is fine with once-a-minute traffic.
const POLL_MS = 60_000;
// Between live polls, extrapolate a little so the ticker feels alive.
const TICK_MS = 100;

// Simulated-mode "personalities" per-symbol — used to give each simulated
// stock its own character (volatility, drift bias). Seeded from symbol hash
// so AAPL always feels like AAPL whether or not we have live data.
function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) / 0x7fffffff;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed = (seed + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Module ─────────────────────────────────────────────────────────────────

/**
 * Stock market data source + oscillator.
 *
 * Modeled on CryptoModule: each StockModule represents one ticker symbol and
 * outputs an audible tone whose pitch is derived from the stock's price
 * change. Downstream modules can consume normalized data fields (price,
 * change_24h, volatility, volume, momentum, bearish, high, low) via the
 * standard out-<field> routing.
 *
 * Data mode: tries live Yahoo Finance first, falls back to simulation if
 * the fetch fails. A module-level setting lets the user force simulated
 * mode (useful offline or when Yahoo rate-limits).
 */
export class StockModule extends AudioModule {
  // Audio
  private oscL: OscillatorNode | null = null;
  private oscR: OscillatorNode | null = null;
  private merger: ChannelMergerNode | null = null;
  private masterGain: GainNode;

  // Musical parameters
  private waveform: OscillatorType = "sine";
  private scale = "major";
  private rootNote = "C";
  private octave = 4;
  private pitch = 0;
  private volume = 0.8;

  // Stock state
  private stock: StockData;
  private mode: "live" | "simulated" = "live";
  private simRng: () => number;
  private simBaseline = 100;
  private simVolatility = 0.02; // 2% typical daily volatility
  private simBias = 0;          // drift bias per tick
  private simT = 0;              // time counter for sim walk

  // Polling / ticking
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private onSnapshotUpdate: ((s: StockData) => void) | null = null;

  constructor(ctx: AudioContext, initialStock: StockData) {
    super(ctx);

    this.masterGain = this.createStereoGain(0);
    this.masterGain.connect(this.outputNode);

    this.stock = { ...initialStock };

    // Set up simulation personality from symbol hash
    const seed = hashSeed(initialStock.symbol);
    this.simRng = mulberry32(Math.floor(seed * 1e9));
    this.simBaseline = initialStock.currentPrice > 0 ? initialStock.currentPrice : 100;
    // Different symbols get different volatilities — hash controls personality
    this.simVolatility = 0.005 + seed * 0.04; // 0.5% to 4.5%
    this.simBias = (seed - 0.5) * 0.0005;     // tiny bullish/bearish drift

    // Start polling and ticking — decoupled from Play so downstream consumers
    // always see live data regardless of audio playback state.
    this.fetchLive();
    this.pollHandle = setInterval(() => this.fetchLive(), POLL_MS);
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  start(): void {
    if (this.isActive) return;

    const freq = this.calculateFrequency();
    this.oscL = this.ctx.createOscillator();
    this.oscR = this.ctx.createOscillator();
    this.oscL.type = this.waveform;
    this.oscR.type = this.waveform;
    this.oscL.frequency.value = freq;
    this.oscR.frequency.value = freq;
    this.oscL.detune.value = -3;
    this.oscR.detune.value = 3;

    this.merger = this.ctx.createChannelMerger(2);
    this.oscL.connect(this.merger, 0, 0);
    this.oscR.connect(this.merger, 0, 1);
    this.merger.connect(this.masterGain);

    this.oscL.start();
    this.oscR.start();

    this.rampGain(this.masterGain.gain, this.volume);
    this.isActive = true;
  }

  stop(): void {
    if (!this.isActive) return;
    this.rampGain(this.masterGain.gain, 0);

    const cleanup = () => {
      try { this.oscL?.stop(); this.oscR?.stop(); } catch { /* ok */ }
      this.oscL?.disconnect();
      this.oscR?.disconnect();
      this.merger?.disconnect();
      this.oscL = null;
      this.oscR = null;
      this.merger = null;
    };
    setTimeout(cleanup, 30);
    this.isActive = false;
  }

  setParameter(name: string, value: any): void {
    switch (name) {
      case "mode":
        if (value === "live" || value === "simulated") this.mode = value;
        break;
      case "volume":
        this.volume = Number(value);
        if (this.isActive) this.rampGain(this.masterGain.gain, this.volume);
        break;
      case "waveform":
        this.waveform = value as OscillatorType;
        if (this.oscL) this.oscL.type = this.waveform;
        if (this.oscR) this.oscR.type = this.waveform;
        break;
      case "scale":
        this.scale = String(value);
        this.rampToCurrentFrequency();
        break;
      case "rootNote":
        this.rootNote = String(value);
        this.rampToCurrentFrequency();
        break;
      case "octave":
        this.octave = Number(value);
        this.rampToCurrentFrequency();
        break;
      case "pitch":
        this.pitch = Number(value);
        this.rampToCurrentFrequency();
        break;
    }
  }

  // ── Data fetching + simulation ─────────────────────────────────────────

  private async fetchLive(): Promise<void> {
    if (this.mode !== "live") return;
    try {
      const resp = await fetch(YAHOO_URL(this.stock.symbol), { cache: "no-store" });
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      const json: any = await resp.json();
      const result = json?.chart?.result?.[0];
      if (!result) throw new Error("no result in chart response");
      const meta = result.meta;
      if (!meta) throw new Error("no meta");

      const price = meta.regularMarketPrice ?? meta.previousClose ?? 0;
      const prev = meta.chartPreviousClose ?? meta.previousClose ?? price;
      const change = prev > 0 ? ((price - prev) / prev) * 100 : 0;
      const volume = meta.regularMarketVolume ?? meta.volume ?? 0;
      const high = meta.regularMarketDayHigh ?? meta.dayHigh ?? price;
      const low = meta.regularMarketDayLow ?? meta.dayLow ?? price;
      const name = meta.longName ?? meta.shortName ?? this.stock.name ?? this.stock.symbol;

      this.stock = {
        symbol: this.stock.symbol,
        name,
        currentPrice: price,
        previousClose: prev,
        changePercent: change,
        volume,
        dayHigh: high,
        dayLow: low,
      };
      this.simBaseline = price; // keep sim anchored near real price
      this.rampToCurrentFrequency();
      this.onSnapshotUpdate?.(this.snapshot());
    } catch {
      // Yahoo fetch failed (CORS, rate limit, offline, bad symbol).
      // Fall back to simulation silently — the tick loop will keep the UI moving.
    }
  }

  /** High-frequency extrapolation between live polls (100ms cadence). */
  private tick(): void {
    if (this.mode === "simulated") {
      this.simT += 0.1;
      // Brownian walk with mean reversion toward baseline
      const r = (this.simRng() - 0.5) * 2 * this.simVolatility * this.simBaseline * 0.05;
      const pull = (this.simBaseline - this.stock.currentPrice) * 0.0005;
      const delta = r + pull + this.simBias * this.simBaseline;
      const price = Math.max(0.01, this.stock.currentPrice + delta);
      const changePercent = this.stock.previousClose > 0
        ? ((price - this.stock.previousClose) / this.stock.previousClose) * 100
        : 0;
      this.stock = {
        ...this.stock,
        currentPrice: price,
        changePercent,
        dayHigh: Math.max(this.stock.dayHigh, price),
        dayLow: Math.min(this.stock.dayLow || price, price),
      };
      this.rampToCurrentFrequency();
      this.onSnapshotUpdate?.(this.snapshot());
    } else {
      // Live mode — small intra-poll jitter around the last fetched price
      // so the ticker has some motion between network updates.
      const jitter = (this.simRng() - 0.5) * this.simVolatility * this.simBaseline * 0.01;
      const price = Math.max(0.01, this.stock.currentPrice + jitter);
      this.stock = { ...this.stock, currentPrice: price };
      this.onSnapshotUpdate?.(this.snapshot());
    }
  }

  /** Swap the module to a new symbol (triggered by the UI). */
  async updateSymbol(symbol: string): Promise<void> {
    this.stock = {
      symbol: symbol.toUpperCase(),
      name: symbol.toUpperCase(),
      currentPrice: this.simBaseline,
      previousClose: this.simBaseline,
      changePercent: 0,
      volume: 0,
      dayHigh: this.simBaseline,
      dayLow: this.simBaseline,
    };
    const seed = hashSeed(symbol);
    this.simRng = mulberry32(Math.floor(seed * 1e9));
    this.simVolatility = 0.005 + seed * 0.04;
    this.simBias = (seed - 0.5) * 0.0005;
    await this.fetchLive();
    this.rampToCurrentFrequency();
    this.onSnapshotUpdate?.(this.snapshot());
  }

  // ── Data output for downstream consumers ──────────────────────────────

  getDataOutput(): Record<string, number> {
    const s = this.stock;
    const change = s.changePercent;
    const range = s.dayHigh - s.dayLow;
    return {
      price:        Math.min(1, s.currentPrice / 1000),           // 0..$1000 → 0..1
      change_24h:   (Math.max(-20, Math.min(20, change)) + 20) / 40, // -20..+20 → 0..1
      volatility:   Math.min(1, Math.abs(change) / 10),            // |%| / 10
      volume:       Math.min(1, s.volume / 100_000_000),           // up to 100M shares
      momentum:     change >= 0 ? Math.min(1, change / 10) : 0,
      bearish:      change < 0 ? Math.min(1, Math.abs(change) / 10) : 0,
      day_range:    Math.min(1, range / (s.currentPrice * 0.1)),   // normalized intraday range
      high_proximity: s.dayHigh > 0 ? s.currentPrice / s.dayHigh : 0, // how close to day high
    };
  }

  // ── UI hooks ───────────────────────────────────────────────────────────

  setOnSnapshotUpdate(cb: ((s: StockData) => void) | null): void {
    this.onSnapshotUpdate = cb;
  }

  snapshot(): StockData { return { ...this.stock }; }
  getSnapshot(): StockData { return this.snapshot(); }

  // ── Frequency (same approach as CryptoModule) ──────────────────────────

  private calculateFrequency(): number {
    const noteFreqs: Record<string, number> = {
      C: 261.63, "C#": 277.18, D: 293.66, "D#": 311.13,
      E: 329.63, F: 349.23, "F#": 369.99, G: 392.00,
      "G#": 415.30, A: 440.00, "A#": 466.16, B: 493.88,
    };
    const scaleIntervals: Record<string, number[]> = {
      major: [0, 2, 4, 5, 7, 9, 11],
      minor: [0, 2, 3, 5, 7, 8, 10],
      pentatonic: [0, 2, 4, 7, 9],
      blues: [0, 3, 5, 6, 7, 10],
      chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    };
    const base = noteFreqs[this.rootNote] ?? 261.63;
    const octMul = Math.pow(2, this.octave - 4);
    const absChange = Math.abs(this.stock.changePercent);
    const intervals = scaleIntervals[this.scale] ?? scaleIntervals.major;
    const idx = Math.floor((absChange / 5) * intervals.length) % intervals.length;
    const semitone = intervals[idx] + this.pitch;
    const f = base * octMul * Math.pow(2, semitone / 12);
    return Math.min(Math.max(f, 1), 2000);
  }

  private rampToCurrentFrequency(): void {
    if (!this.isActive || !this.oscL || !this.oscR) return;
    const freq = this.calculateFrequency();
    const t = this.ctx.currentTime + FREQ_RAMP_TIME;
    this.oscL.frequency.exponentialRampToValueAtTime(freq, t);
    this.oscR.frequency.exponentialRampToValueAtTime(freq, t);
  }

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
