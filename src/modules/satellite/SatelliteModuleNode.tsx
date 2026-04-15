import React, { useEffect, useState } from "react";
import { Position, NodeProps } from "reactflow";
import StereoHandles from "@/modules/base/StereoHandles";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Satellite, Play, Pause } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import type { SatelliteModule } from "./SatelliteModule";

interface SatelliteInfo {
  name: string;
  id: number;
  altitude: number;
  latitude: number;
  longitude: number;
  timestamp: number;
}

interface SatelliteData {
  type: "satellite";
  satellite: SatelliteInfo | null;
  volume: number;
  waveform: OscillatorType;
  isPlaying: boolean;
  collapsed: boolean;
  speed: number;
  altitude: number;
  latitude: number;
  longitude: number;
}

const WAVEFORM_OPTIONS: { value: OscillatorType; label: string }[] = [
  { value: "sine", label: "Sine" },
  { value: "square", label: "Square" },
  { value: "sawtooth", label: "Sawtooth" },
  { value: "triangle", label: "Triangle" },
];

const AUDIO_MAPPINGS = [
  { param: "Speed", maps: "Rhythm" },
  { param: "Altitude", maps: "Note" },
  { param: "Latitude", maps: "Pitch Var" },
  { param: "Longitude", maps: "Volume Var" },
];

function SatelliteModuleNode({ data, id }: NodeProps<SatelliteData>) {
  const {
    satellite,
    volume,
    waveform,
    isPlaying,
    collapsed,
  } = data;
  const { onRemove, onToggleCollapse, onUpdateParameter, onStart, onStop } = useModuleActions();

  // Live data from the audio module, pushed whenever the satellite feed updates.
  // Kept in local state so we re-render on each refresh without rewriting ReactFlow nodes.
  const [liveData, setLiveData] = useState({
    speed: data.speed ?? 0,
    altitude: satellite?.altitude ?? 0,
    latitude: satellite?.latitude ?? 0,
    longitude: satellite?.longitude ?? 0,
  });

  useEffect(() => {
    const module = audioGraphManager.getModule(id) as SatelliteModule | undefined;
    if (!module) return;
    module.setDataUpdateCallback((d) => setLiveData(d));
    return () => {
      module.setDataUpdateCallback(null);
    };
  }, [id]);

  const { speed, altitude, latitude, longitude } = liveData;
  const satName = satellite?.name ?? "No Satellite";
  const satId = satellite?.id != null ? String(satellite.id) : "--";

  return (
    <Card className="w-72 bg-background border border-border shadow-lg rounded-xl overflow-hidden">

      <ModuleHeader
        icon={<Satellite className="w-5 h-5" />}
        title={satName}
        subtitle={`ID: ${satId}`}
        collapsed={collapsed}
        onToggleCollapse={() => onToggleCollapse(id)}
        onRemove={() => onRemove(id)}
      />

      {!collapsed && (
        <div className="px-3 pb-3 space-y-3">
          {/* Play / Pause */}
          <Button
            size="sm"
            variant={isPlaying ? "secondary" : "default"}
            className="w-full"
            aria-label={isPlaying ? "Pause playback" : "Start playback"}
            onClick={() => (isPlaying ? onStop(id) : onStart(id))}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 mr-1.5" /> Pause
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 mr-1.5" /> Play
              </>
            )}
          </Button>

          {/* Data display 2x2 grid */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="flex flex-col items-center bg-muted/50 rounded-lg py-1.5 px-1">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                Speed
              </span>
              <Badge variant="secondary" className="text-[11px] mt-0.5">
                {speed.toFixed(1)} km/s
              </Badge>
            </div>
            <div className="flex flex-col items-center bg-muted/50 rounded-lg py-1.5 px-1">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                Altitude
              </span>
              <Badge variant="secondary" className="text-[11px] mt-0.5">
                {altitude.toFixed(1)} km
              </Badge>
            </div>
            <div className="flex flex-col items-center bg-muted/50 rounded-lg py-1.5 px-1">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                Latitude
              </span>
              <Badge variant="secondary" className="text-[11px] mt-0.5">
                {latitude.toFixed(2)}°
              </Badge>
            </div>
            <div className="flex flex-col items-center bg-muted/50 rounded-lg py-1.5 px-1">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                Longitude
              </span>
              <Badge variant="secondary" className="text-[11px] mt-0.5">
                {longitude.toFixed(2)}°
              </Badge>
            </div>
          </div>

          {/* Audio mappings */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Audio Mappings
            </label>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              {AUDIO_MAPPINGS.map((m) => (
                <div key={m.param} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{m.param}</span>
                  <span className="font-medium">{m.maps}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Waveform select */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Waveform
            </label>
            <Select
              value={waveform}
              onValueChange={(v) =>
                onUpdateParameter(id, "waveform", v)
              }
            >
              <SelectTrigger className="h-7 text-xs" aria-label="Select waveform">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WAVEFORM_OPTIONS.map((w) => (
                  <SelectItem key={w.value} value={w.value} className="text-xs">
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Volume slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Volume
              </label>
              <span className="text-[10px] text-muted-foreground">
                {Math.round(volume * 100)}%
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[Math.round(volume * 100)]}
              onValueChange={([v]) =>
                onUpdateParameter(id, "volume", v / 100)
              }
              aria-label="Volume"
            />
          </div>
        </div>
      )}

      <StereoHandles type="source" position={Position.Right} />
    </Card>
  );
}

export default SatelliteModuleNode;
