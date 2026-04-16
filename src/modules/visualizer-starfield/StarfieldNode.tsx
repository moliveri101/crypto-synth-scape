import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Stars, Maximize2 } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { STARFIELD_KNOBS, type StarfieldKnob, type StarfieldModule } from "./StarfieldModule";

interface StarfieldData {
  type: "visualizer-starfield";
  count: number; speed: number; warp: number; spread: number;
  rotation: number; twinkle: number; color: number; brightness: number;
  collapsed: boolean;
}

type Star = { x: number; y: number; z: number; pz: number; seed: number };

function hsl(h: number, s: number, l: number, a: number): string {
  const deg = ((h % 1) + 1) % 1 * 360;
  return "hsla(" + deg.toFixed(0) + ", " + s + "%, " + l + "%, " + a + ")";
}

function StarfieldNode({ data, id }: NodeProps<StarfieldData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { collapsed } = data;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moduleRef = useRef<StarfieldModule | null>(null);
  const rafRef = useRef<number | null>(null);

  const [patched, setPatched] = useState<Record<StarfieldKnob, boolean>>({
    count: false, speed: false, warp: false, spread: false,
    rotation: false, twinkle: false, color: false, brightness: false,
  });

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as StarfieldModule | undefined;
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

    const target: Record<StarfieldKnob, number> = {
      count: 250, speed: 1.5, warp: 0.3, spread: 0.8,
      rotation: 0.1, twinkle: 0.4, color: 0.6, brightness: 0.8,
    };
    const smoothed: Record<StarfieldKnob, number> = { ...target };
    const TAU_TARGET: Record<StarfieldKnob, number> = {
      count: 1.5, speed: 0.5, warp: 0.5, spread: 1.0,
      rotation: 0.8, twinkle: 0.6, color: 0.6, brightness: 0.5,
    };
    const TAU_SMOOTH: Record<StarfieldKnob, number> = {
      count: 0.4, speed: 0.15, warp: 0.15, spread: 0.3,
      rotation: 0.2, twinkle: 0.15, color: 0.15, brightness: 0.1,
    };

    const stars: Star[] = [];
    let rotationAngle = 0;
    let lastT = performance.now();

    const spawn = (w: number, h: number, spread: number): Star => {
      const spreadRange = Math.max(w, h) * (0.5 + spread * 1.5);
      return {
        x: (Math.random() - 0.5) * spreadRange,
        y: (Math.random() - 0.5) * spreadRange,
        z: Math.random() * 1000 + 100,
        pz: 0,
        seed: Math.random() * Math.PI * 2,
      };
    };

    const render = () => {
      const mod = moduleRef.current;
      if (!mod) { rafRef.current = requestAnimationFrame(render); return; }
      const { values } = mod.getSnapshot();

      const now = performance.now();
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;

      for (const k of STARFIELD_KNOBS) {
        const aT = 1 - Math.exp(-dt / TAU_TARGET[k]);
        const aS = 1 - Math.exp(-dt / TAU_SMOOTH[k]);
        target[k] += (values[k] - target[k]) * aT;
        smoothed[k] += (target[k] - smoothed[k]) * aS;
      }

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }

      // Maintain star count
      const wantCount = Math.round(smoothed.count);
      while (stars.length < wantCount) stars.push(spawn(w, h, smoothed.spread));
      while (stars.length > wantCount) stars.pop();

      // Camera roll
      rotationAngle += dt * smoothed.rotation * 0.6;
      const cosR = Math.cos(rotationAngle);
      const sinR = Math.sin(rotationAngle);

      // Fade background; warp blends in more blur when high (long streaks)
      const bgFade = 0.35 - smoothed.warp * 0.3;
      ctx.fillStyle = "rgba(0, 0, 0, " + Math.max(0.05, bgFade) + ")";
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const focal = 250;
      const speedPx = smoothed.speed * 400;

      ctx.globalCompositeOperation = "lighter";

      for (const s of stars) {
        s.pz = s.z;
        s.z -= speedPx * dt;

        // Recycle stars that passed the camera
        if (s.z <= 1) {
          s.x = (Math.random() - 0.5) * w * (1 + smoothed.spread);
          s.y = (Math.random() - 0.5) * h * (1 + smoothed.spread);
          s.z = 1000;
          s.pz = 1000;
          s.seed = Math.random() * Math.PI * 2;
          continue;
        }

        // Perspective projection + rotation
        const rx = s.x * cosR - s.y * sinR;
        const ry = s.x * sinR + s.y * cosR;
        const sx = cx + (rx / s.z) * focal;
        const sy = cy + (ry / s.z) * focal;
        const psx = cx + (rx / s.pz) * focal;
        const psy = cy + (ry / s.pz) * focal;

        // Depth-based size and brightness
        const depthNorm = 1 - s.z / 1000;
        const size = 0.5 + depthNorm * 2.5;
        const twink = 1 - smoothed.twinkle * 0.7 * (0.5 + 0.5 * Math.sin(now * 0.005 + s.seed));
        const alpha = Math.min(1, depthNorm * 1.4) * smoothed.brightness * twink;

        ctx.strokeStyle = hsl(smoothed.color + depthNorm * 0.1, 70, 85, alpha);
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.moveTo(psx, psy);
        ctx.lineTo(sx, sy);
        ctx.stroke();

        // Bright tip
        ctx.fillStyle = hsl(smoothed.color + depthNorm * 0.1, 70, 95, alpha);
        ctx.beginPath();
        ctx.arc(sx, sy, size * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [collapsed]);

  const openFullscreen = () => {
    const canvas = canvasRef.current;
    if (canvas?.requestFullscreen) canvas.requestFullscreen();
  };

  type SliderDef = {
    k: StarfieldKnob; label: string; min: number; max: number; step: number;
    fmt: (v: number) => string;
  };
  type LayoutRow = { kind: "header"; title: string } | { kind: "slider"; def: SliderDef };

  const LAYOUT: LayoutRow[] = [
    { kind: "header", title: "Flight" },
    { kind: "slider", def: { k: "speed",      label: "Speed",    min: 0, max: 5, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "warp",       label: "Warp",     min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "rotation",   label: "Roll",     min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "header", title: "Field" },
    { kind: "slider", def: { k: "count",      label: "Count",    min: 50, max: 800, step: 1, fmt: (v) => Math.round(v).toString() } },
    { kind: "slider", def: { k: "spread",     label: "Spread",   min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "header", title: "Appearance" },
    { kind: "slider", def: { k: "twinkle",    label: "Twinkle",  min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "color",      label: "Color",    min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "brightness", label: "Bright",   min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
  ];

  const ROW_HEIGHT = 28;
  const HEADER_HEIGHT = 22;

  const bottomFor = (knob: StarfieldKnob): number => {
    const idx = LAYOUT.findIndex((row) => row.kind === "slider" && row.def.k === knob);
    let bottom = 8;
    for (let j = LAYOUT.length - 1; j > idx; j--) {
      bottom += LAYOUT[j].kind === "header" ? HEADER_HEIGHT : ROW_HEIGHT;
    }
    return bottom + ROW_HEIGHT / 2;
  };

  return (
    <Card
      className="bg-background border border-yellow-500/40 shadow-lg rounded-xl overflow-hidden relative"
      style={{ minWidth: 360 }}
    >
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id}
          title="STARFIELD"
          subtitle="Hyperspace"
          icon={<Stars className="w-5 h-5 text-yellow-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        >
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            aria-label="Fullscreen"
            onClick={openFullscreen}
          >
            <Maximize2 className="w-3 h-3" />
          </Button>
        </ModuleHeader>

        {!collapsed && (
          <>
            <canvas
              ref={canvasRef}
              className="w-full rounded-md bg-black nodrag nopan"
              style={{ height: 240, display: "block" }}
              onDoubleClick={openFullscreen}
            />

            <div className="nodrag nopan">
              {LAYOUT.map((row, i) => {
                if (row.kind === "header") {
                  return (
                    <div
                      key={"h-" + i}
                      className="flex items-center gap-2 px-1"
                      style={{ height: HEADER_HEIGHT }}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-300/80">
                        {row.title}
                      </span>
                      <div className="flex-1 h-px bg-yellow-500/20" />
                    </div>
                  );
                }
                const s = row.def;
                const isPatched = patched[s.k];
                const displayVal = moduleRef.current?.getSnapshot().values[s.k] ?? data[s.k];
                return (
                  <div
                    key={s.k}
                    className="flex items-center gap-2"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <Label className={"text-[11px] font-mono font-bold w-14 shrink-0 " + (isPatched ? "text-yellow-300" : "text-yellow-400")}>
                      {s.label}
                    </Label>
                    <Slider
                      value={[displayVal]}
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      onValueChange={([v]) => !isPatched && onUpdateParameter(id, s.k, v)}
                      className={"flex-1 " + (isPatched ? "pointer-events-none [&_[role=slider]]:bg-yellow-400 [&_[role=slider]]:border-yellow-300" : "")}
                      aria-label={s.label}
                    />
                    <span className={"text-[10px] font-mono tabular-nums w-12 text-right " + (isPatched ? "text-yellow-300 font-bold" : "text-foreground")}>
                      {s.fmt(displayVal)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {!collapsed &&
        STARFIELD_KNOBS.map((k) => (
          <Handle
            key={k}
            id={"in-" + k}
            type="target"
            position={Position.Left}
            className={"!border-2 !border-background !w-3.5 !h-3.5 " + (patched[k] ? "!bg-yellow-300" : "!bg-yellow-400")}
            style={{
              top: "auto",
              bottom: bottomFor(k) + "px",
            }}
          />
        ))}
    </Card>
  );
}

export default StarfieldNode;
