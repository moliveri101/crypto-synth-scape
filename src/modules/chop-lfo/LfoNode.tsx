import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Activity } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import {
  LFO_KNOBS, LFO_WAVEFORMS,
  type LfoKnob, type LfoWaveform, type LfoModule, type LfoSnapshot,
} from "./LfoModule";

interface LfoData {
  type: "chop-lfo";
  frequency: number;
  amplitude: number;
  bias: number;
  phase: number;
  waveform: LfoWaveform;
  collapsed: boolean;
}

function LfoNode({ data, id }: NodeProps<LfoData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { frequency, amplitude, bias, phase, waveform, collapsed } = data;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotRef = useRef<LfoSnapshot | null>(null);
  const rafRef = useRef<number | null>(null);

  const [snapshot, setSnapshot] = useState<LfoSnapshot | null>(null);
  const patched = snapshot?.patched ?? {
    frequency: false, amplitude: false, bias: false, phase: false,
  };

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as LfoModule | undefined;
    if (!mod) return;
    const update = (s: LfoSnapshot) => {
      snapshotRef.current = s;
      setSnapshot(s);
    };
    mod.setOnSnapshotUpdate(update);
    update(mod.getSnapshot());
    return () => { mod.setOnSnapshotUpdate(null); };
  }, [id]);

  // Draw the oscilloscope
  useEffect(() => {
    if (collapsed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const snap = snapshotRef.current;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }
      ctx.fillStyle = "rgb(10, 10, 14)";
      ctx.fillRect(0, 0, w, h);

      // Mid-line reference
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (snap && snap.history.length > 1) {
        ctx.strokeStyle = "hsl(188, 95%, 58%)";
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
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
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [collapsed]);

  // Effective-frequency label (exponential map)
  const effectiveFreqHz = () => {
    const v = snapshot?.values.frequency ?? frequency;
    return 0.01 * Math.pow(2000, v);
  };

  type SliderDef = {
    k: LfoKnob; label: string; fmt: (v: number) => string;
  };
  const SLIDERS: SliderDef[] = [
    { k: "frequency", label: "Freq",  fmt: () => `${effectiveFreqHz().toFixed(2)}Hz` },
    { k: "amplitude", label: "Amp",   fmt: (v) => v.toFixed(2) },
    { k: "bias",      label: "Bias",  fmt: (v) => v.toFixed(2) },
    { k: "phase",     label: "Phase", fmt: (v) => `${Math.round(v * 360)}°` },
  ];

  const ROW_HEIGHT = 28;
  const bottomFor = (knob: LfoKnob): number => {
    const idx = SLIDERS.findIndex((s) => s.k === knob);
    const distFromBottom = SLIDERS.length - 1 - idx;
    return 8 + distFromBottom * ROW_HEIGHT + ROW_HEIGHT / 2;
  };

  return (
    <Card
      className="bg-background border border-cyan-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 300 }}
    >
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id}
          title="LFO"
          subtitle={waveform}
          icon={<Activity className="w-5 h-5 text-cyan-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        />

        {!collapsed && (
          <>
            {/* Waveform dropdown — not patchable */}
            <div className="nodrag nopan">
              <Label className="text-[10px] text-muted-foreground">Waveform</Label>
              <Select value={waveform} onValueChange={(v) => onUpdateParameter(id, "waveform", v)}>
                <SelectTrigger className="h-7 text-[11px] capitalize" onPointerDown={(e) => e.stopPropagation()}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LFO_WAVEFORMS.map((w) => (
                    <SelectItem key={w} value={w} className="capitalize">{w}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <canvas
              ref={canvasRef}
              className="w-full bg-black nodrag nopan"
              style={{ height: 90, display: "block" }}
            />

            <div className="nodrag nopan">
              {SLIDERS.map((s) => {
                const isPatched = patched[s.k];
                const dataMap: Record<LfoKnob, number> = { frequency, amplitude, bias, phase };
                const displayVal = snapshot?.values[s.k] ?? dataMap[s.k];
                return (
                  <div
                    key={s.k}
                    className="flex items-center gap-2"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <Label className={"text-[11px] font-mono font-bold w-12 shrink-0 " + (isPatched ? "text-cyan-300" : "text-cyan-400")}>
                      {s.label}
                    </Label>
                    <Slider
                      value={[displayVal]}
                      min={0}
                      max={1}
                      step={0.001}
                      onValueChange={([v]) => !isPatched && onUpdateParameter(id, s.k, v)}
                      className={"flex-1 " + (isPatched ? "pointer-events-none [&_[role=slider]]:bg-cyan-400 [&_[role=slider]]:border-cyan-300" : "")}
                      aria-label={s.label}
                    />
                    <span className={"text-[10px] font-mono tabular-nums w-14 text-right " + (isPatched ? "text-cyan-300 font-bold" : "text-foreground")}>
                      {s.fmt(displayVal)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Data output on the right */}
      <Handle
        id="out-value"
        type="source"
        position={Position.Right}
        className="!border-2 !border-background !w-4 !h-4 !bg-cyan-400"
        style={{ top: "50%" }}
      />

      {/* Modulation input handles on the left */}
      {!collapsed &&
        LFO_KNOBS.map((k) => (
          <Handle
            key={k}
            id={"in-" + k}
            type="target"
            position={Position.Left}
            className={"!border-2 !border-background !w-3.5 !h-3.5 " + (patched[k] ? "!bg-cyan-300" : "!bg-cyan-400")}
            style={{ top: "auto", bottom: bottomFor(k) + "px" }}
          />
        ))}
    </Card>
  );
}

export default LfoNode;
