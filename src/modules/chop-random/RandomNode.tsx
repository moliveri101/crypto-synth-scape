import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Dices } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import {
  RANDOM_KNOBS,
  type RandomKnob, type RandomModule, type RandomSnapshot,
} from "./RandomModule";

interface RandomData {
  type: "chop-random";
  rate: number;
  smooth: number;
  min: number;
  max: number;
  collapsed: boolean;
}

function RandomNode({ data, id }: NodeProps<RandomData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { rate, smooth, min, max, collapsed } = data;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotRef = useRef<RandomSnapshot | null>(null);
  const rafRef = useRef<number | null>(null);

  const [snapshot, setSnapshot] = useState<RandomSnapshot | null>(null);
  const patched = snapshot?.patched ?? {
    rate: false, smooth: false, min: false, max: false,
  };

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as RandomModule | undefined;
    if (!mod) return;
    const update = (s: RandomSnapshot) => {
      snapshotRef.current = s;
      setSnapshot(s);
    };
    mod.setOnSnapshotUpdate(update);
    update(mod.getSnapshot());
    return () => { mod.setOnSnapshotUpdate(null); };
  }, [id]);

  useEffect(() => {
    if (collapsed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const render = () => {
      const snap = snapshotRef.current;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.fillStyle = "rgb(10,10,14)";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
      if (snap && snap.history.length > 1) {
        ctx.strokeStyle = "hsl(32, 95%, 62%)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        const n = snap.history.length;
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * w;
          const y = (1 - snap.history[i]) * h;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [collapsed]);

  type SliderDef = { k: RandomKnob; label: string; fmt: (v: number) => string };
  const SLIDERS: SliderDef[] = [
    { k: "rate",   label: "Rate",   fmt: (v) => `${(0.05 * Math.pow(400, v)).toFixed(2)}Hz` },
    { k: "smooth", label: "Smooth", fmt: (v) => v.toFixed(2) },
    { k: "min",    label: "Min",    fmt: (v) => v.toFixed(2) },
    { k: "max",    label: "Max",    fmt: (v) => v.toFixed(2) },
  ];

  const ROW_HEIGHT = 28;
  const bottomFor = (knob: RandomKnob): number => {
    const idx = SLIDERS.findIndex((s) => s.k === knob);
    const distFromBottom = SLIDERS.length - 1 - idx;
    return 8 + distFromBottom * ROW_HEIGHT + ROW_HEIGHT / 2;
  };

  return (
    <Card className="bg-background border border-orange-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 300 }}>
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id} title="RANDOM" subtitle="sample & hold"
          icon={<Dices className="w-5 h-5 text-orange-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        />
        {!collapsed && (
          <>
            <canvas ref={canvasRef} className="w-full bg-black nodrag nopan" style={{ height: 90, display: "block" }} />
            <div className="nodrag nopan">
              {SLIDERS.map((s) => {
                const isPatched = patched[s.k];
                const dataMap: Record<RandomKnob, number> = { rate, smooth, min, max };
                const displayVal = snapshot?.values[s.k] ?? dataMap[s.k];
                return (
                  <div key={s.k} className="flex items-center gap-2" style={{ height: ROW_HEIGHT }}>
                    <Label className={"text-[11px] font-mono font-bold w-12 shrink-0 " + (isPatched ? "text-orange-300" : "text-orange-400")}>{s.label}</Label>
                    <Slider value={[displayVal]} min={0} max={1} step={0.001}
                      onValueChange={([v]) => !isPatched && onUpdateParameter(id, s.k, v)}
                      className={"flex-1 " + (isPatched ? "pointer-events-none [&_[role=slider]]:bg-orange-400 [&_[role=slider]]:border-orange-300" : "")}
                      aria-label={s.label} />
                    <span className={"text-[10px] font-mono tabular-nums w-14 text-right " + (isPatched ? "text-orange-300 font-bold" : "text-foreground")}>
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
        className="!border-2 !border-background !w-4 !h-4 !bg-orange-400" style={{ top: "50%" }} />
      {!collapsed && RANDOM_KNOBS.map((k) => (
        <Handle key={k} id={"in-" + k} type="target" position={Position.Left}
          className={"!border-2 !border-background !w-3.5 !h-3.5 " + (patched[k] ? "!bg-orange-300" : "!bg-orange-400")}
          style={{ top: "auto", bottom: bottomFor(k) + "px" }} />
      ))}
    </Card>
  );
}

export default RandomNode;
