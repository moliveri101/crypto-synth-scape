import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Filter } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { type LagModule, type LagSnapshot } from "./LagModule";

interface LagData {
  type: "util-lag";
  time: number;
  collapsed: boolean;
}

function LagNode({ data, id }: NodeProps<LagData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { time, collapsed } = data;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotRef = useRef<LagSnapshot | null>(null);
  const rafRef = useRef<number | null>(null);

  const [snapshot, setSnapshot] = useState<LagSnapshot | null>(null);
  const timePatched = snapshot?.patched.time ?? false;

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as LagModule | undefined;
    if (!mod) return;
    const update = (s: LagSnapshot) => {
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
      if (snap) {
        // Input as a thin ghost line
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        const yIn = (1 - snap.input) * h;
        ctx.moveTo(0, yIn); ctx.lineTo(w, yIn); ctx.stroke();

        // Output history as the main line
        if (snap.history.length > 1) {
          ctx.strokeStyle = "hsl(160, 85%, 55%)";
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

  const displayTime = snapshot?.values.time ?? time;
  const tauSec = 0.01 * Math.pow(300, displayTime);

  return (
    <Card className="bg-background border border-teal-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 260 }}>
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id} title="LAG" subtitle="smooth"
          icon={<Filter className="w-5 h-5 text-teal-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        />
        {!collapsed && (
          <>
            <canvas ref={canvasRef} className="w-full bg-black nodrag nopan" style={{ height: 80, display: "block" }} />
            <div className="flex items-center gap-2 nodrag nopan">
              <Label className={"text-[11px] font-mono font-bold w-12 shrink-0 " + (timePatched ? "text-teal-300" : "text-teal-400")}>Time</Label>
              <Slider value={[displayTime]} min={0} max={1} step={0.001}
                onValueChange={([v]) => !timePatched && onUpdateParameter(id, "time", v)}
                className={"flex-1 " + (timePatched ? "pointer-events-none [&_[role=slider]]:bg-teal-400 [&_[role=slider]]:border-teal-300" : "")}
                aria-label="Time" />
              <span className={"text-[10px] font-mono tabular-nums w-14 text-right " + (timePatched ? "text-teal-300 font-bold" : "text-foreground")}>
                {tauSec < 1 ? `${(tauSec * 1000).toFixed(0)}ms` : `${tauSec.toFixed(2)}s`}
              </span>
            </div>
          </>
        )}
      </div>

      <Handle id="out-value" type="source" position={Position.Right}
        className="!border-2 !border-background !w-4 !h-4 !bg-teal-400" style={{ top: "50%" }} />
      {!collapsed && (
        <>
          <Handle id="in-signal" type="target" position={Position.Left}
            className="!border-2 !border-background !w-4 !h-4 !bg-teal-300"
            style={{ top: "40%" }} />
          <Handle id="in-time" type="target" position={Position.Left}
            className={"!border-2 !border-background !w-3.5 !h-3.5 " + (timePatched ? "!bg-teal-300" : "!bg-teal-400")}
            style={{ top: "70%" }} />
        </>
      )}
    </Card>
  );
}

export default LagNode;
