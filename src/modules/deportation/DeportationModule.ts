import { AudioModule } from "../base/AudioModule";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DeportationSnapshot {
  // Aggregate fiscal-year totals (growing over time)
  totalRemovals: number;    // deportations since Oct 1 (FY start)
  totalArrests: number;     // ICE arrests since FY start
  currentDetained: number;  // estimated currently in detention

  // Derived rates
  perDay: number;           // avg deportations per day
  perHour: number;          // per hour
  perMinute: number;        // per minute
  perSecond: number;        // per second

  // Geographic distribution (cumulative, not rates)
  byRegion: Record<string, number>;

  // Field office cumulative arrest totals
  byOffice: Record<string, number>;

  // Bookkeeping
  fiscalYearStart: number;  // epoch ms — Oct 1 of current FY
  lastUpdate: number;
}

// ─── Constants — based on public ICE statistics ─────────────────────────────
//
// Sources:
// - ICE.gov Annual Report FY2024: ~271,000 total removals
// - ICE arrests FY2024: ~113,000 administrative arrests
// - TRAC Syracuse: ~39,000 current detention population
// - Regional distribution from ICE ERO country-of-removal statistics
//
// These are published, defensible baselines. The module extrapolates forward
// from the last known reporting date so the UI has live-feeling motion.

// Annual rates — used for per-second extrapolation
const ANNUAL_REMOVALS = 271_484;
const ANNUAL_ARRESTS = 113_431;

// Reference detention population (oscillates around this)
const BASELINE_DETAINED = 39_000;

// Geographic removal distribution (shares of total, sum to ~1.0)
// From ICE ERO public country-of-removal breakdowns.
const REGION_SHARES: Record<string, number> = {
  mexico:           0.40,
  central_america:  0.35,  // Guatemala + Honduras + El Salvador
  caribbean:        0.08,  // Cuba + Haiti + DR
  south_america:    0.06,
  asia:             0.05,
  africa:           0.03,
  europe:           0.02,
  other:            0.01,
};

// ICE field office cumulative arrest share (approximate, from ICE ERO data)
const OFFICE_SHARES: Record<string, number> = {
  dallas:       0.08,
  chicago:      0.07,
  miami:        0.08,
  houston:      0.09,
  phoenix:      0.12,
  san_antonio:  0.11,
  el_paso:      0.07,
  newark:       0.04,
};

const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;
const TICK_MS = 100;  // UI-smoothness ticker

// Normalization caps for 0..1 output (reasonable ceilings based on historical highs)
const CAP_TOTAL_REMOVALS = 500_000;
const CAP_TOTAL_ARRESTS  = 250_000;
const CAP_DETAINED       = 60_000;
const CAP_PER_DAY        = 2_000;
const CAP_PER_HOUR       = 100;
const CAP_PER_MINUTE     = 5;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** The start of the current US federal fiscal year (Oct 1). */
function getCurrentFiscalYearStart(): number {
  const now = new Date();
  const year = now.getUTCMonth() >= 9 // Oct is month 9 (0-indexed)
    ? now.getUTCFullYear()
    : now.getUTCFullYear() - 1;
  return Date.UTC(year, 9, 1);
}

/** Seconds elapsed since the start of the current fiscal year. */
function secondsIntoFiscalYear(): number {
  return Math.max(1, (Date.now() - getCurrentFiscalYearStart()) / 1000);
}

// ─── Module ─────────────────────────────────────────────────────────────────

/**
 * Immigration Enforcement / Deportation data source.
 *
 * Exposes four families of data for sonification:
 *
 *   1. AGGREGATE — cumulative FY-to-date totals (removals, arrests, detained)
 *   2. RATE — per-day / per-hour / per-minute / per-second average rates
 *   3. GEOGRAPHIC — cumulative removals broken down by region of origin
 *   4. OFFICE — cumulative arrests by major ICE field office
 *
 * The ticker extrapolates forward from the known fiscal-year rate every
 * 100ms so the UI feels alive (one deportation roughly every 115 seconds on
 * average based on published rates). Does NOT claim minute-by-minute
 * accuracy — it's a sonification of the scale and rate, not a live feed.
 */
export class DeportationModule extends AudioModule {
  private snapshot: DeportationSnapshot;

  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private onSnapshotUpdate: ((s: DeportationSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);

    const fyStart = getCurrentFiscalYearStart();
    const perSecond = ANNUAL_REMOVALS / SECONDS_PER_YEAR;

    // Initial snapshot — extrapolated from FY start to "now"
    const fySeconds = secondsIntoFiscalYear();
    const totalRemovals = Math.round(perSecond * fySeconds);
    const totalArrests = Math.round((ANNUAL_ARRESTS / SECONDS_PER_YEAR) * fySeconds);

    this.snapshot = {
      totalRemovals,
      totalArrests,
      currentDetained: BASELINE_DETAINED,
      perSecond,
      perMinute: perSecond * 60,
      perHour: perSecond * 3600,
      perDay: perSecond * 86400,
      byRegion: Object.fromEntries(
        Object.entries(REGION_SHARES).map(([k, share]) => [k, Math.round(totalRemovals * share)])
      ),
      byOffice: Object.fromEntries(
        Object.entries(OFFICE_SHARES).map(([k, share]) => [k, Math.round(totalArrests * share)])
      ),
      fiscalYearStart: fyStart,
      lastUpdate: Date.now(),
    };

    // High-frequency ticker to grow totals realistically between real reporting periods
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
  }

  start(): void { this.isActive = true; }
  stop(): void { this.isActive = false; }
  setParameter(_name: string, _value: any): void { /* no tunable params */ }

  // ── Ticker ──────────────────────────────────────────────────────────────

  private tick(): void {
    const now = Date.now();
    const deltaSec = (now - this.snapshot.lastUpdate) / 1000;

    const removalsDelta = this.snapshot.perSecond * deltaSec;
    const arrestsDelta = (ANNUAL_ARRESTS / SECONDS_PER_YEAR) * deltaSec;

    this.snapshot.totalRemovals += removalsDelta;
    this.snapshot.totalArrests += arrestsDelta;

    // Detained count wobbles around its baseline using a slow sinusoidal
    // variation — real detention populations swing daily. Not a "real" number,
    // just gives the reading a sense of life.
    const wobble = Math.sin(now / 30_000) * 1500;
    this.snapshot.currentDetained = BASELINE_DETAINED + wobble;

    // Recompute regional + office splits from new totals
    for (const [k, share] of Object.entries(REGION_SHARES)) {
      this.snapshot.byRegion[k] = this.snapshot.totalRemovals * share;
    }
    for (const [k, share] of Object.entries(OFFICE_SHARES)) {
      this.snapshot.byOffice[k] = this.snapshot.totalArrests * share;
    }

    this.snapshot.lastUpdate = now;

    this.onSnapshotUpdate?.(this.snapshot);
  }

  // ── Data output ─────────────────────────────────────────────────────────

  getDataOutput(): Record<string, number> {
    const s = this.snapshot;
    const out: Record<string, number> = {
      // AGGREGATE
      total_removals:  Math.min(1, s.totalRemovals / CAP_TOTAL_REMOVALS),
      total_arrests:   Math.min(1, s.totalArrests / CAP_TOTAL_ARRESTS),
      current_detained: Math.min(1, s.currentDetained / CAP_DETAINED),

      // RATE
      per_day:    Math.min(1, s.perDay / CAP_PER_DAY),
      per_hour:   Math.min(1, s.perHour / CAP_PER_HOUR),
      per_minute: Math.min(1, s.perMinute / CAP_PER_MINUTE),
    };

    // GEOGRAPHIC — each region normalized against the largest (mexico at 40%)
    const maxRegion = s.totalRemovals * REGION_SHARES.mexico || 1;
    for (const [k, v] of Object.entries(s.byRegion)) {
      out[`region_${k}`] = Math.min(1, v / maxRegion);
    }

    // OFFICE — normalized against the most active office (phoenix)
    const maxOffice = s.totalArrests * OFFICE_SHARES.phoenix || 1;
    for (const [k, v] of Object.entries(s.byOffice)) {
      out[`office_${k}`] = Math.min(1, v / maxOffice);
    }

    return out;
  }

  // ── UI hooks ────────────────────────────────────────────────────────────

  setOnSnapshotUpdate(cb: ((s: DeportationSnapshot) => void) | null): void {
    this.onSnapshotUpdate = cb;
  }

  getSnapshot(): DeportationSnapshot {
    return this.snapshot;
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  dispose(): void {
    this.stop();
    if (this.tickHandle !== null) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    this.onSnapshotUpdate = null;
    super.dispose();
  }
}
