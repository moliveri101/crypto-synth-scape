import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Network as NetworkIcon, Maximize2 } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { NETWORK_KNOBS, type NetworkKnob, type NetworkModule } from "./NetworkModule";

interface NetworkData {
  type: "visualizer-network";
  node1: number; node2: number; node3: number; node4: number;
  node5: number; node6: number; node7: number; node8: number;
  decay: number; connections: number; color: number; glow: number;
  collapsed: boolean;
}

const NODE_COUNT = 8;
const NODE_KEYS: NetworkKnob[] = ["node1", "node2", "node3", "node4", "node5", "node6", "node7", "node8"];

function hsl(h: number, s: number, l: number, a: number): string {
  const deg = ((h % 1) + 1) % 1 * 360;
  return "hsla(" + deg.toFixed(0) + ", " + s + "%, " + l + "%, " + a + ")";
}

function NetworkNode({ data, id }: NodeProps<NetworkData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { collapsed } = data;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moduleRef = useRef<NetworkModule | null>(null);
  const rafRef = useRef<number | null>(null);

  const [patched, setPatched] = useState<Record<NetworkKnob, boolean>>({
    node1: false, node2: false, node3: false, node4: false,
    node5: false, node6: false, node7: false, node8: false,
    decay: false, connections: false, color: false, glow: false,
  });

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as NetworkModule | undefined;
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

    // Per-node current activation with exponential decay toward the input value.
    // Unlike raw knob lerping, this gives each node a "ring" feel — it jumps up
    // on new input and fades away gently.
    const activation: Record<string, number> = {
      node1: 0, node2: 0, node3: 0, node4: 0, node5: 0, node6: 0, node7: 0, node8: 0,
    };
    let lastT = performance.now();

    const render = () => {
      const mod = moduleRef.current;
      if (!mod) { rafRef.current = requestAnimationFrame(render); return; }
      const { values } = mod.getSnapshot();

      const now = performance.now();
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;

      // Per-node activation: decay toward the incoming input value. Using the
      // max of (current, incoming) means a data pulse snaps it up; then it
      // decays with time constant = decay knob.
      const tau = Math.max(0.01, values.decay);
      const decayAlpha = 1 - Math.exp(-dt / tau);
      for (const key of NODE_KEYS) {
        const target = values[key];
        if (target > activation[key]) activation[key] = target;
        else activation[key] += (target - activation[key]) * decayAlpha;
      }

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }

      // Background fade (short trail effect)
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(0, 0, w, h);

      // Node positions on a circle
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.38;
      const positions: { x: number; y: number; a: number }[] = [];
      for (let i = 0; i < NODE_COUNT; i++) {
        const angle = (i / NODE_COUNT) * Math.PI * 2 - Math.PI / 2;
        positions.push({
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          a: activation[NODE_KEYS[i]],
        });
      }

      ctx.globalCompositeOperation = "lighter";

      // Draw edges first (so nodes sit on top). connections knob blends from
      // ring-only (neighbors) to fully connected (all-to-all).
      const connect = values.connections;
      const glow = values.glow;
      for (let i = 0; i < NODE_COUNT; i++) {
        for (let j = i + 1; j < NODE_COUNT; j++) {
          // Distance in ring-index space
          const ringDist = Math.min(Math.abs(i - j), NODE_COUNT - Math.abs(i - j));
          // Edge brightness: always on for neighbors, scaled up by `connect` for far edges
          const isNeighbor = ringDist <= 1;
          const edgeStrength = isNeighbor ? 1 : connect;
          if (edgeStrength < 0.02) continue;

          const combined = (positions[i].a + positions[j].a) * 0.5;
          const alpha = Math.min(1, (combined * 0.7 + 0.1) * edgeStrength);
          ctx.strokeStyle = hsl(values.color + combined * 0.15, 80, 55, alpha * (0.5 + glow * 0.5));
          ctx.lineWidth = 1 + combined * 2;
          ctx.beginPath();
          ctx.moveTo(positions[i].x, positions[i].y);
          ctx.lineTo(positions[j].x, positions[j].y);
          ctx.stroke();
        }
      }

      // Draw nodes
      for (const p of positions) {
        const nodeRadius = 4 + p.a * 14;
        // Outer glow
        const glowRadius = nodeRadius * (1.5 + glow * 2.5);
        const grad = ctx.createRadialGradient(p.x, p.y, nodeRadius * 0.2, p.x, p.y, glowRadius);
        grad.addColorStop(0, hsl(values.color + p.a * 0.1, 90, 60, 0.9 * p.a));
        grad.addColorStop(1, hsl(values.color + p.a * 0.1, 90, 60, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        // Solid core
        ctx.fillStyle = hsl(values.color, 90, 70 + p.a * 20, 0.95);
        ctx.beginPath();
        ctx.arc(p.x, p.y, nodeRadius, 0, Math.PI * 2);
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
    k: NetworkKnob; label: string; min: number; max: number; step: number;
    fmt: (v: number) => string;
  };
  type LayoutRow = { kind: "header"; title: string } | { kind: "slider"; def: SliderDef };

  const LAYOUT: LayoutRow[] = [
    { kind: "header", title: "Nodes" },
    ...NODE_KEYS.map((k, i) => ({
      kind: "slider" as const,
      def: { k, label: "Node " + (i + 1), min: 0, max: 1, step: 0.01, fmt: (v: number) => v.toFixed(2) },
    })),
    { kind: "header", title: "Behavior" },
    { kind: "slider", def: { k: "decay",       label: "Decay",    min: 0.05, max: 3, step: 0.01, fmt: (v) => v.toFixed(2) + "s" } },
    { kind: "slider", def: { k: "connections", label: "Edges",    min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "header", title: "Appearance" },
    { kind: "slider", def: { k: "color",       label: "Color",    min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "glow",        label: "Glow",     min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
  ];

  const ROW_HEIGHT = 28;
  const HEADER_HEIGHT = 22;

  const bottomFor = (knob: NetworkKnob): number => {
    const idx = LAYOUT.findIndex((row) => row.kind === "slider" && row.def.k === knob);
    let bottom = 8;
    for (let j = LAYOUT.length - 1; j > idx; j--) {
      bottom += LAYOUT[j].kind === "header" ? HEADER_HEIGHT : ROW_HEIGHT;
    }
    return bottom + ROW_HEIGHT / 2;
  };

  return (
    <Card
      className="bg-background border border-rose-500/40 shadow-lg rounded-xl overflow-hidden relative"
      style={{ minWidth: 360 }}
    >
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id}
          title="NETWORK"
          subtitle="Node graph"
          icon={<NetworkIcon className="w-5 h-5 text-rose-400" />}
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
                      <span className="text-[10px] font-bold uppercase tracking-wider text-rose-300/80">
                        {row.title}
                      </span>
                      <div className="flex-1 h-px bg-rose-500/20" />
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
                    <Label className={"text-[11px] font-mono font-bold w-14 shrink-0 " + (isPatched ? "text-rose-300" : "text-rose-400")}>
                      {s.label}
                    </Label>
                    <Slider
                      value={[displayVal]}
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      onValueChange={([v]) => !isPatched && onUpdateParameter(id, s.k, v)}
                      className={"flex-1 " + (isPatched ? "pointer-events-none [&_[role=slider]]:bg-rose-400 [&_[role=slider]]:border-rose-300" : "")}
                      aria-label={s.label}
                    />
                    <span className={"text-[10px] font-mono tabular-nums w-12 text-right " + (isPatched ? "text-rose-300 font-bold" : "text-foreground")}>
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
        NETWORK_KNOBS.map((k) => (
          <Handle
            key={k}
            id={"in-" + k}
            type="target"
            position={Position.Left}
            className={"!border-2 !border-background !w-3.5 !h-3.5 " + (patched[k] ? "!bg-rose-300" : "!bg-rose-400")}
            style={{
              top: "auto",
              bottom: bottomFor(k) + "px",
            }}
          />
        ))}
    </Card>
  );
}

export default NetworkNode;
