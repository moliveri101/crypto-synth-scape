import { useEffect, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Play, Square, Brain } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import {
  EmotivModule, EMOTIV_CHANNELS, EMOTIV_BANDS,
  type EmotivSnapshot, type EmotivMode,
} from "./EmotivModule";

interface EmotivData {
  type: "emotiv";
  mode: EmotivMode;
  clientId: string;
  clientSecret: string;
  isPlaying: boolean;
  collapsed: boolean;
}

// Assemble the same ordered handle list the module's index.ts exposes.
type RowDef = { id: string; label: string; kind: "bundle" | "channel" | "band" | "quality" };
const ROWS: RowDef[] = [
  { id: "out-all", label: "ALL", kind: "bundle" },
  ...EMOTIV_CHANNELS.map((c) => ({ id: `out-${c}`, label: c, kind: "channel" as const })),
  ...EMOTIV_BANDS.map((b) => ({ id: `out-band_${b}`, label: b, kind: "band" as const })),
  { id: "out-quality", label: "Quality", kind: "quality" as const },
];

const ROW_HEIGHT = 28;

function EmotivModuleNode({ data, id }: NodeProps<EmotivData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter, onStart, onStop } = useModuleActions();
  const { mode, clientId, clientSecret, isPlaying, collapsed } = data;

  const [snapshot, setSnapshot] = useState<EmotivSnapshot | null>(null);

  useEffect(() => {
    const module = audioGraphManager.getModule(id) as EmotivModule | undefined;
    if (!module) return;
    module.setOnSnapshotUpdate((s) => setSnapshot({
      ...s,
      channels: { ...s.channels },
      bands: { ...s.bands },
    }));
    const initial = module.getSnapshot();
    setSnapshot({
      ...initial,
      channels: { ...initial.channels },
      bands: { ...initial.bands },
    });
    return () => { module.setOnSnapshotUpdate(null); };
  }, [id]);

  const getValue = (row: RowDef): number => {
    if (!snapshot) return 0;
    if (row.kind === "bundle") return 1;
    if (row.kind === "channel") return snapshot.channels[row.label as keyof typeof snapshot.channels] ?? 0;
    if (row.kind === "band") {
      const key = row.id.replace("out-band_", "") as keyof typeof snapshot.bands;
      return snapshot.bands[key] ?? 0;
    }
    if (row.kind === "quality") return snapshot.quality;
    return 0;
  };

  const formatValue = (row: RowDef): string => {
    if (row.kind === "bundle") return `${EMOTIV_CHANNELS.length + EMOTIV_BANDS.length + 1} fields`;
    return getValue(row).toFixed(2);
  };

  return (
    <Card
      className="bg-background border border-cyan-500/40 shadow-lg rounded-xl overflow-hidden relative"
      style={{ minWidth: 320 }}
    >
      <div className="p-3 space-y-2">
        <ModuleHeader
          id={id}
          title="EMOTIV EEG"
          subtitle="14-channel brain signal"
          icon={<Brain className="w-5 h-5 text-cyan-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        >
          <Button
            size="sm"
            variant={isPlaying ? "destructive" : "default"}
            className="h-7 px-3"
            aria-label={isPlaying ? "Disconnect" : "Connect"}
            onClick={() => (isPlaying ? onStop(id) : onStart(id))}
          >
            {isPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </Button>
        </ModuleHeader>

        {!collapsed && (
          <>
            {/* Mode + connection status */}
            <div className="nodrag nopan flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  snapshot?.connected ? "bg-cyan-400 animate-pulse" : "bg-muted-foreground/50"
                }`}
              />
              <Label className="text-[10px] text-muted-foreground">Source</Label>
              <Select
                value={mode}
                onValueChange={(v) => onUpdateParameter(id, "mode", v)}
              >
                <SelectTrigger
                  className="h-6 text-[10px] flex-1"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simulated">Simulated</SelectItem>
                  <SelectItem value="cortex">Cortex (wss://localhost:6868)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Cortex credentials — only shown when in cortex mode */}
            {mode === "cortex" && (
              <div className="nodrag nopan space-y-1">
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => onUpdateParameter(id, "clientId", e.target.value)}
                  placeholder="Cortex Client ID"
                  className="w-full h-6 px-2 text-[10px] bg-secondary border border-border rounded font-mono"
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label="Cortex client id"
                />
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => onUpdateParameter(id, "clientSecret", e.target.value)}
                  placeholder="Cortex Client Secret"
                  className="w-full h-6 px-2 text-[10px] bg-secondary border border-border rounded font-mono"
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label="Cortex client secret"
                />
                <p className="text-[9px] text-muted-foreground">
                  Requires Emotiv Launcher running locally. Create app credentials at emotiv.com/my-account/cortex-apps/
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Per-channel + per-band reading rows — edge to edge */}
      {!collapsed && (
        <div className="border-t border-border">
          {ROWS.map((row) => {
            const v = getValue(row);
            const isBundle = row.kind === "bundle";
            const isBand = row.kind === "band";
            const isQuality = row.kind === "quality";
            return (
              <div
                key={row.id}
                className={`flex items-center gap-2 px-3 border-b border-border last:border-b-0 ${
                  isBundle ? "bg-cyan-500/10" : isBand ? "bg-cyan-500/5" : ""
                }`}
                style={{ height: ROW_HEIGHT }}
              >
                <span
                  className={`font-bold text-[11px] w-12 shrink-0 font-mono ${
                    isBundle ? "text-cyan-300 text-sm" :
                    isBand ? "text-cyan-300 italic" :
                    isQuality ? "text-green-400" :
                    "text-cyan-400"
                  }`}
                >
                  {row.label}
                </span>
                {/* Live bar graph of the channel's 0..1 value */}
                {!isBundle && (
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-75 ${
                        isQuality ? "bg-green-400" : isBand ? "bg-cyan-300" : "bg-cyan-400"
                      }`}
                      style={{ width: `${v * 100}%` }}
                    />
                  </div>
                )}
                <span
                  className={`text-[10px] font-mono tabular-nums w-10 text-right ${
                    isBundle ? "text-cyan-300" : "text-foreground"
                  }`}
                >
                  {formatValue(row)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Output handles — positioned from the bottom of the card up, aligned
          with the center of each reading row. */}
      {!collapsed &&
        ROWS.map((row, i) => {
          const bottom = (ROWS.length - 1 - i) * ROW_HEIGHT + ROW_HEIGHT / 2;
          const isBundle = row.kind === "bundle";
          return (
            <Handle
              key={row.id}
              id={row.id}
              type="source"
              position={Position.Right}
              className={`!border-2 !border-background ${
                isBundle
                  ? "!w-4 !h-4 !bg-cyan-300 !rounded-sm"
                  : row.kind === "band"
                  ? "!w-3 !h-3 !bg-cyan-300"
                  : row.kind === "quality"
                  ? "!w-3 !h-3 !bg-green-400"
                  : "!w-3 !h-3 !bg-cyan-400"
              }`}
              style={{ top: "auto", bottom }}
            />
          );
        })}
    </Card>
  );
}

export default EmotivModuleNode;
