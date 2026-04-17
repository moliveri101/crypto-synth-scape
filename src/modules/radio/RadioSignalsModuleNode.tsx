import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Play, Square, Radio, Wind, Atom, Magnet, Compass,
  Zap, Sun, Signal, Layers,
} from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import type { RadioSignalsModule, RadioSnapshot } from "./RadioSignalsModule";

interface RadioData {
  type: "radio-signals";
  volume: number;
  isPlaying: boolean;
  collapsed: boolean;
}

type RowDef = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isBundle?: boolean;
};

const ROWS: RowDef[] = [
  { id: "out-all",          label: "ALL",        icon: Layers, isBundle: true },
  // Solar wind
  { id: "out-wind_speed",   label: "Wind Speed", icon: Wind },
  { id: "out-wind_density", label: "Density",    icon: Atom },
  { id: "out-wind_temp",    label: "Wind Temp",  icon: Zap },
  // IMF
  { id: "out-bt",           label: "Bt",         icon: Magnet },
  { id: "out-bz",           label: "Bz",         icon: Compass },
  { id: "out-bz_south",     label: "Bz South",   icon: Compass },
  // Geomagnetic
  { id: "out-kp",           label: "Kp",         icon: Signal },
  // Solar radiation
  { id: "out-xray_flux",    label: "X-ray",      icon: Sun },
  { id: "out-f107",         label: "F10.7",      icon: Radio },
];

const ROW_HEIGHT = 36;

// ─── Formatters — show each field in its natural units ──────────────────

function formatKmS(v: number): string { return v.toFixed(0) + " km/s"; }
function formatDensity(v: number): string { return v.toFixed(1) + "/cm³"; }
function formatTemp(v: number): string {
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M K";
  if (v >= 1e3) return (v / 1e3).toFixed(0) + "K K";
  return v.toFixed(0) + " K";
}
function formatNT(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(1) + " nT";
}
function formatKp(v: number): string {
  return v.toFixed(1);
}
function formatXray(v: number): string {
  // NOAA flare classes: A (<1e-7), B (1e-7), C (1e-6), M (1e-5), X (1e-4)
  if (v >= 1e-4) return "X" + (v / 1e-4).toFixed(1);
  if (v >= 1e-5) return "M" + (v / 1e-5).toFixed(1);
  if (v >= 1e-6) return "C" + (v / 1e-6).toFixed(1);
  if (v >= 1e-7) return "B" + (v / 1e-7).toFixed(1);
  return "A" + (v / 1e-8).toFixed(1);
}
function formatSFU(v: number): string { return v.toFixed(0) + " SFU"; }

function RadioSignalsModuleNode({ data, id }: NodeProps<RadioData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter, onStart, onStop } = useModuleActions();
  const { volume, isPlaying, collapsed } = data;

  const [snapshot, setSnapshot] = useState<RadioSnapshot | null>(null);
  const [flashKey, setFlashKey] = useState<Record<string, number>>({});
  const lastValues = useRef<Record<string, string>>({});

  useEffect(() => {
    const module = audioGraphManager.getModule(id) as RadioSignalsModule | undefined;
    if (!module) return;
    module.setOnSnapshotUpdate((s) => setSnapshot({ ...s }));
    setSnapshot({ ...module.getSnapshot() });
    return () => { module.setOnSnapshotUpdate(null); };
  }, [id]);

  const formatValue = (rowId: string): string => {
    if (!snapshot) return "—";
    switch (rowId) {
      case "out-all":          return `${ROWS.length - 1} fields`;
      case "out-wind_speed":   return formatKmS(snapshot.windSpeed);
      case "out-wind_density": return formatDensity(snapshot.windDensity);
      case "out-wind_temp":    return formatTemp(snapshot.windTemp);
      case "out-bt":           return formatNT(snapshot.bt);
      case "out-bz":           return formatNT(snapshot.bz);
      case "out-bz_south":     return formatNT(-Math.min(0, snapshot.bz));
      case "out-kp":           return formatKp(snapshot.kp);
      case "out-xray_flux":    return formatXray(snapshot.xrayFlux);
      case "out-f107":         return formatSFU(snapshot.f107);
      default: return "—";
    }
  };

  // Storm threshold styling — when Kp≥5 we're in G1+ geomagnetic storm
  const stormActive = (snapshot?.kp ?? 0) >= 5;

  return (
    <Card
      className="bg-background border border-purple-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 320 }}
    >
      <style>{`
        @keyframes radio-flash {
          0%   { color: rgb(192 132 252); text-shadow: 0 0 8px rgb(192 132 252 / 0.7); }
          100% { color: hsl(var(--foreground)); text-shadow: none; }
        }
      `}</style>

      <div className="p-3 space-y-2">
        <ModuleHeader
          id={id}
          title="RADIO SIGNALS"
          subtitle={snapshot?.isLive ? "Live NOAA SWPC" : "Space weather"}
          icon={<Radio className="w-5 h-5 text-purple-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        >
          <Button
            size="sm"
            variant={isPlaying ? "destructive" : "default"}
            className="h-7 px-3"
            aria-label={isPlaying ? "Stop drone" : "Start drone"}
            onClick={() => (isPlaying ? onStop(id) : onStart(id))}
          >
            {isPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </Button>
        </ModuleHeader>

        {!collapsed && (
          <>
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  snapshot?.isLive ? "bg-purple-400 animate-pulse" : "bg-muted-foreground/50"
                }`}
              />
              <span className="text-[10px] text-muted-foreground flex-1">
                {snapshot?.isLive
                  ? "Polling DSCOVR, GOES, NOAA feeds"
                  : "Waiting for first response…"}
              </span>
              {stormActive && (
                <span className="text-[10px] font-bold text-red-400 animate-pulse">
                  ⚠ STORM
                </span>
              )}
            </div>

            {/* Audio drone volume — only the built-in Kp-driven drone */}
            <div className="nodrag nopan">
              <Label className="text-[9px] text-muted-foreground">
                Drone Volume: {Math.round(volume * 100)}%
              </Label>
              <Slider
                value={[volume * 100]}
                onValueChange={([v]) => onUpdateParameter(id, "volume", v / 100)}
                max={100}
                step={1}
                aria-label="Volume"
              />
            </div>
          </>
        )}
      </div>

      {/* Edge-to-edge reading rows */}
      {!collapsed && (
        <div className="border-t border-border">
          {ROWS.map((row) => {
            const Icon = row.icon;
            const val = formatValue(row.id);
            if (lastValues.current[row.id] !== val) {
              lastValues.current[row.id] = val;
              queueMicrotask(() =>
                setFlashKey((k) => ({ ...k, [row.id]: (k[row.id] ?? 0) + 1 }))
              );
            }
            const fk = flashKey[row.id] ?? 0;
            return (
              <div
                key={row.id}
                className={`flex items-center gap-2 px-3 border-b border-border last:border-b-0 ${
                  row.isBundle ? "bg-purple-500/10" : ""
                }`}
                style={{ height: ROW_HEIGHT }}
              >
                <Icon className={`shrink-0 w-4 h-4 ${row.isBundle ? "text-purple-300" : "text-purple-400"}`} />
                <span className={`font-semibold flex-1 text-[11px] ${row.isBundle ? "text-purple-300" : "text-purple-400"}`}>
                  {row.label}
                </span>
                <span
                  key={fk}
                  className="text-foreground text-[12px] font-mono font-bold tabular-nums"
                  style={{ animation: "radio-flash 400ms ease-out" }}
                >
                  {val}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Output handles on right edge */}
      {!collapsed &&
        ROWS.map((row, i) => {
          const bottom = (ROWS.length - 1 - i) * ROW_HEIGHT + ROW_HEIGHT / 2;
          return (
            <Handle
              key={row.id}
              id={row.id}
              type="source"
              position={Position.Right}
              className={`!border-2 !border-background ${
                row.isBundle ? "!w-5 !h-5 !bg-purple-300" : "!w-4 !h-4 !bg-purple-400"
              }`}
              style={{ top: "auto", bottom }}
            />
          );
        })}
    </Card>
  );
}

export default RadioSignalsModuleNode;
