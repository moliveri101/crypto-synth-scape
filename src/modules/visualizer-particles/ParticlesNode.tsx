import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Atom, Maximize2 } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { PARTICLES_KNOBS, type ParticlesKnob, type ParticlesModule } from "./ParticlesModule";

interface ParticlesData {
  type: "visualizer-particles";
  count: number; speed: number; gravity: number; turbulence: number;
  trail: number; size: number; color: number; spread: number;
  collapsed: boolean;
}

type Particle = { x: number; y: number; vx: number; vy: number; hue: number };

// HSL string helper — takes h in 0..1 and wraps around the color wheel
function hsl(h: number, s: number, l: number, a: number): string {
  const deg = ((h % 1) + 1) % 1 * 360;
  return `hsla(${deg.toFixed(0)}, ${s}%, ${l}%, ${a})`;
}

function ParticlesNode({ data, id }: NodeProps<ParticlesData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { collapsed } = data;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moduleRef = useRef<ParticlesModule | null>(null);
  const rafRef = useRef<number | null>(null);

  const [patched, setPatched] = useState<Record<ParticlesKnob, boolean>>({
    count: false, speed: false, gravity: false, turbulence: false,
    trail: false, size: false, color: false, spread: false,
  });

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as ParticlesModule | undefined;
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

    // Smoothed knob state — same two-stage pattern as the other visualizers
    const target: Record<ParticlesKnob, number> = {
      count: 150, speed: 1, gravity: 0.3, turbulence: 0.4,
      trail: 0.7, size: 2.5, color: 0.5, spread: 0.6,
    };
    const smoothed: Record<ParticlesKnob, number> = { ...target };
    const TAU_TARGET: Record<ParticlesKnob, number> = {
      count: 1.5, speed: 0.8, gravity: 0.8, turbulence: 0.8,
      trail: 0.6, size: 0.6, color: 0.6, spread: 1.0,
    };
    const TAU_SMOOTH: Record<ParticlesKnob, number> = {
      count: 0.4, speed: 0.2, gravity: 0.2, turbulence: 0.2,
      trail: 0.15, size: 0.15, color: 0.15, spread: 0.25,
    };

    const particles: Particle[] = [];
    let lastT = performance.now();

    // Spawn a new particle from the center outward with a random direction.
    // `spread` controls how far from center the particle starts.
    const spawn = (w: number, h: number, spread: number, colorOffset: number): Particle => {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * Math.min(w, h) * 0.5 * spread;
      return {
        x: w / 2 + Math.cos(angle) * r,
        y: h / 2 + Math.sin(angle) * r,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        hue: colorOffset + (Math.random() - 0.5) * 0.15,
      };
    };

    // Simple 2D value noise used for turbulence. Not perfect Perlin, but
    // cheap and gives a flowing, continuous force field.
    const noise = (x: number, y: number, t: number): number => {
      const s = Math.sin(x * 0.01 + t * 0.3) + Math.cos(y * 0.013 + t * 0.2) + Math.sin((x + y) * 0.007 + t * 0.1);
      return s / 3;
    };

    const render = () => {
      const mod = moduleRef.current;
      if (!mod) { rafRef.current = requestAnimationFrame(render); return; }
      const { values } = mod.getSnapshot();

      const now = performance.now();
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;

      // Frame-rate-independent smoothing for every knob
      for (const k of PARTICLES_KNOBS) {
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

      // Maintain particle count — add new ones if count grew, drop the oldest
      // if it shrank. Smoothed value drives this so it's gradual.
      const wantCount = Math.round(smoothed.count);
      while (particles.length < wantCount) {
        particles.push(spawn(w, h, smoothed.spread, smoothed.color));
      }
      while (particles.length > wantCount) {
        particles.shift();
      }

      // Trail: fade the previous frame instead of clearing. Alpha inversely
      // proportional to trail knob — trail=1 ≈ long streaks, trail=0 ≈ clean.
      const fadeAlpha = 1 - smoothed.trail * 0.95;
      ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`;
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const t = now / 1000;

      ctx.globalCompositeOperation = "lighter";

      for (const p of particles) {
        // Gravity pulls toward / pushes from center
        const dx = cx - p.x;
        const dy = cy - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
        const gForce = smoothed.gravity * 30;
        p.vx += (dx / dist) * gForce * dt;
        p.vy += (dy / dist) * gForce * dt;

        // Turbulence — angled force from noise field
        if (smoothed.turbulence > 0) {
          const n = noise(p.x, p.y, t);
          const angle = n * Math.PI * 4;
          p.vx += Math.cos(angle) * smoothed.turbulence * 60 * dt;
          p.vy += Math.sin(angle) * smoothed.turbulence * 60 * dt;
        }

        // Damping + speed scale
        p.vx *= 0.96;
        p.vy *= 0.96;
        const speedScale = 1 + smoothed.speed;
        p.x += p.vx * speedScale;
        p.y += p.vy * speedScale;

        // Wrap around edges
        if (p.x < 0) p.x += w;
        if (p.x > w) p.x -= w;
        if (p.y < 0) p.y += h;
        if (p.y > h) p.y -= h;

        // Draw — additive blend + hue from per-particle offset
        ctx.fillStyle = hsl(p.hue + smoothed.color, 85, 55, 0.9);
        ctx.beginPath();
        ctx.arc(p.x, p.y, smoothed.size, 0, Math.PI * 2);
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
    k: ParticlesKnob; label: string; min: number; max: number; step: number;
    fmt: (v: number) => string;
  };
  type LayoutRow = { kind: "header"; title: string } | { kind: "slider"; def: SliderDef };

  const LAYOUT: LayoutRow[] = [
    { kind: "header", title: "System" },
    { kind: "slider", def: { k: "count",      label: "Count",    min: 20, max: 500, step: 1, fmt: (v) => Math.round(v).toString() } },
    { kind: "slider", def: { k: "spread",     label: "Spread",   min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "size",       label: "Size",     min: 1, max: 10, step: 0.1, fmt: (v) => v.toFixed(1) } },
    { kind: "header", title: "Motion" },
    { kind: "slider", def: { k: "speed",      label: "Speed",    min: 0, max: 3, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "gravity",    label: "Gravity",  min: -1, max: 1, step: 0.01, fmt: (v) => (v >= 0 ? "+" : "") + v.toFixed(2) } },
    { kind: "slider", def: { k: "turbulence", label: "Turbul.",  min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "header", title: "Appearance" },
    { kind: "slider", def: { k: "trail",      label: "Trail",    min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "color",      label: "Color",    min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
  ];

  const ROW_HEIGHT = 28;
  const HEADER_HEIGHT = 22;

  const bottomFor = (knob: ParticlesKnob): number => {
    const idx = LAYOUT.findIndex((row) => row.kind === "slider" && row.def.k === knob);
    let bottom = 8;
    for (let j = LAYOUT.length - 1; j > idx; j--) {
      bottom += LAYOUT[j].kind === "header" ? HEADER_HEIGHT : ROW_HEIGHT;
    }
    return bottom + ROW_HEIGHT / 2;
  };

  return (
    <Card
      className="bg-background border border-emerald-500/40 shadow-lg rounded-xl overflow-hidden relative"
      style={{ minWidth: 360 }}
    >
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id}
          title="PARTICLES"
          subtitle="Generative swarm"
          icon={<Atom className="w-5 h-5 text-emerald-400" />}
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
              style={{ height: 220, display: "block" }}
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
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/80">
                        {row.title}
                      </span>
                      <div className="flex-1 h-px bg-emerald-500/20" />
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
                    <Label className={"text-[11px] font-mono font-bold w-14 shrink-0 " + (isPatched ? "text-emerald-300" : "text-emerald-400")}>
                      {s.label}
                    </Label>
                    <Slider
                      value={[displayVal]}
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      onValueChange={([v]) => !isPatched && onUpdateParameter(id, s.k, v)}
                      className={"flex-1 " + (isPatched ? "pointer-events-none [&_[role=slider]]:bg-emerald-400 [&_[role=slider]]:border-emerald-300" : "")}
                      aria-label={s.label}
                    />
                    <span className={"text-[10px] font-mono tabular-nums w-12 text-right " + (isPatched ? "text-emerald-300 font-bold" : "text-foreground")}>
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
        PARTICLES_KNOBS.map((k) => (
          <Handle
            key={k}
            id={"in-" + k}
            type="target"
            position={Position.Left}
            className={"!border-2 !border-background !w-3.5 !h-3.5 " + (patched[k] ? "!bg-emerald-300" : "!bg-emerald-400")}
            style={{
              top: "auto",
              bottom: bottomFor(k) + "px",
            }}
          />
        ))}
    </Card>
  );
}

export default ParticlesNode;
