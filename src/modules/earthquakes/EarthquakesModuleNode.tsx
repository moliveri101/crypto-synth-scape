import { useEffect, useState } from "react";
import { Position, NodeProps } from "reactflow";
import StereoHandles from "@/modules/base/StereoHandles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play, Square, Zap, Activity } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import type { EarthquakesModule, Quake, FeedWindow } from "./EarthquakesModule";

interface EarthquakesData {
  type: "earthquakes";
  window: FeedWindow;
  minMagnitude: number;
  isPlaying: boolean;
  collapsed: boolean;
}

const WINDOW_OPTIONS: { value: FeedWindow; label: string }[] = [
  { value: "hour", label: "Past Hour" },
  { value: "day", label: "Past Day" },
  { value: "week", label: "Past Week" },
];

function magnitudeColor(mag: number): string {
  if (mag >= 6) return "text-red-400";
  if (mag >= 4.5) return "text-orange-400";
  if (mag >= 3) return "text-yellow-400";
  return "text-muted-foreground";
}

function EarthquakesModuleNode({ data, id }: NodeProps<EarthquakesData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter, onAction, onStart, onStop } = useModuleActions();
  const { window: feedWindow, minMagnitude, isPlaying, collapsed } = data;

  const [quakes, setQuakes] = useState<Quake[]>([]);

  // Subscribe to the audio module's quake list for UI display
  useEffect(() => {
    const module = audioGraphManager.getModule(id) as EarthquakesModule | undefined;
    if (!module) return;
    module.setOnQuakesUpdate((qs) => setQuakes(qs.slice(0, 8)));
    // Seed with any existing data
    setQuakes(module.getRecentQuakes().slice(0, 8));
    return () => {
      module.setOnQuakesUpdate(null);
    };
  }, [id]);

  return (
    <Card className="bg-background border border-red-500/40 shadow-lg rounded-none overflow-hidden" style={{ minWidth: 300 }}>
      <StereoHandles type="source" position={Position.Right} className="!bg-red-400" />

      <div className="p-3 space-y-3">
        <ModuleHeader
          id={id}
          title="EARTHQUAKES"
          icon={<Zap className="w-5 h-5 text-red-400" />}
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
            <div className="flex items-center gap-2 nodrag nopan">
              <div className="flex-1">
                <Label className="text-[10px] text-muted-foreground">Feed</Label>
                <Select
                  value={feedWindow}
                  onValueChange={(v) => onUpdateParameter(id, "window", v)}
                >
                  <SelectTrigger className="h-7 text-[11px]" onPointerDown={(e) => e.stopPropagation()}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WINDOW_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px] gap-1"
                onClick={() => onAction(id, "triggerPulse")}
                aria-label="Test pulse"
              >
                Test
              </Button>
            </div>

            <div className="nodrag nopan">
              <Label className="text-[10px] text-muted-foreground">
                Min Magnitude: {minMagnitude.toFixed(1)}
              </Label>
              <Slider
                value={[minMagnitude]}
                onValueChange={([v]) => onUpdateParameter(id, "minMagnitude", v)}
                min={0}
                max={8}
                step={0.1}
                aria-label="Minimum magnitude"
              />
            </div>

            <div className="border-t border-border pt-2">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-3 h-3 text-red-400" />
                <Label className="text-[10px] text-muted-foreground">
                  {quakes.length > 0 ? `${quakes.length} recent quake${quakes.length === 1 ? "" : "s"}` : "Waiting for data..."}
                </Label>
              </div>
              <div className="space-y-1 max-h-[160px] overflow-y-auto nodrag nopan nowheel">
                {quakes.map((q) => (
                  <div
                    key={q.id}
                    className="flex items-center gap-2 text-[10px] bg-secondary/40 rounded px-2 py-1"
                  >
                    <span className={`font-mono font-bold ${magnitudeColor(q.magnitude)}`}>
                      {q.magnitude.toFixed(1)}
                    </span>
                    <span className="truncate flex-1 text-foreground/80">{q.place}</span>
                    <span className="text-muted-foreground">{Math.round(q.depth)}km</span>
                  </div>
                ))}
                {quakes.length === 0 && isPlaying && (
                  <div className="text-[10px] text-muted-foreground italic text-center py-2">
                    Polling USGS...
                  </div>
                )}
              </div>
            </div>

            <div className="text-[9px] text-muted-foreground italic border-t border-border pt-2">
              Each new quake emits an audio pulse.
              Route to a Data Drum Machine voice input to trigger drums.
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export default EarthquakesModuleNode;
