import { AudioModule } from "../base/AudioModule";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface USDebtSnapshot {
  /** Total public debt outstanding (USD) — extrapolated every tick */
  totalDebt: number;
  /** Debt ÷ US population */
  perCitizen: number;
  /** Debt ÷ US taxpayers (rough) */
  perTaxpayer: number;
  /** USD added per second at current growth rate */
  growthPerSecond: number;
  /** USD added per year (growth × seconds/year) */
  growthPerYear: number;
  /** Annualized federal interest expense (USD) — from Treasury */
  annualInterest: number;
  /** Latest value from the API before extrapolation (for display) */
  baseDebt: number;
  /** When the base value was last fetched */
  fetchedAt: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

// US Treasury Fiscal Data API — public, no key required
const DEBT_URL =
  "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=30";

// Interest expense endpoint (monthly)
const INTEREST_URL =
  "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/interest_expense?sort=-record_date&page[size]=12";

// Poll the API every 5 minutes — debt updates daily, but we re-fetch to
// refresh our growth-rate estimate and catch corrections.
const POLL_MS = 5 * 60 * 1000;

// UI ticker cadence — extrapolated value updates every 100ms for smooth motion
const TICK_MS = 100;

// Sane defaults if the API is unreachable on first load (approximations for 2026)
const DEFAULT_DEBT = 36_500_000_000_000;       // $36.5T
const DEFAULT_GROWTH_PER_YEAR = 3_500_000_000_000; // $3.5T/year
const DEFAULT_ANNUAL_INTEREST = 1_100_000_000_000; // $1.1T/year

// Demographic constants for per-citizen / per-taxpayer math.
const US_POPULATION = 335_000_000;
const US_TAXPAYERS = 160_000_000;

const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;

/**
 * US Debt data source.
 *
 * - Polls fiscaldata.treasury.gov every 5 minutes for the latest Debt to the Penny
 * - Derives a per-second growth rate from the last 30 days of data
 * - Extrapolates a ticking debt value every 100ms for the UI
 * - Also fetches Treasury monthly interest expense for the interest field
 * - Exposes 6 normalized 0..1 fields via getDataOutput() for downstream consumers
 */
export class USDebtModule extends AudioModule {
  private snapshot: USDebtSnapshot = {
    totalDebt: DEFAULT_DEBT,
    perCitizen: DEFAULT_DEBT / US_POPULATION,
    perTaxpayer: DEFAULT_DEBT / US_TAXPAYERS,
    growthPerSecond: DEFAULT_GROWTH_PER_YEAR / SECONDS_PER_YEAR,
    growthPerYear: DEFAULT_GROWTH_PER_YEAR,
    annualInterest: DEFAULT_ANNUAL_INTEREST,
    baseDebt: DEFAULT_DEBT,
    fetchedAt: Date.now(),
  };

  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private onSnapshotUpdate: ((s: USDebtSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);

    // Fetch immediately and then on interval. Runs for the module's lifetime
    // regardless of Play/Stop so the ticker and downstream consumers always see
    // live data. Play/Stop reserved for future audio behaviour.
    this.fetchAll();
    this.pollHandle = setInterval(() => this.fetchAll(), POLL_MS);

    // High-frequency UI ticker — extrapolates between Treasury updates
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  start(): void {
    this.isActive = true;
  }

  stop(): void {
    this.isActive = false;
  }

  setParameter(_name: string, _value: any): void {
    // No user-tunable parameters for now
  }

  // ── Ticker ─────────────────────────────────────────────────────────────

  private tick(): void {
    const now = Date.now();
    const elapsedSec = (now - this.snapshot.fetchedAt) / 1000;
    const extrapolated =
      this.snapshot.baseDebt + elapsedSec * this.snapshot.growthPerSecond;

    this.snapshot = {
      ...this.snapshot,
      totalDebt: extrapolated,
      perCitizen: extrapolated / US_POPULATION,
      perTaxpayer: extrapolated / US_TAXPAYERS,
    };

    this.onSnapshotUpdate?.(this.snapshot);
  }

  // ── API fetch ──────────────────────────────────────────────────────────

  private async fetchAll(): Promise<void> {
    await Promise.all([this.fetchDebt(), this.fetchInterest()]);
  }

  private async fetchDebt(): Promise<void> {
    try {
      const resp = await fetch(DEBT_URL, { cache: "no-store" });
      if (!resp.ok) return;
      const json: any = await resp.json();
      const rows: any[] = json?.data ?? [];
      if (rows.length === 0) return;

      // Latest row → current debt
      const latest = rows[0];
      const latestDebt = parseFloat(latest.tot_pub_debt_out_amt);
      const latestDate = new Date(latest.record_date).getTime();
      if (!isFinite(latestDebt) || !isFinite(latestDate)) return;

      // Compute growth rate from the oldest row in the window
      let growthPerSec = this.snapshot.growthPerSecond;
      if (rows.length >= 2) {
        const oldest = rows[rows.length - 1];
        const oldDebt = parseFloat(oldest.tot_pub_debt_out_amt);
        const oldDate = new Date(oldest.record_date).getTime();
        const dtSec = (latestDate - oldDate) / 1000;
        if (isFinite(oldDebt) && dtSec > 0) {
          const rate = (latestDebt - oldDebt) / dtSec;
          // Only accept positive, sane growth rates (ignore corrections/spikes)
          if (rate > 0 && rate < 10_000_000) growthPerSec = rate;
        }
      }

      this.snapshot = {
        ...this.snapshot,
        baseDebt: latestDebt,
        totalDebt: latestDebt,
        perCitizen: latestDebt / US_POPULATION,
        perTaxpayer: latestDebt / US_TAXPAYERS,
        growthPerSecond: growthPerSec,
        growthPerYear: growthPerSec * SECONDS_PER_YEAR,
        fetchedAt: Date.now(),
      };

      this.onSnapshotUpdate?.(this.snapshot);
    } catch {
      // Network failure — keep previous snapshot, retry next interval
    }
  }

  private async fetchInterest(): Promise<void> {
    try {
      const resp = await fetch(INTEREST_URL, { cache: "no-store" });
      if (!resp.ok) return;
      const json: any = await resp.json();
      const rows: any[] = json?.data ?? [];
      if (rows.length === 0) return;

      // Sum the most recent 12 months of interest expense for an annualized figure
      const twelve = rows.slice(0, 12);
      let sum = 0;
      for (const r of twelve) {
        const v = parseFloat(r.month_expense_amt ?? r.current_month_exp_amt ?? "0");
        if (isFinite(v)) sum += v;
      }
      if (sum > 0) {
        this.snapshot = { ...this.snapshot, annualInterest: sum };
      }
    } catch {
      // Non-critical — keep previous value
    }
  }

  // ── Data output for downstream consumers ──────────────────────────────

  getDataOutput(): Record<string, number> {
    const s = this.snapshot;
    return {
      // Normalize against a "max" so all fields read 0..1
      total_debt:    Math.max(0, Math.min(1, s.totalDebt / 100_000_000_000_000)),   // 0..$100T
      per_citizen:   Math.max(0, Math.min(1, s.perCitizen / 500_000)),               // 0..$500k
      per_taxpayer:  Math.max(0, Math.min(1, s.perTaxpayer / 1_000_000)),            // 0..$1M
      growth_rate:   Math.max(0, Math.min(1, s.growthPerSecond / 500_000)),          // 0..$500k/s
      annual_interest: Math.max(0, Math.min(1, s.annualInterest / 3_000_000_000_000)), // 0..$3T/yr
      debt_to_gdp:   Math.max(0, Math.min(1, s.totalDebt / 30_000_000_000_000)),     // 0..1 at ~$30T GDP
    };
  }

  // ── UI hooks ───────────────────────────────────────────────────────────

  setOnSnapshotUpdate(cb: ((s: USDebtSnapshot) => void) | null): void {
    this.onSnapshotUpdate = cb;
  }

  getSnapshot(): USDebtSnapshot {
    return this.snapshot;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  dispose(): void {
    this.stop();
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    if (this.tickHandle !== null) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    this.onSnapshotUpdate = null;
    super.dispose();
  }
}
