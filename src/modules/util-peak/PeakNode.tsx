import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { TrendingUp } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import {
  PEAK_KNOBS,
  type PeakKnob, type PeakModule, type PeakSnapshot,
} from "./PeakModule";

interface PeakData {
  type: "util-peak";
  attack: number;
  release: number;
  collapsed: boolean;
}

function PeakNode({ data, id }: NodeProps<PeakData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { attack, release, collapsed } = data;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotRef = useRef<PeakSnapshot | null>(null);
  const rafRef = useRef<number | null>(null);

  const [snapshot, setSnapshot] = useState<PeakSnapshot | null>(null);
  const patched = snapshot?.patched ?? { attack: false, release: false };

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as PeakModule | undefined;
    if (!mod) return;
    const update = (s: PeakSnapshot) => { snapshotRef.current = s; setSnapshot(s); };
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
      if (snap) {
        // Instantaneous input as a vertical ghost bar
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(w - 6, (1 - snap.input) * h, 4, snap.input * h);
        // Envelope history
        if (snap.history.length > 1) {
          ctx.strokeStyle = "hsl(0, 85%, 65%)";
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
      }
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [collapsed]);

  const fmtAttack = (v: number) => {
    const s = 0.001 * Math.pow(1000, v);
    return s < 1 ? `${(s * 1000).toFixed(0)}ms` : `${s.toFixed(2)}s`;
  };
  const fmtRelease = (v: number) => {
    const s = 0.01 * Math.pow(500, v);
    return s < 1 ? `${(s * 1000).toFixed(0)}ms` : `${s.toFixed(2)}s`;
  };

  type SliderDef = { k: PeakKnob; label: string; fmt: (v: number) => string };
  const SLIDERS: SliderDef[] = [
    { k: "attack",  label: "Atk", fmt: fmtAttack },
    { k: "release", label: "Rel", fmt: fmtRelease },
  ];

  const ROW_HEIGHT = 28;
  const bottomFor = (knob: PeakKnob): number => {
    const idx = SLIDERS.findIndex((s) => s.k === knob);
    const distFromBottom = SLIDERS.length - 1 - idx;
    return 8 + distFromBottom * ROW_HEIGHT + ROW_HEIGHT / 2;
  };

  return (
    <Card className="bg-background border border-red-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 280 }}>
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id} title="PEAK" subtitle="follower"
          icon={<TrendingUp className="w-5 h-5 text-red-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        />
        {!collapsed && (
          <>
            <canvas ref={canvasRef} className="w-full bg-black nodrag nopan" style={{ height: 80, display: "block" }} />
            <div className="nodrag nopan">
              {SLIDERS.map((s) => {
                const isPatched = patched[s.k];
                const dataMap: Record<PeakKnob, number> = { attack, release };
                const displayVal = snapshot?.values[s.k] ?? dataMap[s.k];
                return (
                  <div key={s.k} className="flex items-center gap-2" style={{ height: ROW_HEIGHT }}>
                    <Label className={"text-[11px] font-mono font-bold w-12 shrink-0 " + (isPatched ? "text-red-300" : "text-red-400")}>{s.label}</Label>
                    <Slider value={[displayVal]} min={0} max={1} step={0.001}
                      onValueChange={([v]) => !isPatched && onUpdateParameter(id, s.k, v)}
                      className={"flex-1 " + (isPatched ? "pointer-events-none [&_[role=slider]]:bg-red-400 [&_[role=slider]]:border-red-300" : "")}
                      aria-label={s.label} />
                    <span className={"text-[10px] font-mono tabular-nums w-14 text-right " + (isPatched ? "text-red-300 font-bold" : "text-foreground")}>
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
        className="!border-2 !border-background !w-4 !h-4 !bg-red-400" style={{ top: "50%" }} />
      {!collapsed && (
        <>
          <Handle id="in-signal" type="target" position={Position.Left}
            className="!border-2 !border-background !w-4 !h-4 !bg-red-300"
            style={{ top: 50 }} />
          {PEAK_KNOBS.map((k) => (
            <Handle key={k} id={"in-" + k} type="target" position={Position.Left}
              className={"!border-2 !border-background !w-3.5 !h-3.5 " + (patched[k] ? "!bg-red-300" : "!bg-red-400")}
              style={{ top: "auto", bottom: bottomFor(k) + "px" }} />
          ))}
        </>
      )}
    </Card>
  );
}

export default PeakNode;
