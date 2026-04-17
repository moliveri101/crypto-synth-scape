import { registerModule } from "../registry";
import { StockModule, type StockData } from "./StockModule";
import StockModuleNode from "./StockModuleNode";

// Per-field output handles. `out-all` carries the full bundle; the rest carry
// one normalized 0..1 value each for direct patching into translators.
const STOCK_OUTPUTS: Array<{ id: string; label: string }> = [
  { id: "out-all",            label: "ALL" },
  { id: "out-price",          label: "Price" },
  { id: "out-change_24h",     label: "Change" },
  { id: "out-volatility",     label: "Volatility" },
  { id: "out-volume",         label: "Volume" },
  { id: "out-momentum",       label: "Bullish" },
  { id: "out-bearish",        label: "Bearish" },
  { id: "out-day_range",      label: "Range" },
  { id: "out-high_proximity", label: "Near Hi" },
];

// Initial placeholder stock used before the first data fetch
const initialStock = (symbol: string): StockData => ({
  symbol: symbol.toUpperCase(),
  name: symbol.toUpperCase(),
  currentPrice: 100,
  previousClose: 100,
  changePercent: 0,
  volume: 0,
  dayHigh: 100,
  dayLow: 100,
});

registerModule({
  type: "stock",
  category: "source",
  label: "Stock",
  hasInput: false,
  hasOutput: true,
  outputHandles: () => STOCK_OUTPUTS,
  defaultData: (extra) => ({
    stock: (extra?.stock as StockData | undefined) ?? initialStock(extra?.symbol ?? "AAPL"),
    mode: "live" as const,
    waveform: "sine" as OscillatorType,
    scale: "major",
    rootNote: "C",
    octave: 4,
    pitch: 0,
    volume: 0.8,
  }),
  createAudio: (ctx, data) => {
    const m = new StockModule(ctx, data.stock);
    if (data.mode) m.setParameter("mode", data.mode);
    if (data.waveform) m.setParameter("waveform", data.waveform);
    if (data.scale) m.setParameter("scale", data.scale);
    if (data.rootNote) m.setParameter("rootNote", data.rootNote);
    if (typeof data.octave === "number") m.setParameter("octave", data.octave);
    if (typeof data.pitch === "number") m.setParameter("pitch", data.pitch);
    if (typeof data.volume === "number") m.setParameter("volume", data.volume);
    return m;
  },
  component: StockModuleNode,
});
