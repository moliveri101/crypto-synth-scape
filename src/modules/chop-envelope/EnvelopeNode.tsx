import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { AudioWaveform } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import {
  ENV_KNOBS,
  type EnvKnob, type EnvelopeModule, type EnvSnapshot,
} from "./EnvelopeModule";

interface EnvData {
  type: "chop-envelope";
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  collapsed: boolean;
}

function EnvelopeNode({ data, id }: NodeProps<EnvData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { attack, decay, sustain, release, collapsed } = data;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotRef = useRef<EnvSnapshot | null>(null);
  const rafRef = useRef<number | null>(null);

  const [snapshot, setSnapshot] = useState<EnvSnapshot | null>(null);
  const patched = snapshot?.patched ?? { attack: false, decay: false, sustain: false, release: false };
  const triggerPatched = snapshot?.triggerPatched ?? false;

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as EnvelopeModule | undefined;
    if (!mod) return;
    const update = (s: EnvSnapshot) => {
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
      if (snap && snap.history.length > 1) {
        ctx.strokeStyle = "hsl(120, 75%, 55%)";
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

  const fmtTime = (v: number) => {
    const s = 0.001 * Math.pow(4000, v);
    return s < 1 ? `${(s * 1000).toFixed(0)}ms` : `${s.toFixed(2)}s`;
  };

  type SliderDef = { k: EnvKnob; label: string; fmt: (v: number) => string };
  const SLIDERS: SliderDef[] = [
    { k: "attack",  label: "A", fmt: fmtTime },
    { k: "decay",   label: "D", fmt: fmtTime },
    { k: "sustain", label: "S", fmt: (v) => v.toFixed(2) },
    { k: "release", label: "R", fmt: fmtTime },
  ];

  const ROW_HEIGHT = 28;
  // Knob handles start at index 1 (trigger is 0)
  const bottomFor = (knob: EnvKnob): number => {
    const idx = SLIDERS.findIndex((s) => s.k === knob);
    const distFromBottom = SLIDERS.length - 1 - idx;
    return 8 + distFromBottom * ROW_HEIGHT + ROW_HEIGHT / 2;
  };

  const stage = snapshot?.stage ?? "idle";

  return (
    <Card className="bg-background border border-green-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 300 }}>
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id} title="ENVELOPE" subtitle={`ADSR · ${stage}`}
          icon={<AudioWaveform className="w-5 h-5 text-green-400" />}
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
                const dataMap: Record<EnvKnob, number> = { attack, decay, sustain, release };
                const displayVal = snapshot?.values[s.k] ?? dataMap[s.k];
                return (
                  <div key={s.k} className="flex items-center gap-2" style={{ height: ROW_HEIGHT }}>
                    <Label className={"text-[11px] font-mono font-bold w-12 shrink-0 " + (isPatched ? "text-green-300" : "text-green-400")}>{s.label}</Label>
                    <Slider value={[displayVal]} min={0} max={1} step={0.001}
                      onValueChange={([v]) => !isPatched && onUpdateParameter(id, s.k, v)}
                      className={"flex-1 " + (isPatched ? "pointer-events-none [&_[role=slider]]:bg-green-400 [&_[role=slider]]:border-green-300" : "")}
                      aria-label={s.label} />
                    <span className={"text-[10px] font-mono tabular-nums w-14 text-right " + (isPatched ? "text-green-300 font-bold" : "text-foreground")}>
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
        className="!border-2 !border-background !w-4 !h-4 !bg-green-400" style={{ top: "50%" }} />

      {/* Trigger input on top-left */}
      {!collapsed && (
        <Handle id="in-trigger" type="target" position={Position.Left}
          className={"!border-2 !border-background !w-4 !h-4 " + (triggerPatched ? "!bg-green-300" : "!bg-green-500")}
          style={{ top: 60 }} />
      )}
      {!collapsed && ENV_KNOBS.map((k) => (
        <Handle key={k} id={"in-" + k} type="target" position={Position.Left}
          className={"!border-2 !border-background !w-3.5 !h-3.5 " + (patched[k] ? "!bg-green-300" : "!bg-green-400")}
          style={{ top: "auto", bottom: bottomFor(k) + "px" }} />
      ))}
    </Card>
  );
}

export default EnvelopeNode;
