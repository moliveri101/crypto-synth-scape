import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Play, Square, Building2, DollarSign, Users, User, TrendingUp, Layers, Percent,
} from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import type { USDebtModule, USDebtSnapshot } from "./USDebtModule";

interface USDebtData {
  type: "us-debt";
  isPlaying: boolean;
  collapsed: boolean;
}

const DEBT_HANDLES: Array<{
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isBundle?: boolean;
}> = [
  { id: "out-all",             label: "ALL",      icon: Layers,      isBundle: true },
  { id: "out-total_debt",      label: "Total",    icon: DollarSign },
  { id: "out-per_citizen",     label: "Per Cit.", icon: Users },
  { id: "out-per_taxpayer",    label: "Per Tax.", icon: User },
  { id: "out-growth_rate",     label: "Rate/s",   icon: TrendingUp },
  { id: "out-annual_interest", label: "Interest", icon: Building2 },
  { id: "out-debt_to_gdp",     label: "Debt/GDP", icon: Percent },
];

// Compact money formatting (e.g. "$36.82T", "$112.4K/s")
function formatMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3)  return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function USDebtModuleNode({ data, id }: NodeProps<USDebtData>) {
  const { onRemove, onToggleCollapse, onStart, onStop } = useModuleActions();
  const { isPlaying, collapsed } = data;

  const [snapshot, setSnapshot] = useState<USDebtSnapshot | null>(null);
  // Track per-field flash pulses — bump counter each time the formatted
  // value string changes, so the CSS animation restarts.
  const [flashKey, setFlashKey] = useState<Record<string, number>>({});
  const lastValues = useRef<Record<string, string>>({});

  useEffect(() => {
    const module = audioGraphManager.getModule(id) as USDebtModule | undefined;
    if (!module) return;
    module.setOnSnapshotUpdate((s) => setSnapshot({ ...s }));
    setSnapshot({ ...module.getSnapshot() });
    return () => {
      module.setOnSnapshotUpdate(null);
    };
  }, [id]);

  const formatValue = (hid: string): string => {
    if (!snapshot) return "—";
    switch (hid) {
      case "out-all":             return "6 fields";
      case "out-total_debt":      return formatMoney(snapshot.totalDebt);
      case "out-per_citizen":     return formatMoney(snapshot.perCitizen);
      case "out-per_taxpayer":    return formatMoney(snapshot.perTaxpayer);
      case "out-growth_rate":     return `${formatMoney(snapshot.growthPerSecond)}/s`;
      case "out-annual_interest": return `${formatMoney(snapshot.annualInterest)}/yr`;
      case "out-debt_to_gdp":     return `${((snapshot.totalDebt / 30_000_000_000_000) * 100).toFixed(0)}%`;
      default: return "—";
    }
  };

  const HANDLE_ROW_HEIGHT = 52;

  return (
    <Card
      className="bg-background border border-amber-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 280 }}
    >
      <style>{`
        @keyframes usdebt-flash {
          0%   { color: rgb(252 211 77); text-shadow: 0 0 8px rgb(252 211 77 / 0.8); }
          100% { color: hsl(var(--foreground)); text-shadow: none; }
        }
      `}</style>
      <div className="p-3 space-y-2">
        <ModuleHeader
          id={id}
          title="US DEBT"
          subtitle="Treasury fiscal data"
          icon={<Building2 className="w-5 h-5 text-amber-400" />}
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
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[10px] text-muted-foreground flex-1">
              Polling fiscaldata.treasury.gov
            </span>
          </div>
        )}
      </div>

      {/* Edge-to-edge reading rows */}
      {!collapsed && (
        <div className="border-t border-border">
          {DEBT_HANDLES.map((h) => {
            const Icon = h.icon;
            const val = formatValue(h.id);
            if (lastValues.current[h.id] !== val) {
              lastValues.current[h.id] = val;
              // Schedule a flash bump on next tick (avoid setState in render)
              queueMicrotask(() =>
                setFlashKey((k) => ({ ...k, [h.id]: (k[h.id] ?? 0) + 1 }))
              );
            }
            const fk = flashKey[h.id] ?? 0;
            return (
              <div
                key={h.id}
                className={`flex items-center gap-2 px-3 border-b border-border last:border-b-0 ${
                  h.isBundle ? "bg-amber-500/10" : ""
                }`}
                style={{ height: HANDLE_ROW_HEIGHT }}
              >
                <Icon
                  className={`shrink-0 w-5 h-5 ${h.isBundle ? "text-amber-300" : "text-amber-400"}`}
                />
                <span
                  className={`font-bold flex-1 ${
                    h.isBundle ? "text-amber-300 text-xl" : "text-amber-400 text-lg"
                  }`}
                >
                  {h.label}
                </span>
                <span
                  key={fk}
                  className="text-foreground text-xl font-mono font-bold transition-colors"
                  style={{ animation: "usdebt-flash 400ms ease-out" }}
                >
                  {val}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Output handles — absolutely positioned on the right edge,
          centered vertically on each row via bottom offset. */}
      {!collapsed &&
        DEBT_HANDLES.map((h, i) => {
          const bottom = (DEBT_HANDLES.length - 1 - i) * HANDLE_ROW_HEIGHT + HANDLE_ROW_HEIGHT / 2;
          return (
            <Handle
              key={h.id}
              id={h.id}
              type="source"
              position={Position.Right}
              className={`!border-2 !border-background ${
                h.isBundle
                  ? "!w-5 !h-5 !bg-amber-300 !rounded-none"
                  : "!w-4 !h-4 !bg-amber-400"
              }`}
              style={{ top: "auto", bottom }}
            />
          );
        })}
    </Card>
  );
}

export default USDebtModuleNode;
