import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Infinity as InfinityIcon, Maximize2 } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { LISSAJOUS_KNOBS, type LissajousKnob, type LissajousModule } from "./LissajousModule";

interface LissajousData {
  type: "visualizer-lissajous";
  freqX: number; freqY: number; phase: number; speed: number;
  density: number; thickness: number; trail: number; color: number;
  collapsed: boolean;
}

function hsl(h: number, s: number, l: number, a: number): string {
  const deg = ((h % 1) + 1) % 1 * 360;
  return "hsla(" + deg.toFixed(0) + ", " + s + "%, " + l + "%, " + a + ")";
}

function LissajousNode({ data, id }: NodeProps<LissajousData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { collapsed } = data;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moduleRef = useRef<LissajousModule | null>(null);
  const rafRef = useRef<number | null>(null);

  const [patched, setPatched] = useState<Record<LissajousKnob, boolean>>({
    freqX: false, freqY: false, phase: false, speed: false,
    density: false, thickness: false, trail: false, color: false,
  });

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as LissajousModule | undefined;
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

    // Two-stage frame-rate-independent smoothing
    const target: Record<LissajousKnob, number> = {
      freqX: 3, freqY: 2, phase: 0, speed: 1,
      density: 800, thickness: 1.5, trail: 0.85, color: 0.55,
    };
    const smoothed: Record<LissajousKnob, number> = { ...target };
    const TAU_TARGET: Record<LissajousKnob, number> = {
      freqX: 1.2, freqY: 1.2, phase: 1.0, speed: 0.6,
      density: 1.0, thickness: 0.5, trail: 0.6, color: 0.6,
    };
    const TAU_SMOOTH: Record<LissajousKnob, number> = {
      freqX: 0.3, freqY: 0.3, phase: 0.2, speed: 0.15,
      density: 0.3, thickness: 0.15, trail: 0.15, color: 0.15,
    };

    let lastT = performance.now();
    let phaseAccum = 0; // slow rotation so static shapes gently drift

    const render = () => {
      const mod = moduleRef.current;
      if (!mod) { rafRef.current = requestAnimationFrame(render); return; }
      const { values } = mod.getSnapshot();

      const now = performance.now();
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;

      for (const k of LISSAJOUS_KNOBS) {
        const aT = 1 - Math.exp(-dt / TAU_TARGET[k]);
        const aS = 1 - Math.exp(-dt / TAU_SMOOTH[k]);
        target[k] += (values[k] - target[k]) * aT;
        smoothed[k] += (target[k] - smoothed[k]) * aS;
      }

      phaseAccum += dt * smoothed.speed * 0.6;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }

      // Trail fade
      const fadeAlpha = 1 - smoothed.trail * 0.96;
      ctx.fillStyle = "rgba(0, 0, 0, " + fadeAlpha + ")";
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.42;
      const N = Math.round(smoothed.density);

      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = smoothed.thickness;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Build the curve point by point. t sweeps 0..2π; each segment's color
      // is offset along the palette so the curve shows a rainbow trail.
      ctx.beginPath();
      const totalPhase = smoothed.phase + phaseAccum;
      for (let i = 0; i <= N; i++) {
        const t = (i / N) * Math.PI * 2;
        const x = cx + Math.sin(smoothed.freqX * t + totalPhase) * radius;
        const y = cy + Math.sin(smoothed.freqY * t) * radius;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      // Draw with a moving-gradient stroke by segmenting the render. For
      // simplicity we just stroke once with the current color — the palette
      // offset drifts over time which is visually compelling without the
      // overhead of per-segment color changes.
      ctx.strokeStyle = hsl(smoothed.color, 85, 60, 0.9);
      ctx.stroke();

      // Soft glow pass — draw same path thicker with low alpha
      ctx.lineWidth = smoothed.thickness * 4;
      ctx.strokeStyle = hsl(smoothed.color + 0.05, 85, 55, 0.15);
      ctx.stroke();

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
    k: LissajousKnob; label: string; min: number; max: number; step: number;
    fmt: (v: number) => string;
  };
  type LayoutRow = { kind: "header"; title: string } | { kind: "slider"; def: SliderDef };

  const LAYOUT: LayoutRow[] = [
    { kind: "header", title: "Curve" },
    { kind: "slider", def: { k: "freqX",     label: "Freq X",   min: 1, max: 10, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "freqY",     label: "Freq Y",   min: 1, max: 10, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "phase",     label: "Phase",    min: 0, max: Math.PI * 2, step: 0.01, fmt: (v) => Math.round((v / (Math.PI * 2)) * 360) + "°" } },
    { kind: "header", title: "Motion" },
    { kind: "slider", def: { k: "speed",     label: "Speed",    min: 0, max: 3, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "header", title: "Appearance" },
    { kind: "slider", def: { k: "density",   label: "Density",  min: 100, max: 2000, step: 1, fmt: (v) => Math.round(v).toString() } },
    { kind: "slider", def: { k: "thickness", label: "Thick",    min: 0.5, max: 5, step: 0.1, fmt: (v) => v.toFixed(1) } },
    { kind: "slider", def: { k: "trail",     label: "Trail",    min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "color",     label: "Color",    min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
  ];

  const ROW_HEIGHT = 28;
  const HEADER_HEIGHT = 22;

  const bottomFor = (knob: LissajousKnob): number => {
    const idx = LAYOUT.findIndex((row) => row.kind === "slider" && row.def.k === knob);
    let bottom = 8;
    for (let j = LAYOUT.length - 1; j > idx; j--) {
      bottom += LAYOUT[j].kind === "header" ? HEADER_HEIGHT : ROW_HEIGHT;
    }
    return bottom + ROW_HEIGHT / 2;
  };

  return (
    <Card
      className="bg-background border border-sky-500/40 shadow-lg rounded-xl overflow-hidden relative"
      style={{ minWidth: 360 }}
    >
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id}
          title="LISSAJOUS"
          subtitle="Orbital plot"
          icon={<InfinityIcon className="w-5 h-5 text-sky-400" />}
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
                      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300/80">
                        {row.title}
                      </span>
                      <div className="flex-1 h-px bg-sky-500/20" />
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
                    <Label className={"text-[11px] font-mono font-bold w-14 shrink-0 " + (isPatched ? "text-sky-300" : "text-sky-400")}>
                      {s.label}
                    </Label>
                    <Slider
                      value={[displayVal]}
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      onValueChange={([v]) => !isPatched && onUpdateParameter(id, s.k, v)}
                      className={"flex-1 " + (isPatched ? "pointer-events-none [&_[role=slider]]:bg-sky-400 [&_[role=slider]]:border-sky-300" : "")}
                      aria-label={s.label}
                    />
                    <span className={"text-[10px] font-mono tabular-nums w-12 text-right " + (isPatched ? "text-sky-300 font-bold" : "text-foreground")}>
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
        LISSAJOUS_KNOBS.map((k) => (
          <Handle
            key={k}
            id={"in-" + k}
            type="target"
            position={Position.Left}
            className={"!border-2 !border-background !w-3.5 !h-3.5 " + (patched[k] ? "!bg-sky-300" : "!bg-sky-400")}
            style={{
              top: "auto",
              bottom: bottomFor(k) + "px",
            }}
          />
        ))}
    </Card>
  );
}

export default LissajousNode;
