import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Orbit } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import {
  FEEDBACK_KNOBS,
  type FeedbackKnob, type FeedbackModule,
} from "./FeedbackModule";

interface FeedbackData {
  type: "top-feedback";
  shapeX: number; shapeY: number; size: number; hue: number;
  feedback: number; zoom: number; rotation: number;
  collapsed: boolean;
}

function FeedbackNode({ data, id }: NodeProps<FeedbackData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { shapeX, shapeY, size, hue, feedback, zoom, rotation, collapsed } = data;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moduleRef = useRef<FeedbackModule | null>(null);
  const rafRef = useRef<number | null>(null);

  const [patched, setPatched] = useState<Record<FeedbackKnob, boolean>>({
    shapeX: false, shapeY: false, size: false, hue: false,
    feedback: false, zoom: false, rotation: false,
  });

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as FeedbackModule | undefined;
    if (!mod) return;
    moduleRef.current = mod;
    const update = () => setPatched({ ...mod.getSnapshot().patched });
    mod.setOnSnapshotUpdate(update);
    update();
    return () => { mod.setOnSnapshotUpdate(null); };
  }, [id]);

  useEffect(() => {
    if (collapsed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Offscreen buffer holds the previous frame so we can re-blit with
    // transforms applied.
    const off = document.createElement("canvas");
    const offCtx = off.getContext("2d");
    if (!offCtx) return;

    const render = () => {
      const mod = moduleRef.current;
      if (!mod) { rafRef.current = requestAnimationFrame(render); return; }
      const v = mod.getSnapshot().values;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        off.width = w; off.height = h;
      }

      // Map knobs to frame transforms
      const feedbackAlpha = 0.7 + v.feedback * 0.29; // 0.7..0.99
      const zoomPerFrame = 0.98 + v.zoom * 0.04;    // 0.98..1.02
      const rotPerFrame = (v.rotation - 0.5) * 0.04; // -0.02..+0.02 rad

      // 1) Copy current main canvas to offscreen
      offCtx.clearRect(0, 0, w, h);
      offCtx.drawImage(canvas, 0, 0);

      // 2) Fade + clear main canvas (compose in a black rect at (1-alpha))
      ctx.fillStyle = "rgba(0,0,0," + (1 - feedbackAlpha).toFixed(3) + ")";
      ctx.fillRect(0, 0, w, h);

      // 3) Redraw offscreen with zoom + rotate transform (the "feedback")
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(rotPerFrame);
      ctx.scale(zoomPerFrame, zoomPerFrame);
      ctx.translate(-w / 2, -h / 2);
      ctx.globalAlpha = feedbackAlpha;
      ctx.drawImage(off, 0, 0);
      ctx.globalAlpha = 1;
      ctx.restore();

      // 4) Draw the new shape on top
      const cx = v.shapeX * w;
      const cy = v.shapeY * h;
      const radius = Math.max(2, v.size * Math.min(w, h) * 0.3);
      const hueDeg = (v.hue * 360).toFixed(0);

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, `hsla(${hueDeg}, 95%, 70%, 1)`);
      grad.addColorStop(0.6, `hsla(${hueDeg}, 90%, 55%, 0.7)`);
      grad.addColorStop(1, `hsla(${hueDeg}, 80%, 40%, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [collapsed]);

  type SliderDef = { k: FeedbackKnob; label: string; fmt: (v: number) => string };
  const SLIDERS: SliderDef[] = [
    { k: "shapeX",   label: "X",     fmt: (v) => v.toFixed(2) },
    { k: "shapeY",   label: "Y",     fmt: (v) => v.toFixed(2) },
    { k: "size",     label: "Size",  fmt: (v) => v.toFixed(2) },
    { k: "hue",      label: "Hue",   fmt: (v) => `${Math.round(v * 360)}°` },
    { k: "feedback", label: "FB",    fmt: (v) => `${(0.7 + v * 0.29).toFixed(3)}` },
    { k: "zoom",     label: "Zoom",  fmt: (v) => `${(0.98 + v * 0.04).toFixed(3)}` },
    { k: "rotation", label: "Rot",   fmt: (v) => `${((v - 0.5) * 2.3).toFixed(2)}°` },
  ];

  const ROW_HEIGHT = 26;
  const bottomFor = (knob: FeedbackKnob): number => {
    const idx = SLIDERS.findIndex((s) => s.k === knob);
    const distFromBottom = SLIDERS.length - 1 - idx;
    return 8 + distFromBottom * ROW_HEIGHT + ROW_HEIGHT / 2;
  };

  return (
    <Card className="bg-background border border-emerald-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 360 }}>
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id} title="FEEDBACK" subtitle="frame trails"
          icon={<Orbit className="w-5 h-5 text-emerald-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        />
        {!collapsed && (
          <>
            <canvas ref={canvasRef} className="w-full bg-black nodrag nopan"
              style={{ height: 260, display: "block" }} />
            <div className="nodrag nopan">
              {SLIDERS.map((s) => {
                const isPatched = patched[s.k];
                const dataMap: Record<FeedbackKnob, number> = {
                  shapeX, shapeY, size, hue, feedback, zoom, rotation,
                };
                const displayVal = moduleRef.current?.getSnapshot().values[s.k] ?? dataMap[s.k];
                return (
                  <div key={s.k} className="flex items-center gap-2" style={{ height: ROW_HEIGHT }}>
                    <Label className={"text-[11px] font-mono font-bold w-12 shrink-0 " + (isPatched ? "text-emerald-300" : "text-emerald-400")}>{s.label}</Label>
                    <Slider value={[displayVal]} min={0} max={1} step={0.001}
                      onValueChange={([v]) => !isPatched && onUpdateParameter(id, s.k, v)}
                      className={"flex-1 " + (isPatched ? "pointer-events-none [&_[role=slider]]:bg-emerald-400 [&_[role=slider]]:border-emerald-300" : "")}
                      aria-label={s.label} />
                    <span className={"text-[10px] font-mono tabular-nums w-16 text-right " + (isPatched ? "text-emerald-300 font-bold" : "text-foreground")}>
                      {s.fmt(displayVal)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {!collapsed && FEEDBACK_KNOBS.map((k) => (
        <Handle key={k} id={"in-" + k} type="target" position={Position.Left}
          className={"!border-2 !border-background !w-3.5 !h-3.5 " + (patched[k] ? "!bg-emerald-300" : "!bg-emerald-400")}
          style={{ top: "auto", bottom: bottomFor(k) + "px" }} />
      ))}
    </Card>
  );
}

export default FeedbackNode;
