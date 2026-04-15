import { AudioModule } from "../base/AudioModule";

// ─── Types ──────────────────────────────────────────────────────────────────

/** The 14 electrode positions of the Emotiv EPOC X, in canonical order. */
export const EMOTIV_CHANNELS = [
  "AF3", "F7", "F3", "FC5", "T7", "P7", "O1",
  "O2", "P8", "T8", "FC6", "F4", "F8", "AF4",
] as const;
export type EmotivChannel = typeof EMOTIV_CHANNELS[number];

/** The five EEG band powers Emotiv's Cortex API exposes. */
export const EMOTIV_BANDS = ["theta", "alpha", "betaL", "betaH", "gamma"] as const;
export type EmotivBand = typeof EMOTIV_BANDS[number];

export type EmotivMode = "simulated" | "cortex";

export interface EmotivSnapshot {
  /** Most recent per-channel amplitude 0..1 (simulated or from Cortex) */
  channels: Record<EmotivChannel, number>;
  /** Per-band average across all channels, 0..1 */
  bands: Record<EmotivBand, number>;
  /** Overall signal quality 0..1 */
  quality: number;
  /** Whether we are currently connected to Cortex (if in cortex mode) */
  connected: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SIM_TICK_MS = 50;             // 20Hz UI + data update
const CORTEX_WS_URL = "wss://localhost:6868";

// Each channel gets a slightly different "rhythm" in simulation mode — a blend
// of slow drift, a dominant band frequency, and a little noise. This gives the
// outputs visually and audibly distinct personalities.
const CHANNEL_CHARACTER: Record<EmotivChannel, { base: number; freq: number; noise: number }> = {
  AF3: { base: 0.50, freq: 0.09,  noise: 0.05 },  // frontal — alpha
  F7:  { base: 0.48, freq: 0.17,  noise: 0.05 },
  F3:  { base: 0.52, freq: 0.11,  noise: 0.04 },
  FC5: { base: 0.50, freq: 0.21,  noise: 0.06 },
  T7:  { base: 0.47, freq: 0.07,  noise: 0.07 },  // temporal — theta
  P7:  { base: 0.51, freq: 0.13,  noise: 0.05 },
  O1:  { base: 0.55, freq: 0.10,  noise: 0.03 },  // occipital — strong alpha
  O2:  { base: 0.55, freq: 0.10,  noise: 0.03 },
  P8:  { base: 0.51, freq: 0.13,  noise: 0.05 },
  T8:  { base: 0.47, freq: 0.07,  noise: 0.07 },
  FC6: { base: 0.50, freq: 0.21,  noise: 0.06 },
  F4:  { base: 0.52, freq: 0.11,  noise: 0.04 },
  F8:  { base: 0.48, freq: 0.17,  noise: 0.05 },
  AF4: { base: 0.50, freq: 0.09,  noise: 0.05 },
};

/**
 * Emotiv EPOC X EEG module — 14-channel brain-signal source.
 *
 * - Default simulated mode generates believable per-channel amplitudes and
 *   band powers (theta/alpha/betaL/betaH/gamma) so the module is always useful
 *   without external hardware.
 * - Optional Cortex mode connects to the locally running Emotiv Cortex service
 *   (wss://localhost:6868) using client id + secret from the Emotiv dev portal.
 * - Exposes every electrode as a separate 0..1 output plus a bundled ALL
 *   output for consumers that want to pick a field themselves.
 */
export class EmotivModule extends AudioModule {
  private snapshot: EmotivSnapshot = {
    channels: Object.fromEntries(EMOTIV_CHANNELS.map((c) => [c, 0.5])) as Record<EmotivChannel, number>,
    bands: Object.fromEntries(EMOTIV_BANDS.map((b) => [b, 0.5])) as Record<EmotivBand, number>,
    quality: 1,
    connected: false,
  };

  private mode: EmotivMode = "simulated";
  private clientId = "";
  private clientSecret = "";

  private simHandle: ReturnType<typeof setInterval> | null = null;
  private simPhase = 0;

  // Cortex websocket state
  private ws: WebSocket | null = null;
  private cortexToken: string | null = null;
  private cortexSession: string | null = null;
  private nextReqId = 1;
  private pendingRequests = new Map<number, (result: any, error?: any) => void>();

  private onSnapshotUpdate: ((s: EmotivSnapshot) => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    // Simulator starts immediately so the UI and downstream consumers always
    // see live data without requiring Play.
    this.simHandle = setInterval(() => this.simTick(), SIM_TICK_MS);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  start(): void {
    if (this.isActive) return;
    this.isActive = true;
    if (this.mode === "cortex") this.connectCortex();
  }

  stop(): void {
    if (!this.isActive) return;
    this.isActive = false;
    this.disconnectCortex();
  }

  setParameter(name: string, value: any): void {
    switch (name) {
      case "mode":
        if (value === "simulated" || value === "cortex") {
          if (this.mode !== value) {
            this.disconnectCortex();
            this.mode = value;
            if (this.isActive && this.mode === "cortex") this.connectCortex();
          }
        }
        break;
      case "clientId":
        this.clientId = String(value ?? "");
        break;
      case "clientSecret":
        this.clientSecret = String(value ?? "");
        break;
    }
  }

  // ── Simulation ─────────────────────────────────────────────────────────

  private simTick(): void {
    this.simPhase += 0.05;

    // Per-channel amplitude: base ± sin drift + small noise. Stays in 0..1.
    for (const ch of EMOTIV_CHANNELS) {
      const c = CHANNEL_CHARACTER[ch];
      const drift = Math.sin(this.simPhase * c.freq * 10 + hash(ch)) * 0.35;
      const noise = (Math.random() - 0.5) * c.noise;
      const v = c.base + drift + noise;
      this.snapshot.channels[ch] = Math.max(0, Math.min(1, v));
    }

    // Per-band: slowly wandering 0..1 values. Different bands peak at
    // different simulated rhythms — alpha tends higher (relaxed state),
    // gamma tends lower, betaL/H in between.
    const bandTargets: Record<EmotivBand, number> = {
      theta: 0.45 + Math.sin(this.simPhase * 0.3) * 0.15,
      alpha: 0.60 + Math.sin(this.simPhase * 0.5 + 1) * 0.20,
      betaL: 0.50 + Math.sin(this.simPhase * 0.7 + 2) * 0.15,
      betaH: 0.40 + Math.sin(this.simPhase * 0.9 + 3) * 0.15,
      gamma: 0.35 + Math.sin(this.simPhase * 1.1 + 4) * 0.10,
    };
    for (const b of EMOTIV_BANDS) {
      this.snapshot.bands[b] = Math.max(0, Math.min(1, bandTargets[b] + (Math.random() - 0.5) * 0.02));
    }

    // Signal quality drifts high in sim
    this.snapshot.quality = 0.9 + Math.random() * 0.1;
    this.snapshot.connected = this.mode === "simulated" ? true : !!this.cortexSession;

    this.onSnapshotUpdate?.(this.snapshot);
  }

  // ── Cortex (real hardware) ─────────────────────────────────────────────
  // Minimal JSON-RPC client for Emotiv's local Cortex service. Requires the
  // user's Emotiv Launcher + Cortex to be running and the headset connected.

  private async connectCortex(): Promise<void> {
    if (!this.clientId || !this.clientSecret) return;
    try {
      this.ws = new WebSocket(CORTEX_WS_URL);
      this.ws.addEventListener("message", (ev) => this.handleCortexMessage(ev));
      this.ws.addEventListener("error", () => {
        this.snapshot.connected = false;
        this.onSnapshotUpdate?.(this.snapshot);
      });
      this.ws.addEventListener("close", () => {
        this.snapshot.connected = false;
        this.cortexToken = null;
        this.cortexSession = null;
        this.onSnapshotUpdate?.(this.snapshot);
      });
      await new Promise<void>((resolve, reject) => {
        if (!this.ws) return reject();
        this.ws.addEventListener("open", () => resolve(), { once: true });
        this.ws.addEventListener("error", () => reject(), { once: true });
      });

      // 1. Request access (user must approve in Emotiv Launcher the first time)
      await this.cortexCall("requestAccess", {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
      });

      // 2. Authorize and get a cortex token
      const auth = await this.cortexCall("authorize", {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        debit: 1,
      });
      this.cortexToken = auth.cortexToken;

      // 3. Query first connected headset
      const headsets = await this.cortexCall("queryHeadsets", {});
      const first = headsets?.[0];
      if (!first) throw new Error("No headset found");

      // 4. Create a session
      const session = await this.cortexCall("createSession", {
        cortexToken: this.cortexToken,
        headset: first.id,
        status: "active",
      });
      this.cortexSession = session.id;

      // 5. Subscribe to band-power and raw EEG streams
      await this.cortexCall("subscribe", {
        cortexToken: this.cortexToken,
        session: this.cortexSession,
        streams: ["pow", "eeg"],
      });
    } catch {
      // Leave in simulated-like state — the simTick continues regardless
      this.snapshot.connected = false;
      this.onSnapshotUpdate?.(this.snapshot);
    }
  }

  private disconnectCortex(): void {
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
    this.cortexToken = null;
    this.cortexSession = null;
    this.pendingRequests.clear();
  }

  private cortexCall(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return reject();
      const id = this.nextReqId++;
      this.pendingRequests.set(id, (result, error) => {
        if (error) reject(error); else resolve(result);
      });
      this.ws.send(JSON.stringify({ jsonrpc: "2.0", method, params, id }));
    });
  }

  private handleCortexMessage(ev: MessageEvent): void {
    let msg: any;
    try { msg = JSON.parse(String(ev.data)); } catch { return; }

    // Response to a JSON-RPC call
    if (typeof msg.id === "number" && this.pendingRequests.has(msg.id)) {
      const cb = this.pendingRequests.get(msg.id)!;
      this.pendingRequests.delete(msg.id);
      cb(msg.result, msg.error);
      return;
    }

    // Streaming data: `pow` is per-channel band powers, `eeg` is raw samples.
    // Cortex sends: { pow: number[], sid: ..., time: ... }
    // `pow` layout: for each channel, 5 values (theta, alpha, betaL, betaH, gamma)
    if (Array.isArray(msg.pow)) {
      const chCount = EMOTIV_CHANNELS.length;
      const bandSums: Record<EmotivBand, number> = { theta: 0, alpha: 0, betaL: 0, betaH: 0, gamma: 0 };
      for (let i = 0; i < chCount; i++) {
        for (let b = 0; b < EMOTIV_BANDS.length; b++) {
          const v = msg.pow[i * 5 + b];
          if (typeof v === "number") bandSums[EMOTIV_BANDS[b]] += v;
        }
      }
      // Normalize: Emotiv's band powers are small numbers (~0..25 typically).
      // Divide by channels × 25 to get a rough 0..1. Clamp.
      for (const b of EMOTIV_BANDS) {
        this.snapshot.bands[b] = Math.max(0, Math.min(1, bandSums[b] / (chCount * 25)));
      }
    }

    if (Array.isArray(msg.eeg)) {
      // `eeg` layout: [counter, interpolated, AF3, F7, F3, ..., AF4, rawCQ, markerHardware, markers]
      // Channel data starts at index 2 and maps to EMOTIV_CHANNELS in order.
      for (let i = 0; i < EMOTIV_CHANNELS.length; i++) {
        const raw = msg.eeg[i + 2];
        if (typeof raw === "number") {
          // Emotiv raw EEG is ~4000-4500µV range centered around 4200. Normalize.
          const normalized = Math.max(0, Math.min(1, (raw - 3800) / 800));
          this.snapshot.channels[EMOTIV_CHANNELS[i]] = normalized;
        }
      }
    }
  }

  // ── Data output for downstream consumers ──────────────────────────────

  getDataOutput(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const ch of EMOTIV_CHANNELS) out[ch] = this.snapshot.channels[ch];
    for (const b of EMOTIV_BANDS) out[`band_${b}`] = this.snapshot.bands[b];
    out.quality = this.snapshot.quality;
    return out;
  }

  // ── UI hooks ───────────────────────────────────────────────────────────

  setOnSnapshotUpdate(cb: ((s: EmotivSnapshot) => void) | null): void {
    this.onSnapshotUpdate = cb;
  }

  getSnapshot(): EmotivSnapshot {
    return this.snapshot;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  dispose(): void {
    this.stop();
    if (this.simHandle !== null) {
      clearInterval(this.simHandle);
      this.simHandle = null;
    }
    this.onSnapshotUpdate = null;
    super.dispose();
  }
}

// Simple deterministic hash for channel phase offsets so each channel has a
// unique starting drift but the simulation is reproducible frame-to-frame.
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h % 1000) / 1000 * Math.PI * 2;
}
