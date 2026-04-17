import { useEffect, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Clock } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import {
  CLOCK_KNOBS, CLOCK_DIVISIONS,
  type ClockKnob, type ClockModule, type ClockSnapshot,
} from "./ClockModule";

interface ClockData {
  type: "chop-clock";
  bpm: number;
  gateLen: number;
  swing: number;
  division: string;
  collapsed: boolean;
}

function ClockNode({ data, id }: NodeProps<ClockData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { bpm, gateLen, swing, division, collapsed } = data;

  const [snapshot, setSnapshot] = useState<ClockSnapshot | null>(null);

  const [patched, setPatched] = useState<Record<ClockKnob, boolean>>({
    bpm: false, gateLen: false, swing: false,
  });

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as ClockModule | undefined;
    if (!mod) return;
    const update = (s: ClockSnapshot) => {
      setSnapshot(s);
      setPatched({ ...s.patched });
    };
    mod.setOnSnapshotUpdate(update);
    update(mod.getSnapshot());
    return () => { mod.setOnSnapshotUpdate(null); };
  }, [id]);

  type SliderDef = {
    k: ClockKnob; label: string; fmt: (v: number) => string;
  };
  const SLIDERS: SliderDef[] = [
    { k: "bpm",     label: "BPM",  fmt: () => `${(snapshot?.bpm ?? (30 + bpm * 270)).toFixed(0)}` },
    { k: "gateLen", label: "Gate", fmt: (v) => `${Math.round(v * 100)}%` },
    { k: "swing",   label: "Swing",fmt: (v) => `${Math.round(v * 100)}%` },
  ];

  const ROW_HEIGHT = 28;
  const bottomFor = (knob: ClockKnob): number => {
    const idx = SLIDERS.findIndex((s) => s.k === knob);
    const distFromBottom = SLIDERS.length - 1 - idx;
    return 8 + distFromBottom * ROW_HEIGHT + ROW_HEIGHT / 2;
  };

  const pulseOn = (snapshot?.currentPulse ?? 0) > 0.5;

  return (
    <Card
      className="bg-background border border-emerald-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 280 }}
    >
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id}
          title="CLOCK"
          subtitle={division}
          icon={<Clock className="w-5 h-5 text-emerald-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        />

        {!collapsed && (
          <>
            {/* Big LED that flashes on each beat */}
            <div className="flex items-center gap-2 nodrag nopan">
              <div
                className={
                  "w-5 h-5 rounded-full border-2 transition-colors duration-75 " +
                  (pulseOn
                    ? "bg-emerald-400 border-emerald-300"
                    : "bg-neutral-900 border-neutral-700")
                }
              />
              <span className="text-[10px] text-muted-foreground flex-1">
                Beat {snapshot?.lastBeatIdx ?? 0}
              </span>
              <span className="text-[10px] font-mono tabular-nums text-emerald-400">
                {(snapshot?.bpm ?? 120).toFixed(0)} BPM
              </span>
            </div>

            {/* Division — musical subdivision, not patchable */}
            <div className="nodrag nopan">
              <Label className="text-[10px] text-muted-foreground">Division</Label>
              <Select value={division} onValueChange={(v) => onUpdateParameter(id, "division", v)}>
                <SelectTrigger className="h-7 text-[11px]" onPointerDown={(e) => e.stopPropagation()}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLOCK_DIVISIONS.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="nodrag nopan">
              {SLIDERS.map((s) => {
                const isPatched = patched[s.k];
                const dataMap: Record<ClockKnob, number> = { bpm, gateLen, swing };
                const displayVal = snapshot?.values[s.k] ?? dataMap[s.k];
                return (
                  <div
                    key={s.k}
                    className="flex items-center gap-2"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <Label className={"text-[11px] font-mono font-bold w-12 shrink-0 " + (isPatched ? "text-emerald-300" : "text-emerald-400")}>
                      {s.label}
                    </Label>
                    <Slider
                      value={[displayVal]}
                      min={0}
                      max={1}
                      step={0.001}
                      onValueChange={([v]) => !isPatched && onUpdateParameter(id, s.k, v)}
                      className={"flex-1 " + (isPatched ? "pointer-events-none [&_[role=slider]]:bg-emerald-400 [&_[role=slider]]:border-emerald-300" : "")}
                      aria-label={s.label}
                    />
                    <span className={"text-[10px] font-mono tabular-nums w-12 text-right " + (isPatched ? "text-emerald-300 font-bold" : "text-foreground")}>
                      {s.fmt(displayVal)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Two outputs: `gate` fires 1 during gate-on, 0 otherwise;
          `phase` is the 0..1 position within the current beat */}
      <Handle
        id="out-gate"
        type="source"
        position={Position.Right}
        className="!border-2 !border-background !w-4 !h-4 !bg-emerald-300"
        style={{ top: "40%" }}
      />
      <Handle
        id="out-phase"
        type="source"
        position={Position.Right}
        className="!border-2 !border-background !w-3.5 !h-3.5 !bg-emerald-400"
        style={{ top: "60%" }}
      />

      {!collapsed &&
        CLOCK_KNOBS.map((k) => (
          <Handle
            key={k}
            id={"in-" + k}
            type="target"
            position={Position.Left}
            className={"!border-2 !border-background !w-3.5 !h-3.5 " + (patched[k] ? "!bg-emerald-300" : "!bg-emerald-400")}
            style={{ top: "auto", bottom: bottomFor(k) + "px" }}
          />
        ))}
    </Card>
  );
}

export default ClockNode;
