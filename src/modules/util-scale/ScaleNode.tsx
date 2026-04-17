import { useEffect, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Ruler } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import {
  SCALE_KNOBS,
  type ScaleKnob, type ScaleModule, type ScaleSnapshot,
} from "./ScaleModule";

interface ScaleData {
  type: "util-scale";
  outMin: number;
  outMax: number;
  curve: number;
  invert: boolean;
  collapsed: boolean;
}

function ScaleNode({ data, id }: NodeProps<ScaleData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { outMin, outMax, curve, invert, collapsed } = data;

  const [snapshot, setSnapshot] = useState<ScaleSnapshot | null>(null);
  const patched = snapshot?.patched ?? { outMin: false, outMax: false, curve: false };

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as ScaleModule | undefined;
    if (!mod) return;
    mod.setOnSnapshotUpdate(setSnapshot);
    setSnapshot(mod.getSnapshot());
    return () => { mod.setOnSnapshotUpdate(null); };
  }, [id]);

  type SliderDef = { k: ScaleKnob; label: string; fmt: (v: number) => string };
  const SLIDERS: SliderDef[] = [
    { k: "outMin", label: "Min",   fmt: (v) => v.toFixed(2) },
    { k: "outMax", label: "Max",   fmt: (v) => v.toFixed(2) },
    { k: "curve", label: "Curve",  fmt: (v) => {
      const exp = Math.pow(10, (v - 0.5) * 2);
      return exp < 0.99 ? `exp ${exp.toFixed(2)}` : exp > 1.01 ? `log ${exp.toFixed(1)}` : "linear";
    }},
  ];

  const ROW_HEIGHT = 28;
  const bottomFor = (knob: ScaleKnob): number => {
    const idx = SLIDERS.findIndex((s) => s.k === knob);
    const distFromBottom = SLIDERS.length - 1 - idx;
    return 8 + distFromBottom * ROW_HEIGHT + ROW_HEIGHT / 2;
  };

  const input = snapshot?.input ?? 0;
  const output = snapshot?.output ?? 0;

  return (
    <Card className="bg-background border border-sky-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 280 }}>
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id} title="SCALE" subtitle="remap"
          icon={<Ruler className="w-5 h-5 text-sky-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        />
        {!collapsed && (
          <>
            <div className="grid grid-cols-2 gap-1 text-[10px] font-mono tabular-nums nodrag nopan">
              <div className="bg-neutral-900 p-1 text-center">
                <div className="text-sky-400">In</div>
                <div className="text-foreground">{input.toFixed(2)}</div>
              </div>
              <div className="bg-sky-900/30 p-1 text-center border border-sky-600/40">
                <div className="text-sky-300">Out</div>
                <div className="text-sky-300 font-bold">{output.toFixed(2)}</div>
              </div>
            </div>
            <Button
              size="sm"
              variant={invert ? "default" : "outline"}
              className="w-full h-6 text-[10px] rounded-none nodrag nopan"
              onClick={() => onUpdateParameter(id, "invert", !invert)}
            >
              {invert ? "Inverted" : "Normal"}
            </Button>
            <div className="nodrag nopan">
              {SLIDERS.map((s) => {
                const isPatched = patched[s.k];
                const dataMap: Record<ScaleKnob, number> = { outMin, outMax, curve };
                const displayVal = snapshot?.values[s.k] ?? dataMap[s.k];
                return (
                  <div key={s.k} className="flex items-center gap-2" style={{ height: ROW_HEIGHT }}>
                    <Label className={"text-[11px] font-mono font-bold w-12 shrink-0 " + (isPatched ? "text-sky-300" : "text-sky-400")}>{s.label}</Label>
                    <Slider value={[displayVal]} min={0} max={1} step={0.001}
                      onValueChange={([v]) => !isPatched && onUpdateParameter(id, s.k, v)}
                      className={"flex-1 " + (isPatched ? "pointer-events-none [&_[role=slider]]:bg-sky-400 [&_[role=slider]]:border-sky-300" : "")}
                      aria-label={s.label} />
                    <span className={"text-[10px] font-mono tabular-nums w-16 text-right " + (isPatched ? "text-sky-300 font-bold" : "text-foreground")}>
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
        className="!border-2 !border-background !w-4 !h-4 !bg-sky-400" style={{ top: "50%" }} />

      {!collapsed && (
        <>
          <Handle id="in-signal" type="target" position={Position.Left}
            className="!border-2 !border-background !w-4 !h-4 !bg-sky-300"
            style={{ top: 50 }} />
          {SCALE_KNOBS.map((k) => (
            <Handle key={k} id={"in-" + k} type="target" position={Position.Left}
              className={"!border-2 !border-background !w-3.5 !h-3.5 " + (patched[k] ? "!bg-sky-300" : "!bg-sky-400")}
              style={{ top: "auto", bottom: bottomFor(k) + "px" }} />
          ))}
        </>
      )}
    </Card>
  );
}

export default ScaleNode;
