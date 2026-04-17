import { useEffect, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Zap } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import {
  TRIGGER_KNOBS,
  type TriggerKnob, type TriggerModule, type TriggerSnapshot,
} from "./TriggerModule";

interface TriggerData {
  type: "chop-trigger";
  threshold: number;
  length: number;
  collapsed: boolean;
}

function TriggerNode({ data, id }: NodeProps<TriggerData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { threshold, length, collapsed } = data;

  const [snapshot, setSnapshot] = useState<TriggerSnapshot | null>(null);
  const patched = snapshot?.patched ?? { threshold: false, length: false };

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as TriggerModule | undefined;
    if (!mod) return;
    mod.setOnSnapshotUpdate(setSnapshot);
    setSnapshot(mod.getSnapshot());
    return () => { mod.setOnSnapshotUpdate(null); };
  }, [id]);

  type SliderDef = { k: TriggerKnob; label: string; fmt: (v: number) => string };
  const SLIDERS: SliderDef[] = [
    { k: "threshold", label: "Thresh", fmt: (v) => v.toFixed(2) },
    { k: "length",    label: "Length", fmt: (v) => {
      const ms = 1 + v * 2000;
      return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`;
    }},
  ];

  const ROW_HEIGHT = 28;
  const bottomFor = (knob: TriggerKnob): number => {
    const idx = SLIDERS.findIndex((s) => s.k === knob);
    const distFromBottom = SLIDERS.length - 1 - idx;
    return 8 + distFromBottom * ROW_HEIGHT + ROW_HEIGHT / 2;
  };

  const signal = snapshot?.signal ?? 0;
  const out = snapshot?.out ?? 0;
  const fireCount = snapshot?.fireCount ?? 0;
  const thresholdVal = snapshot?.values.threshold ?? threshold;

  return (
    <Card className="bg-background border border-rose-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 280 }}>
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id} title="TRIGGER" subtitle={`fires: ${fireCount}`}
          icon={<Zap className="w-5 h-5 text-rose-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        />
        {!collapsed && (
          <>
            {/* Signal vs threshold bar */}
            <div className="nodrag nopan">
              <div className="relative h-8 bg-neutral-900 border border-neutral-800">
                <div className="absolute inset-y-0 left-0 bg-rose-400/40" style={{ width: `${signal * 100}%` }} />
                <div className="absolute inset-y-0 w-0.5 bg-rose-300" style={{ left: `${thresholdVal * 100}%` }} />
                <div className={"absolute right-1 top-1 w-4 h-4 rounded-full " + (out > 0.5 ? "bg-rose-300" : "bg-neutral-800")} />
              </div>
            </div>
            <div className="nodrag nopan">
              {SLIDERS.map((s) => {
                const isPatched = patched[s.k];
                const dataMap: Record<TriggerKnob, number> = { threshold, length };
                const displayVal = snapshot?.values[s.k] ?? dataMap[s.k];
                return (
                  <div key={s.k} className="flex items-center gap-2" style={{ height: ROW_HEIGHT }}>
                    <Label className={"text-[11px] font-mono font-bold w-14 shrink-0 " + (isPatched ? "text-rose-300" : "text-rose-400")}>{s.label}</Label>
                    <Slider value={[displayVal]} min={0} max={1} step={0.001}
                      onValueChange={([v]) => !isPatched && onUpdateParameter(id, s.k, v)}
                      className={"flex-1 " + (isPatched ? "pointer-events-none [&_[role=slider]]:bg-rose-400 [&_[role=slider]]:border-rose-300" : "")}
                      aria-label={s.label} />
                    <span className={"text-[10px] font-mono tabular-nums w-14 text-right " + (isPatched ? "text-rose-300 font-bold" : "text-foreground")}>
                      {s.fmt(displayVal)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Handle id="out-value" type="source" position={Position.Right}
        className="!border-2 !border-background !w-4 !h-4 !bg-rose-400" style={{ top: "50%" }} />

      {!collapsed && (
        <>
          <Handle id="in-signal" type="target" position={Position.Left}
            className="!border-2 !border-background !w-4 !h-4 !bg-rose-300"
            style={{ top: 60 }} />
          {TRIGGER_KNOBS.map((k) => (
            <Handle key={k} id={"in-" + k} type="target" position={Position.Left}
              className={"!border-2 !border-background !w-3.5 !h-3.5 " + (patched[k] ? "!bg-rose-300" : "!bg-rose-400")}
              style={{ top: "auto", bottom: bottomFor(k) + "px" }} />
          ))}
        </>
      )}
    </Card>
  );
}

export default TriggerNode;
