import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Hexagon } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import {
  KALEIDO_KNOBS,
  type KaleidoKnob, type KaleidoscopeModule,
} from "./KaleidoscopeModule";

interface KaleidoData {
  type: "top-kaleidoscope";
  segments: number; rotation: number; zoom: number;
  offsetX: number; offsetY: number;
  collapsed: boolean;
}

function KaleidoscopeNode({ data, id }: NodeProps<KaleidoData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { segments, rotation, zoom, offsetX, offsetY, collapsed } = data;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const moduleRef = useRef<KaleidoscopeModule | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [patched, setPatched] = useState<Record<KaleidoKnob, boolean>>({
    segments: false, rotation: false, zoom: false, offsetX: false, offsetY: false,
  });
  const [cameraOn, setCameraOn] = useState(false);

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as KaleidoscopeModule | undefined;
    if (!mod) return;
    moduleRef.current = mod;
    const update = () => setPatched({ ...mod.getSnapshot().patched });
    mod.setOnSnapshotUpdate(update);
    update();
    return () => { mod.setOnSnapshotUpdate(null); };
  }, [id]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch (e) {
      console.error("Camera error:", e);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  useEffect(() => () => stopCamera(), []);

  useEffect(() => {
    if (collapsed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const mod = moduleRef.current;
      const video = videoRef.current;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

      ctx.fillStyle = "rgb(5,5,10)";
      ctx.fillRect(0, 0, w, h);

      if (!mod || !video || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const vals = mod.getSnapshot().values;
      const segCount = 2 + Math.floor(vals.segments * 14); // 2..16
      const angleStep = (Math.PI * 2) / segCount;
      const rotAngle = vals.rotation * Math.PI * 2;
      const zoom = 0.5 + vals.zoom * 2.5;
      const ox = (vals.offsetX - 0.5);
      const oy = (vals.offsetY - 0.5);

      const vw = video.videoWidth || 320;
      const vh = video.videoHeight || 240;

      // Source slice: a triangular wedge near the video center.
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.hypot(w, h) * 0.6;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotAngle);
      for (let i = 0; i < segCount; i++) {
        ctx.save();
        ctx.rotate(i * angleStep);
        if (i % 2 === 1) ctx.scale(1, -1); // mirror alternating slices
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(radius, -Math.tan(angleStep / 2) * radius);
        ctx.lineTo(radius, Math.tan(angleStep / 2) * radius);
        ctx.closePath();
        ctx.clip();
        // Draw webcam scaled into this wedge
        const drawW = vw * zoom;
        const drawH = vh * zoom;
        ctx.drawImage(
          video,
          -drawW / 2 + ox * drawW,
          -drawH / 2 + oy * drawH,
          drawW,
          drawH,
        );
        ctx.restore();
      }
      ctx.restore();

      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [collapsed]);

  type SliderDef = { k: KaleidoKnob; label: string; fmt: (v: number) => string };
  const SLIDERS: SliderDef[] = [
    { k: "segments", label: "Segs",   fmt: (v) => `${2 + Math.floor(v * 14)}` },
    { k: "rotation", label: "Rot",    fmt: (v) => `${Math.round(v * 360)}°` },
    { k: "zoom",     label: "Zoom",   fmt: (v) => `${(0.5 + v * 2.5).toFixed(2)}x` },
    { k: "offsetX",  label: "OffX",   fmt: (v) => `${(v - 0.5).toFixed(2)}` },
    { k: "offsetY",  label: "OffY",   fmt: (v) => `${(v - 0.5).toFixed(2)}` },
  ];

  const ROW_HEIGHT = 26;
  const bottomFor = (knob: KaleidoKnob): number => {
    const idx = SLIDERS.findIndex((s) => s.k === knob);
    const distFromBottom = SLIDERS.length - 1 - idx;
    return 8 + distFromBottom * ROW_HEIGHT + ROW_HEIGHT / 2;
  };

  return (
    <Card className="bg-background border border-violet-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 380 }}>
      <video ref={videoRef} className="hidden" playsInline muted />
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id} title="KALEIDOSCOPE" subtitle="webcam"
          icon={<Hexagon className="w-5 h-5 text-violet-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        />
        {!collapsed && (
          <>
            <canvas ref={canvasRef} className="w-full bg-black nodrag nopan"
              style={{ height: 300, display: "block" }} />
            <Button size="sm" variant={cameraOn ? "default" : "outline"}
              className="w-full h-7 text-[11px] rounded-none nodrag nopan"
              onClick={() => cameraOn ? stopCamera() : startCamera()}>
              {cameraOn ? "Stop camera" : "Start camera"}
            </Button>
            <div className="nodrag nopan">
              {SLIDERS.map((s) => {
                const isPatched = patched[s.k];
                const dataMap: Record<KaleidoKnob, number> = { segments, rotation, zoom, offsetX, offsetY };
                const displayVal = moduleRef.current?.getSnapshot().values[s.k] ?? dataMap[s.k];
                return (
                  <div key={s.k} className="flex items-center gap-2" style={{ height: ROW_HEIGHT }}>
                    <Label className={"text-[11px] font-mono font-bold w-12 shrink-0 " + (isPatched ? "text-violet-300" : "text-violet-400")}>{s.label}</Label>
                    <Slider value={[displayVal]} min={0} max={1} step={0.001}
                      onValueChange={([v]) => !isPatched && onUpdateParameter(id, s.k, v)}
                      className={"flex-1 " + (isPatched ? "pointer-events-none [&_[role=slider]]:bg-violet-400 [&_[role=slider]]:border-violet-300" : "")}
                      aria-label={s.label} />
                    <span className={"text-[10px] font-mono tabular-nums w-12 text-right " + (isPatched ? "text-violet-300 font-bold" : "text-foreground")}>
                      {s.fmt(displayVal)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {!collapsed && KALEIDO_KNOBS.map((k) => (
        <Handle key={k} id={"in-" + k} type="target" position={Position.Left}
          className={"!border-2 !border-background !w-3.5 !h-3.5 " + (patched[k] ? "!bg-violet-300" : "!bg-violet-400")}
          style={{ top: "auto", bottom: bottomFor(k) + "px" }} />
      ))}
    </Card>
  );
}

export default KaleidoscopeNode;
