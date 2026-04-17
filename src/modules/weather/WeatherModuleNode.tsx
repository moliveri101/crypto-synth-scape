import { useEffect, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Play, Square, Cloud, Search, Thermometer, Wind, Droplets, Gauge, CloudRain, Layers,
} from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import type { WeatherModule, WeatherSnapshot, Location } from "./WeatherModule";

interface WeatherData {
  type: "weather";
  locationName: string;
  latitude: number;
  longitude: number;
  audioEnabled: boolean;
  isPlaying: boolean;
  collapsed: boolean;
}

// Per-field output handles. "ALL" carries the full data bundle for consumers
// that want to pick fields themselves (e.g. the Data Drum Machine dropdown).
const WEATHER_HANDLES: Array<{
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isBundle?: boolean;
}> = [
  { id: "out-all",           label: "ALL",      icon: Layers,      isBundle: true },
  { id: "out-temperature",   label: "Temp",     icon: Thermometer },
  { id: "out-humidity",      label: "Humidity", icon: Droplets },
  { id: "out-wind",          label: "Wind",     icon: Wind },
  { id: "out-pressure",      label: "Pressure", icon: Gauge },
  { id: "out-clouds",        label: "Clouds",   icon: Cloud },
  { id: "out-precipitation", label: "Precip",   icon: CloudRain },
];

async function geocode(query: string): Promise<Location | null> {
  if (!query.trim()) return null;
  try {
    const resp = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1`,
    );
    if (!resp.ok) return null;
    const json: any = await resp.json();
    const hit = json?.results?.[0];
    if (!hit) return null;
    return {
      name: `${hit.name}${hit.country ? ", " + hit.country : ""}`,
      latitude: hit.latitude,
      longitude: hit.longitude,
    };
  } catch {
    return null;
  }
}

function WeatherModuleNode({ data, id }: NodeProps<WeatherData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter, onStart, onStop } = useModuleActions();
  const { locationName, audioEnabled, isPlaying, collapsed } = data;

  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(null);
  const [currentLoc, setCurrentLoc] = useState<Location>({
    name: locationName,
    latitude: data.latitude,
    longitude: data.longitude,
  });
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const module = audioGraphManager.getModule(id) as WeatherModule | undefined;
    if (!module) return;
    module.setOnSnapshotUpdate((s, loc) => {
      setSnapshot(s);
      setCurrentLoc(loc);
    });
    setSnapshot(module.getSnapshot());
    setCurrentLoc(module.getLocation());
    return () => {
      module.setOnSnapshotUpdate(null);
    };
  }, [id]);

  const applySearch = async () => {
    setSearching(true);
    try {
      const loc = await geocode(search);
      if (loc) {
        onUpdateParameter(id, "location", loc);
        onUpdateParameter(id, "locationName", loc.name);
        onUpdateParameter(id, "latitude", loc.latitude);
        onUpdateParameter(id, "longitude", loc.longitude);
        setSearch("");
      }
    } finally {
      setSearching(false);
    }
  };

  const formatValue = (hid: string): string => {
    if (!snapshot) return "—";
    switch (hid) {
      case "out-all":           return "6 fields";
      case "out-temperature":   return `${snapshot.temperature.toFixed(1)}°C`;
      case "out-humidity":      return `${Math.round(snapshot.humidity)}%`;
      case "out-wind":          return `${snapshot.windSpeed.toFixed(1)} m/s`;
      case "out-pressure":      return `${Math.round(snapshot.pressure)} hPa`;
      case "out-clouds":        return `${Math.round(snapshot.cloudCover)}%`;
      case "out-precipitation": return `${snapshot.precipitation.toFixed(1)} mm`;
      default: return "—";
    }
  };

  // Tall rows so each reading is readable at a glance
  const HANDLE_ROW_HEIGHT = 52;
  const handlesBlockHeight = WEATHER_HANDLES.length * HANDLE_ROW_HEIGHT;

  return (
    <Card
      className="bg-background border border-cyan-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 260 }}
    >
      <div className="p-3 space-y-2">
        <ModuleHeader
          id={id}
          title="WEATHER"
          subtitle={currentLoc.name}
          icon={<Cloud className="w-5 h-5 text-cyan-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        >
          <Button
            size="sm"
            variant={isPlaying ? "destructive" : "default"}
            className="h-7 px-3"
            aria-label={isPlaying ? "Stop polling" : "Start polling"}
            onClick={() => (isPlaying ? onStop(id) : onStart(id))}
          >
            {isPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </Button>
        </ModuleHeader>

        {!collapsed && (
          <>
            {/* Location search */}
            <div className="flex gap-1 nodrag nopan">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  className="h-7 pl-7 text-[11px]"
                  placeholder="Search city..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applySearch();
                  }}
                  aria-label="Search city"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px]"
                onClick={applySearch}
                disabled={searching}
              >
                {searching ? "..." : "Go"}
              </Button>
            </div>

            {/* Connection status */}
            <div className="flex items-center gap-2 nodrag nopan">
              <span
                className={`w-2 h-2 rounded-full ${
                  isPlaying ? "bg-green-400 animate-pulse" : "bg-muted-foreground/50"
                }`}
              />
              <span className="text-[10px] text-muted-foreground flex-1">
                {isPlaying ? "Polling Open-Meteo (5 min)" : "Not polling"}
              </span>
            </div>

            {/* Drone audio toggle */}
            <div className="flex items-center justify-between border-t border-border pt-2 nodrag nopan">
              <Label className="text-[10px] text-muted-foreground flex-1">
                Drone audio
              </Label>
              <Switch
                checked={audioEnabled}
                onCheckedChange={(v) => onUpdateParameter(id, "audioEnabled", v)}
                aria-label="Enable drone audio"
              />
            </div>
          </>
        )}
      </div>

      {/* Edge-to-edge reading rows (no side padding). Each row is a
          horizontal strip spanning the full card width. Handles sit on
          the right edge, vertically centered on the row. */}
      {!collapsed && (
        <div className="border-t border-border">
          {WEATHER_HANDLES.map((h) => {
            const Icon = h.icon;
            return (
              <div
                key={h.id}
                className={`flex items-center gap-2 px-3 border-b border-border last:border-b-0 ${
                  h.isBundle ? "bg-cyan-500/10" : ""
                }`}
                style={{ height: HANDLE_ROW_HEIGHT }}
              >
                <Icon
                  className={`shrink-0 w-5 h-5 ${h.isBundle ? "text-cyan-300" : "text-cyan-400"}`}
                />
                <span
                  className={`font-bold flex-1 ${
                    h.isBundle ? "text-cyan-300 text-xl" : "text-cyan-400 text-lg"
                  }`}
                >
                  {h.label}
                </span>
                <span className="text-foreground text-xl font-mono font-bold">
                  {formatValue(h.id)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Output handles — absolutely positioned at the right edge,
          aligned to each row's vertical center via bottom offset. */}
      {!collapsed &&
        WEATHER_HANDLES.map((h, i) => {
          const bottom = (WEATHER_HANDLES.length - 1 - i) * HANDLE_ROW_HEIGHT + HANDLE_ROW_HEIGHT / 2;
          return (
            <Handle
              key={h.id}
              id={h.id}
              type="source"
              position={Position.Right}
              className={`!border-2 !border-background ${
                h.isBundle
                  ? "!w-5 !h-5 !bg-cyan-300 !rounded-none"
                  : "!w-4 !h-4 !bg-cyan-400"
              }`}
              style={{ top: "auto", bottom }}
            />
          );
        })}
    </Card>
  );
}

export default WeatherModuleNode;
