import { useEffect, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import StereoHandles from "@/modules/base/StereoHandles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Play, Square, TrendingUp, TrendingDown, LineChart, Layers,
  Activity, Volume2, DollarSign, BarChart3,
} from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import type { StockModule, StockData } from "./StockModule";

interface StockModuleData {
  type: "stock";
  stock: StockData;
  mode: "live" | "simulated";
  waveform: OscillatorType;
  scale: string;
  rootNote: string;
  octave: number;
  pitch: number;
  volume: number;
  isPlaying: boolean;
  collapsed: boolean;
}

const WAVEFORMS: OscillatorType[] = ["sine", "square", "sawtooth", "triangle"];
const SCALES = ["chromatic", "major", "minor", "pentatonic", "blues"];
const ROOT_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const OCTAVES = [1, 2, 3, 4, 5, 6, 7];

// Per-field output handles. The bundle (ALL) carries the full dataset; the
// individual handles carry just one field each so translators auto-pick the
// right value without needing a dropdown.
const STOCK_HANDLES: Array<{
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isBundle?: boolean;
}> = [
  { id: "out-all",           label: "ALL",        icon: Layers,     isBundle: true },
  { id: "out-price",         label: "Price",      icon: DollarSign },
  { id: "out-change_24h",    label: "Change",     icon: TrendingUp },
  { id: "out-volatility",    label: "Volatility", icon: Activity },
  { id: "out-volume",        label: "Volume",     icon: Volume2 },
  { id: "out-momentum",      label: "Bullish",    icon: TrendingUp },
  { id: "out-bearish",       label: "Bearish",    icon: TrendingDown },
  { id: "out-day_range",     label: "Range",      icon: BarChart3 },
  { id: "out-high_proximity",label: "Near Hi",    icon: LineChart },
];

const HANDLE_ROW_HEIGHT = 40;

function formatPrice(p: number): string {
  if (p >= 1000) return "$" + p.toFixed(2);
  if (p >= 1) return "$" + p.toFixed(2);
  if (p > 0) return "$" + p.toFixed(4);
  return "—";
}
function formatVolume(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(0);
}

function StockModuleNode({ data, id }: NodeProps<StockModuleData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter, onAction, onStart, onStop } = useModuleActions();
  const {
    stock, mode, waveform, scale, rootNote, octave, pitch, volume,
    isPlaying, collapsed,
  } = data;

  const [snapshot, setSnapshot] = useState<StockData>(stock);
  const [symbolInput, setSymbolInput] = useState(stock.symbol);

  // Subscribe to live snapshot updates from the audio module
  useEffect(() => {
    const module = audioGraphManager.getModule(id) as StockModule | undefined;
    if (!module) return;
    module.setOnSnapshotUpdate((s) => setSnapshot({ ...s }));
    setSnapshot(module.getSnapshot());
    return () => { module.setOnSnapshotUpdate(null); };
  }, [id]);

  // When the React-state stock object changes (e.g. after symbol switch),
  // sync the input field so the user sees the actual current symbol.
  useEffect(() => {
    setSymbolInput(stock.symbol);
  }, [stock.symbol]);

  const applySymbol = () => {
    const sym = symbolInput.trim().toUpperCase();
    if (!sym || sym === snapshot.symbol) return;
    const module = audioGraphManager.getModule(id) as StockModule | undefined;
    if (!module) return;
    // Module updates its own snapshot; we also persist to React data so the
    // node keeps its new symbol across re-mounts / zombie recovery.
    module.updateSymbol(sym);
    onUpdateParameter(id, "stock", { ...snapshot, symbol: sym, name: sym });
  };

  const formatValue = (hid: string): string => {
    const s = snapshot;
    switch (hid) {
      case "out-all":            return `${STOCK_HANDLES.length - 1} fields`;
      case "out-price":          return formatPrice(s.currentPrice);
      case "out-change_24h":     return `${s.changePercent >= 0 ? "+" : ""}${s.changePercent.toFixed(2)}%`;
      case "out-volatility":     return Math.abs(s.changePercent).toFixed(2) + "%";
      case "out-volume":         return formatVolume(s.volume);
      case "out-momentum":       return s.changePercent > 0 ? "+" + s.changePercent.toFixed(2) + "%" : "—";
      case "out-bearish":        return s.changePercent < 0 ? s.changePercent.toFixed(2) + "%" : "—";
      case "out-day_range":      return formatPrice(s.dayLow) + "–" + formatPrice(s.dayHigh);
      case "out-high_proximity": return s.dayHigh > 0 ? ((s.currentPrice / s.dayHigh) * 100).toFixed(1) + "%" : "—";
      default: return "—";
    }
  };

  const changeUp = snapshot.changePercent >= 0;

  return (
    <Card
      className="bg-background border border-emerald-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 300 }}
    >
      <div className="p-3 space-y-2">
        <ModuleHeader
          id={id}
          title={snapshot.symbol || "STOCK"}
          subtitle={snapshot.name || "Market data"}
          icon={<LineChart className="w-5 h-5 text-emerald-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        >
          <Button
            size="sm"
            variant={isPlaying ? "destructive" : "default"}
            className="h-7 px-3"
            aria-label={isPlaying ? "Stop" : "Start"}
            onClick={() => (isPlaying ? onStop(id) : onStart(id))}
          >
            {isPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </Button>
        </ModuleHeader>

        {!collapsed && (
          <>
            {/* Symbol + mode */}
            <div className="flex items-center gap-1 nodrag nopan">
              <Input
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && applySymbol()}
                placeholder="AAPL"
                className="h-7 text-[11px] font-mono flex-1"
                aria-label="Stock symbol"
              />
              <Button size="sm" className="h-7 px-2 text-[10px]" onClick={applySymbol}>
                Set
              </Button>
              <Select
                value={mode}
                onValueChange={(v) => onUpdateParameter(id, "mode", v)}
              >
                <SelectTrigger className="h-7 w-20 text-[10px]" onPointerDown={(e) => e.stopPropagation()}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="simulated">Sim</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Current price + change — the marquee ticker */}
            <div className="flex items-baseline justify-between px-1">
              <span className="text-2xl font-bold font-mono text-foreground">
                {formatPrice(snapshot.currentPrice)}
              </span>
              <span
                className={`text-sm font-mono font-bold ${
                  changeUp ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {changeUp ? "▲" : "▼"} {snapshot.changePercent >= 0 ? "+" : ""}
                {snapshot.changePercent.toFixed(2)}%
              </span>
            </div>

            {/* Audio controls — same shape as the Crypto module */}
            <div className="grid grid-cols-2 gap-2 nodrag nopan border-t border-border pt-2">
              <div>
                <Label className="text-[9px] text-muted-foreground">Scale</Label>
                <Select value={scale} onValueChange={(v) => onUpdateParameter(id, "scale", v)}>
                  <SelectTrigger className="h-6 text-[10px]" onPointerDown={(e) => e.stopPropagation()}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCALES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[9px] text-muted-foreground">Root</Label>
                <Select value={rootNote} onValueChange={(v) => onUpdateParameter(id, "rootNote", v)}>
                  <SelectTrigger className="h-6 text-[10px]" onPointerDown={(e) => e.stopPropagation()}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROOT_NOTES.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[9px] text-muted-foreground">Octave</Label>
                <Select
                  value={String(octave)}
                  onValueChange={(v) => onUpdateParameter(id, "octave", parseInt(v, 10))}
                >
                  <SelectTrigger className="h-6 text-[10px]" onPointerDown={(e) => e.stopPropagation()}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OCTAVES.map((o) => <SelectItem key={o} value={String(o)}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[9px] text-muted-foreground">Wave</Label>
                <Select value={waveform} onValueChange={(v) => onUpdateParameter(id, "waveform", v)}>
                  <SelectTrigger className="h-6 text-[10px] capitalize" onPointerDown={(e) => e.stopPropagation()}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WAVEFORMS.map((w) => (
                      <SelectItem key={w} value={w} className="capitalize">{w}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="nodrag nopan">
              <Label className="text-[9px] text-muted-foreground">
                Volume: {Math.round(volume * 100)}%
              </Label>
              <Slider
                value={[volume * 100]}
                onValueChange={([v]) => onUpdateParameter(id, "volume", v / 100)}
                max={100}
                step={1}
                aria-label="Volume"
              />
            </div>

            <div className="nodrag nopan">
              <Label className="text-[9px] text-muted-foreground">
                Pitch: {pitch >= 0 ? "+" : ""}{pitch} st
              </Label>
              <Slider
                value={[pitch]}
                onValueChange={([v]) => onUpdateParameter(id, "pitch", v)}
                min={-12}
                max={12}
                step={1}
                aria-label="Pitch"
              />
            </div>
          </>
        )}
      </div>

      {/* Stereo audio output (right edge) */}
      <StereoHandles type="source" position={Position.Right} className="!bg-emerald-400" />

      {/* Per-field data output handles on the right, stacked vertically
          inside their own block below the controls */}
      {!collapsed && (
        <div className="border-t border-border">
          {STOCK_HANDLES.map((h) => {
            const Icon = h.icon;
            return (
              <div
                key={h.id}
                className={`flex items-center gap-2 px-3 border-b border-border last:border-b-0 ${
                  h.isBundle ? "bg-emerald-500/10" : ""
                }`}
                style={{ height: HANDLE_ROW_HEIGHT }}
              >
                <Icon
                  className={`shrink-0 w-4 h-4 ${h.isBundle ? "text-emerald-300" : "text-emerald-400"}`}
                />
                <span
                  className={`font-semibold flex-1 text-[11px] ${
                    h.isBundle ? "text-emerald-300" : "text-emerald-400"
                  }`}
                >
                  {h.label}
                </span>
                <span className="text-foreground text-[12px] font-mono font-bold tabular-nums">
                  {formatValue(h.id)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Output handles — absolutely positioned on the right edge,
          centered vertically on each reading row */}
      {!collapsed &&
        STOCK_HANDLES.map((h, i) => {
          const bottom = (STOCK_HANDLES.length - 1 - i) * HANDLE_ROW_HEIGHT + HANDLE_ROW_HEIGHT / 2;
          return (
            <Handle
              key={h.id}
              id={h.id}
              type="source"
              position={Position.Right}
              className={`!border-2 !border-background ${
                h.isBundle
                  ? "!w-5 !h-5 !bg-emerald-300"
                  : "!w-4 !h-4 !bg-emerald-400"
              }`}
              style={{ top: "auto", bottom }}
            />
          );
        })}
    </Card>
  );
}

export default StockModuleNode;
