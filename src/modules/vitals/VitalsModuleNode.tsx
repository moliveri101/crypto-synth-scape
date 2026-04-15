import { useEffect, useState, useRef } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play, Square, Heart, Watch } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import type { VitalsModule, VitalsSnapshot, ActivityLevel } from "./VitalsModule";

interface VitalsData {
  type: "vitals";
  activityLevel: ActivityLevel;
  apiKey: string;
  isPlaying: boolean;
  collapsed: boolean;
}

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: "resting", label: "Resting" },
  { value: "light", label: "Light Activity" },
  { value: "moderate", label: "Moderate" },
  { value: "vigorous", label: "Vigorous" },
];

// Per-vital output handles. The first one ("out-all") carries the full
// dataset so consumers (drum machine, translators) can pick any field from a
// single patch cord. The rest carry one vital each for focused routing.
const VITAL_HANDLES = [
  { id: "out-all",         label: "ALL",     isBundle: true },
  { id: "out-heart_rate",  label: "HR" },
  { id: "out-hrv",         label: "HRV" },
  { id: "out-breathing",   label: "Breath" },
  { id: "out-temperature", label: "Temp" },
  { id: "out-spo2",        label: "SpO₂" },
  { id: "out-stress",      label: "Stress" },
  { id: "out-recovery",    label: "Recov" },
  { id: "out-activity",    label: "Activity" },
];

function VitalsModuleNode({ data, id }: NodeProps<VitalsData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter, onAction, onStart, onStop } = useModuleActions();
  const { activityLevel, apiKey, isPlaying, collapsed } = data;

  const [snapshot, setSnapshot] = useState<VitalsSnapshot | null>(null);
  const [activity, setActivity] = useState(0);
  const [pulseFlash, setPulseFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    const module = audioGraphManager.getModule(id) as VitalsModule | undefined;
    if (!module) return;
    module.setOnSnapshotUpdate((s, a) => {
      setSnapshot({ ...s });
      setActivity(a);
    });
    setSnapshot({ ...module.getSnapshot() });
    setActivity(module.getActivityValue());
    return () => {
      module.setOnSnapshotUpdate(null);
    };
  }, [id]);

  // Heartbeat flash — pulse the heart icon at the current BPM
  useEffect(() => {
    if (!isPlaying || !snapshot) return;
    const interval = (60 / Math.max(30, snapshot.heartRate)) * 1000;
    const timer = window.setInterval(() => {
      setPulseFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setPulseFlash(false), 100);
    }, interval);
    return () => {
      clearInterval(timer);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, [isPlaying, snapshot?.heartRate]);

  const formatValue = (hid: string): string => {
    if (!snapshot) return "—";
    switch (hid) {
      case "out-all":         return "8 fields";
      case "out-heart_rate":  return `${Math.round(snapshot.heartRate)} bpm`;
      case "out-hrv":         return `${Math.round(snapshot.hrv)} ms`;
      case "out-breathing":   return `${snapshot.breathing.toFixed(1)} br/min`;
      case "out-temperature": return `${snapshot.temperature.toFixed(1)}°C`;
      case "out-spo2":        return `${snapshot.spo2.toFixed(1)}%`;
      case "out-stress":      return `${Math.round(snapshot.stress)}`;
      case "out-recovery":    return `${Math.round(snapshot.recovery)}`;
      case "out-activity":    return activity.toFixed(2);
      default: return "—";
    }
  };

  // Height of the full (expanded) card is proportional to the handle count.
  // Tall rows so each vital reads like a dashboard gauge.
  const HANDLE_ROW_HEIGHT = 48;
  const handlesBlockHeight = VITAL_HANDLES.length * HANDLE_ROW_HEIGHT;

  return (
    <Card
      className="bg-background border border-pink-500/40 shadow-lg rounded-xl overflow-hidden relative"
      style={{ minWidth: 260 }}
    >
      <div className="p-3 space-y-2">
        <ModuleHeader
          id={id}
          title="VITALS"
          subtitle="Hume Health"
          icon={
            <Heart
              className={`w-5 h-5 text-pink-400 transition-transform duration-100 ${
                pulseFlash ? "scale-125" : "scale-100"
              }`}
              fill={pulseFlash && isPlaying ? "currentColor" : "none"}
            />
          }
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        >
          <Button
            size="sm"
            variant={isPlaying ? "destructive" : "default"}
            className="h-7 px-3"
            aria-label={isPlaying ? "Disconnect" : "Connect device"}
            onClick={() => (isPlaying ? onStop(id) : onStart(id))}
          >
            {isPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </Button>
        </ModuleHeader>

        {!collapsed && (
          <>
            {/* Connection + API key in one compact row */}
            <div className="nodrag nopan space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isPlaying ? "bg-green-400 animate-pulse" : "bg-muted-foreground/50"
                  }`}
                />
                <span className="text-[9px] text-muted-foreground flex-1">
                  {isPlaying ? "Connected (sim)" : "Disconnected"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 text-[9px] px-1"
                  onClick={() => onAction(id, "triggerPulse")}
                  aria-label="Test pulse"
                >
                  Test
                </Button>
              </div>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => onUpdateParameter(id, "apiKey", e.target.value)}
                placeholder="hume_xxxxxxxxxxxx"
                className="w-full h-6 px-2 text-[10px] bg-secondary border border-border rounded font-mono"
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Hume Health API key"
              />
            </div>

            {/* Activity selector */}
            <div className="nodrag nopan">
              <Label className="text-[9px] text-muted-foreground">Activity</Label>
              <Select
                value={activityLevel}
                onValueChange={(v) => onUpdateParameter(id, "activityLevel", v)}
              >
                <SelectTrigger className="h-6 text-[10px]" onPointerDown={(e) => e.stopPropagation()}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reserve vertical space for the per-handle labels so they don't overlap */}
            <div style={{ height: handlesBlockHeight }} />
          </>
        )}
      </div>

      {/* Per-vital output handles + inline labels on the right edge.
          Only rendered when expanded so the labels don't bleed over a collapsed header. */}
      {!collapsed &&
        VITAL_HANDLES.map((h, i) => {
          // Distribute handles across the bottom portion of the card
          // (after the controls). Total handles fill handlesBlockHeight.
          const fromBottom = (VITAL_HANDLES.length - i) * HANDLE_ROW_HEIGHT - HANDLE_ROW_HEIGHT / 2;
          return (
            <div key={h.id}>
              <Handle
                id={h.id}
                type="source"
                position={Position.Right}
                className={`!border-2 !border-background ${
                  h.isBundle
                    ? "!w-5 !h-5 !bg-pink-300 !rounded-sm"
                    : "!w-4 !h-4 !bg-pink-400"
                }`}
                style={{ top: `auto`, bottom: fromBottom }}
              />
              <div
                className="absolute pointer-events-none flex items-center gap-2 font-mono"
                style={{
                  bottom: fromBottom,
                  right: 24,
                  transform: "translateY(50%)",
                }}
              >
                <span className={`font-bold ${h.isBundle ? "text-pink-300 text-xl" : "text-pink-400 text-lg"}`}>
                  {h.label}
                </span>
                <span className="text-foreground text-xl font-semibold">{formatValue(h.id)}</span>
              </div>
            </div>
          );
        })}
    </Card>
  );
}

export default VitalsModuleNode;
