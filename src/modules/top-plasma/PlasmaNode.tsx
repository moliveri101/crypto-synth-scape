import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Waves } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import {
  PLASMA_KNOBS,
  type PlasmaKnob, type PlasmaModule,
} from "./PlasmaModule";

interface PlasmaData {
  type: "top-plasma";
  speed: number; scale: number; palette: number;
  spread: number; brightness: number;
  collapsed: boolean;
}

// Convert HSL to RGB (all 0..1)
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 1 / 6)      { r = c; g = x; b = 0; }
  else if (h < 2 / 6) { r = x; g = c; b = 0; }
  else if (h < 3 / 6) { r = 0; g = c; b = x; }
  else if (h < 4 / 6) { r = 0; g = x; b = c; }
  else if (h < 5 / 6) { r = x; g = 0; b = c; }
  else                { r = c; g = 0; b = x; }
  return [r + m, g + m, b + m];
}

function PlasmaNode({ data, id }: NodeProps<PlasmaData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { speed, scale, palette, spread, brightness, collapsed } = data;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moduleRef = useRef<PlasmaModule | null>(null);
  const rafRef = useRef<number | null>(null);

  const [patched, setPatched] = useState<Record<PlasmaKnob, boolean>>({
    speed: false, scale: false, palette: false, spread: false, brightness: false,
  });

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as PlasmaModule | undefined;
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

    // Render at a low resolution for perf, then upscale.
    const RW = 96, RH = 72;
    const off = document.createElement("canvas");
    off.width = RW; off.height = RH;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    const img = offCtx.createImageData(RW, RH);

    let t = 0;
    let lastT = performance.now();

    const render = () => {
      const mod = moduleRef.current;
      if (!mod) { rafRef.current = requestAnimationFrame(render); return; }
      const v = mod.getSnapshot().values;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

      const now = performance.now();
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;
      t += dt * (0.05 + v.speed * 3);

      const freq = 0.05 + v.scale * 0.4;
      const hueBase = v.palette;
      const hueSpread = v.spread * 1.5;
      const light = 0.15 + v.brightness * 0.55;

      const buf = img.data;
      for (let y = 0; y < RH; y++) {
        for (let x = 0; x < RW; x++) {
          const fx = x - RW / 2;
          const fy = y - RH / 2;
          // Classic plasma: sum of sines at different scales
          const p =
            Math.sin(fx * freq + t) +
            Math.sin((fy * freq + t) * 1.3) +
            Math.sin((fx + fy) * freq * 0.7 + t * 0.9) +
            Math.sin(Math.sqrt(fx * fx + fy * fy) * freq * 1.1 + t * 1.2);
          // p ranges roughly -4..+4; normalize to 0..1
          const n = (p + 4) / 8;
          const hue = (hueBase + n * hueSpread) % 1;
          const [r, g, b] = hslToRgb(hue < 0 ? hue + 1 : hue, 0.9, light);
          const idx = (y * RW + x) * 4;
          buf[idx] = r * 255;
          buf[idx + 1] = g * 255;
          buf[idx + 2] = b * 255;
          buf[idx + 3] = 255;
        }
      }
      offCtx.putImageData(img, 0, 0);
      // Upscale with smoothing for a soft plasma look
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, w, h);

      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [collapsed]);

  type SliderDef = { k: PlasmaKnob; label: string; fmt: (v: number) => string };
  const SLIDERS: SliderDef[] = [
    { k: "speed",      label: "Speed", fmt: (v) => v.toFixed(2) },
    { k: "scale",      label: "Scale", fmt: (v) => v.toFixed(2) },
    { k: "palette",    label: "Hue",   fmt: (v) => `${Math.round(v * 360)}°` },
    { k: "spread",     label: "Spread",fmt: (v) => v.toFixed(2) },
    { k: "brightness", label: "Bright",fmt: (v) => v.toFixed(2) },
  ];

  const ROW_HEIGHT = 26;
  const bottomFor = (knob: PlasmaKnob): number => {
    const idx = SLIDERS.findIndex((s) => s.k === knob);
    const distFromBottom = SLIDERS.length - 1 - idx;
    return 8 + distFromBottom * ROW_HEIGHT + ROW_HEIGHT / 2;
  };

  return (
    <Card className="bg-background border border-pink-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 360 }}>
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id} title="PLASMA" subtitle="procedural field"
          icon={<Waves className="w-5 h-5 text-pink-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        />
        {!collapsed && (
          <>
            <canvas ref={canvasRef} className="w-full bg-black nodrag nopan"
              style={{ height: 240, display: "block" }} />
            <div className="nodrag nopan">
              {SLIDERS.map((s) => {
                const isPatched = patched[s.k];
                const dataMap: Record<PlasmaKnob, number> = { speed, scale, palette, spread, brightness };
                const displayVal = moduleRef.current?.getSnapshot().values[s.k] ?? dataMap[s.k];
                return (
                  <div key={s.k} className="flex items-center gap-2" style={{ height: ROW_HEIGHT }}>
                    <Label className={"text-[11px] font-mono font-bold w-14 shrink-0 " + (isPatched ? "text-pink-300" : "text-pink-400")}>{s.label}</Label>
                    <Slider value={[displayVal]} min={0} max={1} step={0.001}
                      onValueChange={([v]) => !isPatched && onUpdateParameter(id, s.k, v)}
                      className={"flex-1 " + (isPatched ? "pointer-events-none [&_[role=slider]]:bg-pink-400 [&_[role=slider]]:border-pink-300" : "")}
                      aria-label={s.label} />
                    <span className={"text-[10px] font-mono tabular-nums w-14 text-right " + (isPatched ? "text-pink-300 font-bold" : "text-foreground")}>
                      {s.fmt(displayVal)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {!collapsed && PLASMA_KNOBS.map((k) => (
        <Handle key={k} id={"in-" + k} type="target" position={Position.Left}
          className={"!border-2 !border-background !w-3.5 !h-3.5 " + (patched[k] ? "!bg-pink-300" : "!bg-pink-400")}
          style={{ top: "auto", bottom: bottomFor(k) + "px" }} />
      ))}
    </Card>
  );
}

export default PlasmaNode;
