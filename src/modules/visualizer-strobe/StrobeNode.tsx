import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Zap, Maximize2, AlertTriangle } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import {
  STROBE_KNOBS, STROBE_PATTERNS, STROBE_ENVELOPES,
  type StrobeKnob, type StrobePattern, type StrobeEnvelope, type StrobeModule,
} from "./StrobeModule";

interface StrobeData {
  type: "visualizer-strobe";
  rate: number; duty: number; intensity: number; hue: number;
  colorCycle: number; jitter: number; trigger: number;
  pattern: StrobePattern;
  envelope: StrobeEnvelope;
  collapsed: boolean;
}

function StrobeNode({ data, id }: NodeProps<StrobeData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { collapsed, pattern, envelope } = data;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moduleRef = useRef<StrobeModule | null>(null);
  const rafRef = useRef<number | null>(null);
  // Keep the real-time rate in a ref so the warning banner can read it
  const effRateHzRef = useRef<number>(0);
  const [warnRate, setWarnRate] = useState(0);

  const [patched, setPatched] = useState<Record<StrobeKnob, boolean>>({
    rate: false, duty: false, intensity: false, hue: false,
    colorCycle: false, jitter: false, trigger: false,
  });

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as StrobeModule | undefined;
    if (!mod) return;
    moduleRef.current = mod;
    const update = () => setPatched({ ...mod.getSnapshot().patched });
    mod.setOnSnapshotUpdate(update);
    update();
    return () => { mod.setOnSnapshotUpdate(null); };
  }, [id]);

  // Sync warning state to effective rate once per second so we don't thrash
  useEffect(() => {
    const t = setInterval(() => setWarnRate(effRateHzRef.current), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (collapsed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Phase accumulator — wraps [0..1), one full cycle = one flash period
    let phase = 0;
    // Trigger-edge detection: when trigger input goes up by more than THR in
    // one tick, fire an extra flash by jumping phase to 0.
    let lastTrigger = 0;
    const TRIGGER_EDGE = 0.25;
    // Random-zones cache so we don't regenerate every frame
    let zoneSeed = 0;
    let lastT = performance.now();
    // Random scan line position (for 'scan' pattern)
    let scanY = 0;

    const render = () => {
      const mod = moduleRef.current;
      if (!mod) { rafRef.current = requestAnimationFrame(render); return; }
      const snap = mod.getSnapshot();
      const v = snap.values;

      const now = performance.now();
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;

      // Effective rate in Hz. Log-ish curve so the lower rates have more
      // resolution than the terrifying upper ones.
      const baseHz = 0.1 + v.rate * v.rate * 30;  // 0.1..~30
      const jitterHz = v.jitter * (Math.random() - 0.5) * baseHz * 0.8;
      const rateHz = Math.max(0.05, baseHz + jitterHz);
      effRateHzRef.current = rateHz;

      // Phase advance
      phase += dt * rateHz;

      // Check trigger input rising edge — if so, force phase to 0 for an
      // immediate flash. This is how you sync the strobe to a drum pulse.
      if (v.trigger - lastTrigger > TRIGGER_EDGE) {
        phase = 0;
        zoneSeed = Math.random();
      }
      lastTrigger = v.trigger;

      // When phase wraps past 1, new cycle — fresh random seed for 'random' pattern
      if (phase >= 1) {
        phase -= Math.floor(phase);
        zoneSeed = Math.random();
        scanY = Math.random();
      }

      // Compute the flash envelope — how "on" are we right now? (0..1)
      const duty = Math.max(0.01, v.duty);
      let flash = 0;
      const localPhase = phase / duty;
      if (localPhase <= 1) {
        switch (snap.envelope) {
          case "square":
            flash = 1;
            break;
          case "triangle":
            flash = localPhase < 0.5 ? localPhase * 2 : (1 - localPhase) * 2;
            break;
          case "gauss": {
            const x = (localPhase - 0.5) * 4; // -2..+2
            flash = Math.exp(-x * x);
            break;
          }
          case "decay":
            // Fast on, exponential off
            flash = Math.exp(-localPhase * 3);
            if (localPhase < 0.05) flash = localPhase / 0.05;
            break;
        }
      }
      flash *= v.intensity;

      // Canvas sizing
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }

      // Clear to black each frame (strobes don't blur — each flash is discrete)
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillRect(0, 0, w, h);

      if (flash < 0.001) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      // Color: base hue + colorCycle drift over time
      const hueBase = v.hue * 360;
      const hueDrift = snap.values.colorCycle * (now / 1000) * 120; // up to 120°/sec at colorCycle=1
      const hue = (hueBase + hueDrift) % 360;
      const fillColor = `hsla(${hue.toFixed(0)}, 95%, ${Math.round(50 + flash * 40)}%, ${Math.min(1, flash)})`;

      ctx.fillStyle = fillColor;

      switch (snap.pattern) {
        case "solid":
          ctx.fillRect(0, 0, w, h);
          break;

        case "halves": {
          // Left and right alternate — even cycles fire left, odd fire right.
          // Use phase-1 proxy via now to drive alternation.
          const beat = Math.floor(now / 1000 * rateHz) & 1;
          if (beat === 0) ctx.fillRect(0, 0, w / 2, h);
          else ctx.fillRect(w / 2, 0, w / 2, h);
          break;
        }

        case "quadrants": {
          // Each quadrant fires at a rotating turn; one cycle = one quad.
          const beat = Math.floor(now / 1000 * rateHz) & 3;
          const qw = w / 2, qh = h / 2;
          const qx = (beat & 1) ? qw : 0;
          const qy = (beat & 2) ? qh : 0;
          ctx.fillRect(qx, qy, qw, qh);
          break;
        }

        case "random": {
          // Random zones — deterministic per cycle via zoneSeed
          const rng = mulberry32(Math.floor(zoneSeed * 1_000_000));
          const zones = 3 + Math.floor(rng() * 5);
          for (let i = 0; i < zones; i++) {
            const zx = rng() * w;
            const zy = rng() * h;
            const zw = (rng() * 0.3 + 0.1) * w;
            const zh = (rng() * 0.3 + 0.1) * h;
            ctx.fillRect(zx, zy, zw, zh);
          }
          break;
        }

        case "scan": {
          // Horizontal bar scans down the frame each cycle
          const barH = h * 0.08;
          const y = scanY * h;
          ctx.fillRect(0, y - barH / 2, w, barH);
          // Dim trail above the bar
          ctx.fillStyle = `hsla(${hue.toFixed(0)}, 95%, 50%, ${flash * 0.3})`;
          ctx.fillRect(0, y - barH * 2, w, barH);
          break;
        }
      }

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

  // Slider definitions
  type SliderDef = {
    k: StrobeKnob; label: string; min: number; max: number; step: number;
    fmt: (v: number) => string;
  };
  type LayoutRow = { kind: "header"; title: string } | { kind: "slider"; def: SliderDef };

  // Effective rate for the label hint
  const effRateForLabel = () => {
    const r = moduleRef.current?.getSnapshot().values.rate ?? 0.15;
    return 0.1 + r * r * 30;
  };

  const LAYOUT: LayoutRow[] = [
    { kind: "header", title: "Timing" },
    { kind: "slider", def: { k: "rate",       label: "Rate",     min: 0, max: 1, step: 0.001,
                             fmt: () => `${effRateForLabel().toFixed(1)}Hz` } },
    { kind: "slider", def: { k: "duty",       label: "Duty",     min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) + "%" } },
    { kind: "slider", def: { k: "jitter",     label: "Jitter",   min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "header", title: "Look" },
    { kind: "slider", def: { k: "intensity",  label: "Intensity",min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "hue",        label: "Hue",      min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 360) + "°" } },
    { kind: "slider", def: { k: "colorCycle", label: "Cycle",    min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "header", title: "Trigger" },
    { kind: "slider", def: { k: "trigger",    label: "Input",    min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
  ];

  const ROW_HEIGHT = 28;
  const HEADER_HEIGHT = 22;

  const bottomFor = (knob: StrobeKnob): number => {
    const idx = LAYOUT.findIndex((row) => row.kind === "slider" && row.def.k === knob);
    let bottom = 8;
    for (let j = LAYOUT.length - 1; j > idx; j--) {
      bottom += LAYOUT[j].kind === "header" ? HEADER_HEIGHT : ROW_HEIGHT;
    }
    return bottom + ROW_HEIGHT / 2;
  };

  const dangerous = warnRate > 3 && warnRate < 60;

  return (
    <Card
      className="bg-background border border-yellow-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 360 }}
    >
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id}
          title="STROBE"
          subtitle="Configurable flash / trigger"
          icon={<Zap className="w-5 h-5 text-yellow-400" />}
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
            {/* Photosensitivity warning — shown any time effective rate is
                in the 3–60Hz range where flicker can trigger seizures */}
            {dangerous && (
              <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/40 text-yellow-300 text-[10px] p-2 leading-tight">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  <strong>Photosensitivity warning:</strong> flashes at {warnRate.toFixed(1)}Hz
                  may trigger seizures in photosensitive individuals. Use care.
                </span>
              </div>
            )}

            {/* Pattern + Envelope dropdowns — manual only */}
            <div className="nodrag nopan grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Pattern</Label>
                <Select
                  value={pattern}
                  onValueChange={(v) => onUpdateParameter(id, "pattern", v)}
                >
                  <SelectTrigger className="h-7 text-[11px] capitalize" onPointerDown={(e) => e.stopPropagation()}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STROBE_PATTERNS.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Envelope</Label>
                <Select
                  value={envelope}
                  onValueChange={(v) => onUpdateParameter(id, "envelope", v)}
                >
                  <SelectTrigger className="h-7 text-[11px] capitalize" onPointerDown={(e) => e.stopPropagation()}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STROBE_ENVELOPES.map((e) => (
                      <SelectItem key={e} value={e} className="capitalize">{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <canvas
              ref={canvasRef}
              className="w-full bg-black nodrag nopan"
              style={{ height: 180, display: "block" }}
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
                    <Label className={"text-[11px] font-mono font-bold w-16 shrink-0 " + (isPatched ? "text-yellow-300" : "text-yellow-400")}>
                      {s.label}
                    </Label>
                    <Slider
                      value={[displayVal]}
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      onValueChange={([val]) => !isPatched && onUpdateParameter(id, s.k, val)}
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
        STROBE_KNOBS.map((k) => (
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

// Seeded PRNG so the 'random' pattern is stable within a cycle
function mulberry32(seed: number) {
  return function() {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default StrobeNode;
