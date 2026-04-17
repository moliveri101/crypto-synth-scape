import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Lightbulb, Maximize2, AlertTriangle } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import {
  SIMPLE_STROBE_KNOBS, type SimpleStrobeKnob, type SimpleStrobeModule,
} from "./SimpleStrobeModule";

interface SimpleStrobeData {
  type: "visualizer-strobe-simple";
  speed: number;
  density: number;
  collapsed: boolean;
}

function SimpleStrobeNode({ data, id }: NodeProps<SimpleStrobeData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { collapsed } = data;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moduleRef = useRef<SimpleStrobeModule | null>(null);
  const rafRef = useRef<number | null>(null);

  // Expose current effective rate to the warning banner
  const effRateRef = useRef<number>(0);
  const [warnRate, setWarnRate] = useState(0);

  const [patched, setPatched] = useState<Record<SimpleStrobeKnob, boolean>>({
    speed: false, density: false,
  });

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as SimpleStrobeModule | undefined;
    if (!mod) return;
    moduleRef.current = mod;
    const update = () => setPatched({ ...mod.getSnapshot().patched });
    mod.setOnSnapshotUpdate(update);
    update();
    return () => { mod.setOnSnapshotUpdate(null); };
  }, [id]);

  // Poll the effective rate twice per second for the warning banner
  useEffect(() => {
    const t = setInterval(() => setWarnRate(effRateRef.current), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (collapsed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Phase accumulator — wraps [0..1), one full cycle per flash period
    let phase = 0;
    let lastT = performance.now();

    const render = () => {
      const mod = moduleRef.current;
      if (!mod) { rafRef.current = requestAnimationFrame(render); return; }
      const v = mod.getSnapshot().values;

      const now = performance.now();
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;

      // Speed maps 0..1 → 0.5..30 Hz with a gentle curve so the low end has
      // finer resolution (hand-controllable) and the top end gets scary fast.
      const rateHz = 0.5 + v.speed * v.speed * 29.5;
      effRateRef.current = rateHz;

      phase += dt * rateHz;
      if (phase >= 1) phase -= Math.floor(phase);

      // Duty — fraction of the cycle where the flash is "on"
      const duty = Math.max(0.01, v.density);
      const on = phase < duty;

      // Canvas sizing
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }

      ctx.fillStyle = on ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)";
      ctx.fillRect(0, 0, w, h);

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

  // Effective rate for the slider's live label
  const effRateForLabel = () => {
    const s = moduleRef.current?.getSnapshot().values.speed ?? data.speed;
    return 0.5 + s * s * 29.5;
  };

  const SLIDERS: Array<{
    k: SimpleStrobeKnob; label: string; fmt: (v: number) => string;
  }> = [
    { k: "speed",   label: "Speed",   fmt: () => `${effRateForLabel().toFixed(1)}Hz` },
    { k: "density", label: "Density", fmt: (v) => Math.round(v * 100) + "%" },
  ];

  const ROW_HEIGHT = 28;
  const bottomFor = (knob: SimpleStrobeKnob): number => {
    const idx = SLIDERS.findIndex((s) => s.k === knob);
    const distanceFromBottom = SLIDERS.length - 1 - idx;
    return 8 + distanceFromBottom * ROW_HEIGHT + ROW_HEIGHT / 2;
  };

  const dangerous = warnRate > 3 && warnRate < 60;

  return (
    <Card
      className="bg-background border border-white/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 320 }}
    >
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id}
          title="SIMPLE STROBE"
          subtitle="Pure white flash"
          icon={<Lightbulb className="w-5 h-5 text-white" />}
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
            {dangerous && (
              <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/40 text-yellow-300 text-[10px] p-2 leading-tight">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  <strong>Photosensitivity warning:</strong> flashes at {warnRate.toFixed(1)}Hz
                  may trigger seizures in photosensitive individuals.
                </span>
              </div>
            )}

            <canvas
              ref={canvasRef}
              className="w-full bg-black nodrag nopan"
              style={{ height: 200, display: "block" }}
              onDoubleClick={openFullscreen}
            />

            <div className="nodrag nopan">
              {SLIDERS.map((s) => {
                const isPatched = patched[s.k];
                const displayVal = moduleRef.current?.getSnapshot().values[s.k] ?? data[s.k];
                return (
                  <div
                    key={s.k}
                    className="flex items-center gap-2"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <Label className={"text-[11px] font-mono font-bold w-16 shrink-0 " + (isPatched ? "text-white" : "text-muted-foreground")}>
                      {s.label}
                    </Label>
                    <Slider
                      value={[displayVal]}
                      min={0}
                      max={1}
                      step={0.001}
                      onValueChange={([val]) => !isPatched && onUpdateParameter(id, s.k, val)}
                      className={"flex-1 " + (isPatched ? "pointer-events-none [&_[role=slider]]:bg-white [&_[role=slider]]:border-white" : "")}
                      aria-label={s.label}
                    />
                    <span className={"text-[10px] font-mono tabular-nums w-12 text-right " + (isPatched ? "text-white font-bold" : "text-foreground")}>
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
        SIMPLE_STROBE_KNOBS.map((k) => (
          <Handle
            key={k}
            id={"in-" + k}
            type="target"
            position={Position.Left}
            className={"!border-2 !border-background !w-3.5 !h-3.5 " + (patched[k] ? "!bg-white" : "!bg-neutral-300")}
            style={{
              top: "auto",
              bottom: bottomFor(k) + "px",
            }}
          />
        ))}
    </Card>
  );
}

export default SimpleStrobeNode;
