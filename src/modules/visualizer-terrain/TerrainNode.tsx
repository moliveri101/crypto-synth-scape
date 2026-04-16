import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Mountain, Maximize2 } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { TERRAIN_KNOBS, type TerrainKnob, type TerrainModule } from "./TerrainModule";

interface TerrainData {
  type: "visualizer-terrain";
  ch1: number; ch2: number; ch3: number; ch4: number; ch5: number; ch6: number;
  amplitude: number; depth: number; scroll: number;
  fill: number; color: number; glow: number;
  collapsed: boolean;
}

const CHANNEL_COUNT = 6;
const CHANNEL_KEYS: TerrainKnob[] = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch6"];
const HISTORY_LEN = 96;

function hsl(h: number, s: number, l: number, a: number): string {
  const deg = ((h % 1) + 1) % 1 * 360;
  return "hsla(" + deg.toFixed(0) + ", " + s + "%, " + l + "%, " + a + ")";
}

function TerrainNode({ data, id }: NodeProps<TerrainData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { collapsed } = data;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moduleRef = useRef<TerrainModule | null>(null);
  const rafRef = useRef<number | null>(null);

  const [patched, setPatched] = useState<Record<TerrainKnob, boolean>>({
    ch1: false, ch2: false, ch3: false, ch4: false, ch5: false, ch6: false,
    amplitude: false, depth: false, scroll: false,
    fill: false, color: false, glow: false,
  });

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as TerrainModule | undefined;
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

    // Per-channel rolling history. Newest sample at the end; we shift left.
    const history: number[][] = Array.from({ length: CHANNEL_COUNT }, () => new Array(HISTORY_LEN).fill(0));
    let scrollAccum = 0;
    let lastT = performance.now();

    const render = () => {
      const mod = moduleRef.current;
      if (!mod) { rafRef.current = requestAnimationFrame(render); return; }
      const { values } = mod.getSnapshot();

      const now = performance.now();
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;

      // Scroll rate: 0..~15 samples/sec
      scrollAccum += dt * (1 + values.scroll * 14);
      while (scrollAccum >= 1) {
        scrollAccum -= 1;
        for (let i = 0; i < CHANNEL_COUNT; i++) {
          history[i].shift();
          history[i].push(values[CHANNEL_KEYS[i]]);
        }
      }

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }

      // Clear with dark gradient background
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "rgb(8, 4, 20)");
      bg.addColorStop(1, "rgb(2, 1, 8)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Axonometric offset per ridge for the "layered landscape" look.
      // Back ridges are higher up and slightly to the right.
      const depthPx = 8 + values.depth * 32; // pixels between ridges
      const xShift = depthPx * 0.4;          // horizontal skew per ridge
      const amp = h * (0.08 + values.amplitude * 0.32);
      const baseY = h - depthPx - 10;

      ctx.globalCompositeOperation = "lighter";

      // Draw back-to-front so nearer ridges cover farther ones
      for (let c = CHANNEL_COUNT - 1; c >= 0; c--) {
        const hist = history[c];
        const yOffset = baseY - c * depthPx;
        const xOffset = c * xShift;

        // Depth-fade: back ridges dimmer, front brighter
        const depthFactor = 0.35 + (1 - c / (CHANNEL_COUNT - 1)) * 0.65;
        const hue = values.color + c * 0.04;

        ctx.beginPath();
        ctx.moveTo(xOffset, yOffset);
        for (let i = 0; i < HISTORY_LEN; i++) {
          const x = xOffset + (i / (HISTORY_LEN - 1)) * (w - xOffset - 20);
          const y = yOffset - hist[i] * amp;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }

        // Fill to baseline for the "mountain" look
        if (values.fill > 0.02) {
          ctx.save();
          const endX = xOffset + (w - xOffset - 20);
          ctx.lineTo(endX, yOffset);
          ctx.lineTo(xOffset, yOffset);
          ctx.closePath();
          const grad = ctx.createLinearGradient(0, yOffset - amp, 0, yOffset);
          grad.addColorStop(0, hsl(hue, 80, 55, 0.6 * values.fill * depthFactor));
          grad.addColorStop(1, hsl(hue, 80, 35, 0.2 * values.fill * depthFactor));
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.restore();
        }

        // Re-draw the ridge line on top for crisp outline
        ctx.beginPath();
        for (let i = 0; i < HISTORY_LEN; i++) {
          const x = xOffset + (i / (HISTORY_LEN - 1)) * (w - xOffset - 20);
          const y = yOffset - hist[i] * amp;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = hsl(hue, 85, 65, 0.9 * depthFactor);
        ctx.lineWidth = 1 + values.glow * 1.5;
        ctx.stroke();

        // Glow pass
        if (values.glow > 0.02) {
          ctx.strokeStyle = hsl(hue, 85, 65, 0.15 * depthFactor * values.glow);
          ctx.lineWidth = 4 + values.glow * 6;
          ctx.stroke();
        }
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
    k: TerrainKnob; label: string; min: number; max: number; step: number;
    fmt: (v: number) => string;
  };
  type LayoutRow = { kind: "header"; title: string } | { kind: "slider"; def: SliderDef };

  const LAYOUT: LayoutRow[] = [
    { kind: "header", title: "Channels" },
    ...CHANNEL_KEYS.map((k, i) => ({
      kind: "slider" as const,
      def: { k, label: "Ch " + (i + 1), min: 0, max: 1, step: 0.01, fmt: (v: number) => v.toFixed(2) },
    })),
    { kind: "header", title: "Landscape" },
    { kind: "slider", def: { k: "amplitude", label: "Height",  min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "depth",     label: "Depth",   min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "scroll",    label: "Scroll",  min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "header", title: "Appearance" },
    { kind: "slider", def: { k: "fill",      label: "Fill",    min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "color",     label: "Color",   min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "glow",      label: "Glow",    min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
  ];

  const ROW_HEIGHT = 28;
  const HEADER_HEIGHT = 22;

  const bottomFor = (knob: TerrainKnob): number => {
    const idx = LAYOUT.findIndex((row) => row.kind === "slider" && row.def.k === knob);
    let bottom = 8;
    for (let j = LAYOUT.length - 1; j > idx; j--) {
      bottom += LAYOUT[j].kind === "header" ? HEADER_HEIGHT : ROW_HEIGHT;
    }
    return bottom + ROW_HEIGHT / 2;
  };

  return (
    <Card
      className="bg-background border border-lime-500/40 shadow-lg rounded-xl overflow-hidden relative"
      style={{ minWidth: 360 }}
    >
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id}
          title="TERRAIN"
          subtitle="Scrolling heightmap"
          icon={<Mountain className="w-5 h-5 text-lime-400" />}
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
                      <span className="text-[10px] font-bold uppercase tracking-wider text-lime-300/80">
                        {row.title}
                      </span>
                      <div className="flex-1 h-px bg-lime-500/20" />
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
                    <Label className={"text-[11px] font-mono font-bold w-14 shrink-0 " + (isPatched ? "text-lime-300" : "text-lime-400")}>
                      {s.label}
                    </Label>
                    <Slider
                      value={[displayVal]}
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      onValueChange={([v]) => !isPatched && onUpdateParameter(id, s.k, v)}
                      className={"flex-1 " + (isPatched ? "pointer-events-none [&_[role=slider]]:bg-lime-400 [&_[role=slider]]:border-lime-300" : "")}
                      aria-label={s.label}
                    />
                    <span className={"text-[10px] font-mono tabular-nums w-12 text-right " + (isPatched ? "text-lime-300 font-bold" : "text-foreground")}>
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
        TERRAIN_KNOBS.map((k) => (
          <Handle
            key={k}
            id={"in-" + k}
            type="target"
            position={Position.Left}
            className={"!border-2 !border-background !w-3.5 !h-3.5 " + (patched[k] ? "!bg-lime-300" : "!bg-lime-400")}
            style={{
              top: "auto",
              bottom: bottomFor(k) + "px",
            }}
          />
        ))}
    </Card>
  );
}

export default TerrainNode;
