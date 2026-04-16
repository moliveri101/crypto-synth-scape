import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users, Hourglass, MapPin, Building, TrendingUp, Clock, Shield,
  Globe, Play, Square, AlertTriangle,
} from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import type { DeportationModule, DeportationSnapshot } from "./DeportationModule";

interface DeportationData {
  type: "deportation";
  isPlaying: boolean;
  collapsed: boolean;
}

// Row definitions — every row has (a) an icon, (b) a value formatter, and
// (c) a matching output handle id for downstream patching.
type RowDef = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  kind: "bundle" | "aggregate" | "rate" | "region" | "office";
};

const ROWS: RowDef[] = [
  { id: "out-all",             label: "ALL",       icon: Globe,       kind: "bundle" },
  // Aggregate
  { id: "out-total_removals",  label: "Removals",  icon: Users,       kind: "aggregate" },
  { id: "out-total_arrests",   label: "Arrests",   icon: Shield,      kind: "aggregate" },
  { id: "out-current_detained",label: "Detained",  icon: Hourglass,   kind: "aggregate" },
  // Rate
  { id: "out-per_day",         label: "Per Day",   icon: TrendingUp,  kind: "rate" },
  { id: "out-per_hour",        label: "Per Hour",  icon: Clock,       kind: "rate" },
  { id: "out-per_minute",      label: "Per Min",   icon: AlertTriangle, kind: "rate" },
  // Geographic
  { id: "out-region_mexico",          label: "Mexico",    icon: MapPin, kind: "region" },
  { id: "out-region_central_america", label: "C. Amer.",  icon: MapPin, kind: "region" },
  { id: "out-region_caribbean",       label: "Caribbean", icon: MapPin, kind: "region" },
  { id: "out-region_south_america",   label: "S. Amer.",  icon: MapPin, kind: "region" },
  { id: "out-region_asia",            label: "Asia",      icon: MapPin, kind: "region" },
  { id: "out-region_africa",          label: "Africa",    icon: MapPin, kind: "region" },
  { id: "out-region_europe",          label: "Europe",    icon: MapPin, kind: "region" },
  // Offices
  { id: "out-office_phoenix",     label: "Phoenix",    icon: Building, kind: "office" },
  { id: "out-office_san_antonio", label: "S. Antonio", icon: Building, kind: "office" },
  { id: "out-office_houston",     label: "Houston",    icon: Building, kind: "office" },
  { id: "out-office_dallas",      label: "Dallas",     icon: Building, kind: "office" },
  { id: "out-office_chicago",     label: "Chicago",    icon: Building, kind: "office" },
  { id: "out-office_miami",       label: "Miami",      icon: Building, kind: "office" },
  { id: "out-office_el_paso",     label: "El Paso",    icon: Building, kind: "office" },
  { id: "out-office_newark",      label: "Newark",     icon: Building, kind: "office" },
];

// Compact count formatting (e.g. "271K", "1.2M")
function formatCount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return (value / 1_000_000).toFixed(2) + "M";
  if (abs >= 1_000)     return (value / 1_000).toFixed(1) + "K";
  return Math.round(value).toString();
}

function formatRate(value: number, suffix: string): string {
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}/${suffix}`;
}

function DeportationModuleNode({ data, id }: NodeProps<DeportationData>) {
  const { onRemove, onToggleCollapse, onStart, onStop } = useModuleActions();
  const { isPlaying, collapsed } = data;

  const [snapshot, setSnapshot] = useState<DeportationSnapshot | null>(null);
  const [flashKey, setFlashKey] = useState<Record<string, number>>({});
  const lastValues = useRef<Record<string, string>>({});

  useEffect(() => {
    const module = audioGraphManager.getModule(id) as DeportationModule | undefined;
    if (!module) return;
    module.setOnSnapshotUpdate((s) => setSnapshot({
      ...s,
      byRegion: { ...s.byRegion },
      byOffice: { ...s.byOffice },
    }));
    const initial = module.getSnapshot();
    setSnapshot({
      ...initial,
      byRegion: { ...initial.byRegion },
      byOffice: { ...initial.byOffice },
    });
    return () => { module.setOnSnapshotUpdate(null); };
  }, [id]);

  const formatValue = (row: RowDef): string => {
    if (!snapshot) return "—";
    switch (row.id) {
      case "out-all": return `${ROWS.length - 1} fields`;
      case "out-total_removals":   return formatCount(snapshot.totalRemovals);
      case "out-total_arrests":    return formatCount(snapshot.totalArrests);
      case "out-current_detained": return formatCount(snapshot.currentDetained);
      case "out-per_day":    return formatRate(snapshot.perDay, "d");
      case "out-per_hour":   return formatRate(snapshot.perHour, "h");
      case "out-per_minute": return formatRate(snapshot.perMinute, "m");
      default:
        // Region or office — look up in byRegion or byOffice
        const regionMatch = row.id.match(/^out-region_(.+)$/);
        if (regionMatch) return formatCount(snapshot.byRegion[regionMatch[1]] ?? 0);
        const officeMatch = row.id.match(/^out-office_(.+)$/);
        if (officeMatch) return formatCount(snapshot.byOffice[officeMatch[1]] ?? 0);
        return "—";
    }
  };

  const HANDLE_ROW_HEIGHT = 40;

  return (
    <Card
      className="bg-background border border-red-500/40 shadow-lg rounded-xl overflow-hidden relative"
      style={{ minWidth: 320 }}
    >
      <style>{`
        @keyframes deport-flash {
          0%   { color: rgb(248 113 113); text-shadow: 0 0 8px rgb(248 113 113 / 0.8); }
          100% { color: hsl(var(--foreground)); text-shadow: none; }
        }
      `}</style>

      <div className="p-3 space-y-2">
        <ModuleHeader
          id={id}
          title="DEPORTATION TRACKER"
          subtitle="ICE enforcement scale & rate"
          icon={<AlertTriangle className="w-5 h-5 text-red-400" />}
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
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span className="text-[10px] text-muted-foreground flex-1">
              Extrapolating from ICE ERO FY-rate baselines
            </span>
          </div>
        )}
      </div>

      {/* Edge-to-edge reading rows — like US Debt + Vitals */}
      {!collapsed && (
        <div className="border-t border-border">
          {ROWS.map((row) => {
            const Icon = row.icon;
            const val = formatValue(row);
            if (lastValues.current[row.id] !== val) {
              lastValues.current[row.id] = val;
              queueMicrotask(() =>
                setFlashKey((k) => ({ ...k, [row.id]: (k[row.id] ?? 0) + 1 }))
              );
            }
            const fk = flashKey[row.id] ?? 0;

            // Color / background variant per category
            const bgClass =
              row.kind === "bundle" ? "bg-red-500/10" :
              row.kind === "aggregate" ? "bg-red-500/5" :
              row.kind === "rate" ? "" :
              row.kind === "region" ? "bg-amber-500/5" :
              "bg-orange-500/5";
            const labelColor =
              row.kind === "bundle" ? "text-red-300" :
              row.kind === "region" ? "text-amber-400" :
              row.kind === "office" ? "text-orange-400" :
              "text-red-400";
            const iconColor =
              row.kind === "bundle" ? "text-red-300" :
              row.kind === "region" ? "text-amber-400" :
              row.kind === "office" ? "text-orange-400" :
              "text-red-400";
            return (
              <div
                key={row.id}
                className={`flex items-center gap-2 px-3 border-b border-border last:border-b-0 ${bgClass}`}
                style={{ height: HANDLE_ROW_HEIGHT }}
              >
                <Icon className={`shrink-0 w-4 h-4 ${iconColor}`} />
                <span className={`font-semibold flex-1 text-[11px] ${labelColor}`}>
                  {row.label}
                </span>
                <span
                  key={fk}
                  className="text-foreground text-[13px] font-mono font-bold"
                  style={{ animation: "deport-flash 400ms ease-out" }}
                >
                  {val}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Output handles on the right edge, aligned with each row */}
      {!collapsed &&
        ROWS.map((row, i) => {
          const bottom = (ROWS.length - 1 - i) * HANDLE_ROW_HEIGHT + HANDLE_ROW_HEIGHT / 2;
          const color =
            row.kind === "bundle" ? "!bg-red-300" :
            row.kind === "region" ? "!bg-amber-400" :
            row.kind === "office" ? "!bg-orange-400" :
            "!bg-red-400";
          return (
            <Handle
              key={row.id}
              id={row.id}
              type="source"
              position={Position.Right}
              className={`!border-2 !border-background ${color} ${
                row.kind === "bundle" ? "!w-5 !h-5 !rounded-sm" : "!w-3.5 !h-3.5"
              }`}
              style={{ top: "auto", bottom }}
            />
          );
        })}
    </Card>
  );
}

export default DeportationModuleNode;
