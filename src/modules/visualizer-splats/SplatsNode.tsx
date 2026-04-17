import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Video, VideoOff, Maximize2 } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { SPLATS_KNOBS, type SplatsKnob, type SplatsModule } from "./SplatsModule";

interface SplatsData {
  type: "visualizer-splats";
  clean: number;
  density: number; size: number; brightness: number; saturation: number;
  jitter: number; hue: number; trail: number; warp: number;
  collapsed: boolean;
}

function SplatsNode({ data, id }: NodeProps<SplatsData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { collapsed } = data;

  // Visible canvas where the splats are drawn
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Hidden offscreen canvas used only to sample video pixels (tiny resolution)
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Offscreen canvas for rendering splats. Splats are drawn here with their
  // internal additive blending, then the finished splat image is composited
  // onto the main canvas with a plain alpha crossfade against the raw video.
  // This is what makes the splats REPLACE the image rather than overlay it.
  const splatCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Hidden <video> element receiving the webcam stream
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const moduleRef = useRef<SplatsModule | null>(null);
  const rafRef = useRef<number | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [patched, setPatched] = useState<Record<SplatsKnob, boolean>>({
    clean: false,
    density: false, size: false, brightness: false, saturation: false,
    jitter: false, hue: false, trail: false, warp: false,
  });

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as SplatsModule | undefined;
    if (!mod) return;
    moduleRef.current = mod;
    const update = () => setPatched({ ...mod.getSnapshot().patched });
    mod.setOnSnapshotUpdate(update);
    update();
    return () => { mod.setOnSnapshotUpdate(null); };
  }, [id]);

  // ── Webcam lifecycle ──────────────────────────────────────────────────

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch (err: any) {
      setCameraError(err?.message ?? "Camera access denied");
      setCameraOn(false);
    }
  };

  const stopCamera = () => {
    const stream = streamRef.current;
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  };

  // Clean up on unmount
  useEffect(() => () => stopCamera(), []);

  // ── Render loop ────────────────────────────────────────────────────────

  useEffect(() => {
    if (collapsed) return;
    const canvas = canvasRef.current;
    const sampleCanvas = sampleCanvasRef.current;
    const splatCanvas = splatCanvasRef.current;
    if (!canvas || !sampleCanvas || !splatCanvas) return;
    const ctx = canvas.getContext("2d");
    const sctx = sampleCanvas.getContext("2d", { willReadFrequently: true });
    const spctx = splatCanvas.getContext("2d");
    if (!ctx || !sctx || !spctx) return;

    // Two-stage smoothing for live feel
    const target: Record<SplatsKnob, number> = {
      clean: 1.0,
      density: 0.4, size: 0.5, brightness: 0.8, saturation: 1.0,
      jitter: 0.1, hue: 0, trail: 0.3, warp: 0.05,
    };
    const smoothed: Record<SplatsKnob, number> = { ...target };
    const TAU_TARGET: Record<SplatsKnob, number> = {
      clean: 0.5,
      density: 0.8, size: 0.4, brightness: 0.4, saturation: 0.4,
      jitter: 0.3, hue: 0.5, trail: 0.3, warp: 0.5,
    };
    const TAU_SMOOTH: Record<SplatsKnob, number> = {
      clean: 0.15,
      density: 0.2, size: 0.15, brightness: 0.1, saturation: 0.1,
      jitter: 0.15, hue: 0.15, trail: 0.1, warp: 0.15,
    };

    let lastT = performance.now();

    const render = () => {
      const mod = moduleRef.current;
      if (!mod) { rafRef.current = requestAnimationFrame(render); return; }
      const { values } = mod.getSnapshot();

      const now = performance.now();
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;

      for (const k of SPLATS_KNOBS) {
        const aT = 1 - Math.exp(-dt / TAU_TARGET[k]);
        const aS = 1 - Math.exp(-dt / TAU_SMOOTH[k]);
        target[k] += (values[k] - target[k]) * aT;
        smoothed[k] += (target[k] - smoothed[k]) * aS;
      }

      // Size both canvases to the layout size
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }
      if (splatCanvas.width !== w || splatCanvas.height !== h) {
        splatCanvas.width = w; splatCanvas.height = h;
      }

      const clean = Math.max(0, Math.min(1, smoothed.clean));

      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        // Paint black until the stream arrives
        ctx.fillStyle = "rgb(0, 0, 0)";
        ctx.fillRect(0, 0, w, h);
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      // ── Render splats to the OFFSCREEN splat canvas ─────────────────
      //
      // We do this with additive blending so overlapping splats correctly
      // brighten each other (the Gaussian-sum look that makes splats feel
      // splatty). Once the splat image is composed we blit it to the main
      // canvas with plain alpha blending against the raw video — that's the
      // true crossfade that makes the image BECOME splats rather than have
      // splats layered over it.

      // Trail fade happens ON the splat canvas, not the main one. The raw
      // video is always crisp.
      const trailFade = 1 - smoothed.trail * 0.95;
      spctx.fillStyle = `rgba(0, 0, 0, ${trailFade})`;
      spctx.fillRect(0, 0, w, h);

      // ─── Variance-based adaptive splat generation ───────────────────
      //
      // Instead of one splat per uniform grid cell, we recursively subdivide
      // the frame: cells with HIGH color variance (edges, faces, texture)
      // split into quadrants; cells with LOW variance (flat walls, sky) stay
      // as ONE big splat covering the whole region. The result: few splats
      // in boring areas, dense splats where detail lives — the same shape
      // true Gaussian Splatting optimization converges to, produced in one
      // fast pass per frame.
      //
      // We use integral images (summed-area tables) so variance of any
      // rectangle is O(1) regardless of size. That's what makes the
      // recursion fast enough for live video.

      const SAMPLE_W = 128;
      const SAMPLE_H = 72;
      if (sampleCanvas.width !== SAMPLE_W || sampleCanvas.height !== SAMPLE_H) {
        sampleCanvas.width = SAMPLE_W;
        sampleCanvas.height = SAMPLE_H;
      }
      sctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
      const img = sctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);

      // Build integral images for: mean luminance, luminance², R, G, B.
      // Each is a (W+1)x(H+1) table where value at (x,y) = sum over the
      // rectangle [0..x-1, 0..y-1]. Variance of any rect then = sumSq/N - mean²
      // computed via 4 table lookups.
      const PW = SAMPLE_W + 1;
      const PH = SAMPLE_H + 1;
      const iL  = new Float32Array(PW * PH); // luminance (0..1)
      const iL2 = new Float32Array(PW * PH); // luminance squared
      const iR  = new Float32Array(PW * PH);
      const iG  = new Float32Array(PW * PH);
      const iB  = new Float32Array(PW * PH);
      for (let y = 1; y < PH; y++) {
        let rowL = 0, rowL2 = 0, rowR = 0, rowG = 0, rowB = 0;
        for (let x = 1; x < PW; x++) {
          const pi = ((y - 1) * SAMPLE_W + (x - 1)) * 4;
          const r = img.data[pi];
          const g = img.data[pi + 1];
          const b = img.data[pi + 2];
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          rowL  += lum;
          rowL2 += lum * lum;
          rowR  += r;
          rowG  += g;
          rowB  += b;
          const idx = y * PW + x;
          const upIdx = (y - 1) * PW + x;
          iL[idx]  = rowL  + iL[upIdx];
          iL2[idx] = rowL2 + iL2[upIdx];
          iR[idx]  = rowR  + iR[upIdx];
          iG[idx]  = rowG  + iG[upIdx];
          iB[idx]  = rowB  + iB[upIdx];
        }
      }

      // Rectangle-sum helper: sum of values in [x0, y0)..(x1, y1] half-open
      const rectSum = (table: Float32Array, x0: number, y0: number, x1: number, y1: number): number => {
        return table[y1 * PW + x1]
             - table[y0 * PW + x1]
             - table[y1 * PW + x0]
             + table[y0 * PW + x0];
      };

      // Density knob → variance threshold. Low density = high threshold
      // (few subdivisions, big splats). High density = low threshold (lots
      // of subdivisions, detail everywhere).
      const density = smoothed.density;
      const varThreshold = Math.pow(1 - density, 2) * 0.04 + 0.0005;
      const MAX_DEPTH = 7;        // 2^7 = 128 subdivisions max, matches SAMPLE_W
      const MIN_CELL = 2;         // don't subdivide below 2x2 pixels
      const MAX_SPLATS = 5000;    // hard cap to prevent runaway

      // Iterative quadtree subdivision via stack
      type Cell = { x: number; y: number; w: number; h: number; depth: number };
      const stack: Cell[] = [{ x: 0, y: 0, w: SAMPLE_W, h: SAMPLE_H, depth: 0 }];
      const splats: Array<{ cx: number; cy: number; sw: number; sh: number; r: number; g: number; b: number; lum: number }> = [];

      while (stack.length > 0 && splats.length < MAX_SPLATS) {
        const c = stack.pop()!;
        const N = c.w * c.h;
        const x0 = c.x, y0 = c.y, x1 = c.x + c.w, y1 = c.y + c.h;
        const sumL  = rectSum(iL,  x0, y0, x1, y1);
        const sumL2 = rectSum(iL2, x0, y0, x1, y1);
        const meanL = sumL / N;
        const variance = sumL2 / N - meanL * meanL;

        const canSplit = c.depth < MAX_DEPTH && c.w >= MIN_CELL * 2 && c.h >= MIN_CELL * 2;
        if (canSplit && variance > varThreshold) {
          // Subdivide into 4 quadrants
          const hw = c.w >> 1;
          const hh = c.h >> 1;
          stack.push({ x: c.x,      y: c.y,      w: hw,         h: hh,         depth: c.depth + 1 });
          stack.push({ x: c.x + hw, y: c.y,      w: c.w - hw,   h: hh,         depth: c.depth + 1 });
          stack.push({ x: c.x,      y: c.y + hh, w: hw,         h: c.h - hh,   depth: c.depth + 1 });
          stack.push({ x: c.x + hw, y: c.y + hh, w: c.w - hw,   h: c.h - hh,   depth: c.depth + 1 });
        } else {
          // Terminal cell → one splat at its center, sized to its extent,
          // colored by the mean RGB of the region
          const meanR = rectSum(iR, x0, y0, x1, y1) / N;
          const meanG = rectSum(iG, x0, y0, x1, y1) / N;
          const meanB = rectSum(iB, x0, y0, x1, y1) / N;
          // Cell position in sample space → canvas space (with horizontal mirror)
          const cellCenterXSample = c.x + c.w * 0.5;
          const cellCenterYSample = c.y + c.h * 0.5;
          const canvasX = w - (cellCenterXSample / SAMPLE_W) * w;
          const canvasY = (cellCenterYSample / SAMPLE_H) * h;
          const canvasCellW = (c.w / SAMPLE_W) * w;
          const canvasCellH = (c.h / SAMPLE_H) * h;
          splats.push({
            cx: canvasX,
            cy: canvasY,
            sw: canvasCellW,
            sh: canvasCellH,
            r: meanR, g: meanG, b: meanB,
            lum: meanL,
          });
        }
      }

      // ─── Render the adaptive splats ────────────────────────────────
      const brightness = smoothed.brightness;
      const saturation = smoothed.saturation;
      const jitter = smoothed.jitter;
      const hueShift = smoothed.hue * 360;
      const warpAmt = smoothed.warp;
      const sizeMul = 0.6 + smoothed.size * 2.5;

      spctx.globalCompositeOperation = "lighter";

      for (let si = 0; si < splats.length; si++) {
        const sp = splats[si];
        if (sp.lum < 0.03) continue; // skip nearly-black regions

        let r = sp.r, g = sp.g, b = sp.b;
        // Saturation
        if (saturation !== 1) {
          const gray = (r + g + b) / 3;
          r = gray + (r - gray) * saturation;
          g = gray + (g - gray) * saturation;
          b = gray + (b - gray) * saturation;
        }
        // Hue rotation
        if (hueShift > 0.5) {
          const hueRad = hueShift * Math.PI / 180;
          const cos = Math.cos(hueRad); const sin = Math.sin(hueRad);
          const rr = r * (0.299 + 0.701 * cos + 0.168 * sin)
                   + g * (0.587 - 0.587 * cos + 0.330 * sin)
                   + b * (0.114 - 0.114 * cos - 0.497 * sin);
          const gg = r * (0.299 - 0.299 * cos - 0.328 * sin)
                   + g * (0.587 + 0.413 * cos + 0.035 * sin)
                   + b * (0.114 - 0.114 * cos + 0.292 * sin);
          const bb = r * (0.299 - 0.300 * cos + 1.250 * sin)
                   + g * (0.587 - 0.588 * cos - 1.050 * sin)
                   + b * (0.114 + 0.886 * cos - 0.203 * sin);
          r = Math.max(0, Math.min(255, rr));
          g = Math.max(0, Math.min(255, gg));
          b = Math.max(0, Math.min(255, bb));
        }

        let cx = sp.cx;
        let cy = sp.cy;
        if (jitter > 0) {
          cx += (Math.random() - 0.5) * sp.sw * jitter;
          cy += (Math.random() - 0.5) * sp.sh * jitter;
        }
        if (warpAmt > 0.005) {
          cx += Math.sin(sp.cy * 0.02 + now * 0.001) * warpAmt * 30;
          cy += Math.cos(sp.cx * 0.02 + now * 0.0012) * warpAmt * 30;
        }

        // Splat radius: proportional to the cell's diagonal, scaled by size knob
        const radius = Math.max(sp.sw, sp.sh) * sizeMul * 0.9;
        const alpha = Math.min(1, sp.lum * brightness);
        const ri = r | 0, gi = g | 0, bi = b | 0;

        const grad = spctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0,   `rgba(${ri},${gi},${bi},${alpha})`);
        grad.addColorStop(0.55,`rgba(${ri},${gi},${bi},${alpha * 0.35})`);
        grad.addColorStop(1,   `rgba(${ri},${gi},${bi},0)`);
        spctx.fillStyle = grad;
        spctx.beginPath();
        spctx.arc(cx, cy, radius, 0, Math.PI * 2);
        spctx.fill();
      }
      spctx.globalCompositeOperation = "source-over";

      // ── Compose final frame on the main canvas ──────────────────────
      //
      // Clear, then composite raw video + splat canvas with proportional
      // alpha so the two layers CROSSFADE (not overlay). At clean=1 only
      // the video shows; at clean=0 only the splats show; 0.5 gives an
      // even dissolve between them.

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillRect(0, 0, w, h);

      // Raw video (mirrored) at alpha = clean
      if (clean > 0.001) {
        ctx.save();
        ctx.globalAlpha = clean;
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, w, h);
        ctx.restore();
      }

      // Splat canvas at alpha = 1 - clean
      if (clean < 0.999) {
        ctx.globalAlpha = 1 - clean;
        ctx.drawImage(splatCanvas, 0, 0);
        ctx.globalAlpha = 1;
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

  // Slider layout — same Emotiv-style rows as other visualizers
  type SliderDef = {
    k: SplatsKnob; label: string; min: number; max: number; step: number;
    fmt: (v: number) => string;
  };
  type LayoutRow = { kind: "header"; title: string } | { kind: "slider"; def: SliderDef };

  const LAYOUT: LayoutRow[] = [
    { kind: "header", title: "Source" },
    // Clean = 1 shows the raw webcam feed pristine. Ramp down to 0 to
    // fade into pure splat stylization. Also patchable as a modulation
    // input for data-driven fade-in/fade-out.
    { kind: "slider", def: { k: "clean",      label: "Clean",      min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) + "%" } },
    { kind: "header", title: "Splats" },
    { kind: "slider", def: { k: "density",    label: "Density",    min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "size",       label: "Size",       min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "jitter",     label: "Jitter",     min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "warp",       label: "Warp",       min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "header", title: "Appearance" },
    { kind: "slider", def: { k: "brightness", label: "Bright",     min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "saturation", label: "Saturation", min: 0, max: 2, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "hue",        label: "Hue",        min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 360) + "°" } },
    { kind: "slider", def: { k: "trail",      label: "Trail",      min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
  ];

  const ROW_HEIGHT = 28;
  const HEADER_HEIGHT = 22;
  const CAMERA_ROW_HEIGHT = 48;

  const bottomFor = (knob: SplatsKnob): number => {
    const idx = LAYOUT.findIndex((row) => row.kind === "slider" && row.def.k === knob);
    let bottom = 8;
    for (let j = LAYOUT.length - 1; j > idx; j--) {
      bottom += LAYOUT[j].kind === "header" ? HEADER_HEIGHT : ROW_HEIGHT;
    }
    return bottom + ROW_HEIGHT / 2;
  };

  return (
    <Card
      className="bg-background border border-amber-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 360 }}
    >
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id}
          title="VIDEO SPLATS"
          subtitle="2D Gaussian splats from webcam"
          icon={<Video className="w-5 h-5 text-amber-400" />}
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
            {/* Webcam control row */}
            <div
              className="flex items-center gap-2 nodrag nopan"
              style={{ height: CAMERA_ROW_HEIGHT }}
            >
              <Button
                size="sm"
                variant={cameraOn ? "destructive" : "default"}
                className="h-8 gap-1.5"
                onClick={cameraOn ? stopCamera : startCamera}
              >
                {cameraOn ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                {cameraOn ? "Stop camera" : "Start camera"}
              </Button>
              <span className="text-[10px] text-muted-foreground flex-1 truncate">
                {cameraError
                  ? `⚠ ${cameraError}`
                  : cameraOn
                  ? "Streaming live"
                  : "Allow camera to start splatting"}
              </span>
            </div>

            <canvas
              ref={canvasRef}
              className="w-full bg-black nodrag nopan"
              style={{ height: 240, display: "block" }}
              onDoubleClick={openFullscreen}
            />

            {/* Hidden video + offscreen sample canvas */}
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ display: "none" }}
            />
            <canvas ref={sampleCanvasRef} style={{ display: "none" }} />
            <canvas ref={splatCanvasRef} style={{ display: "none" }} />

            <div className="nodrag nopan">
              {LAYOUT.map((row, i) => {
                if (row.kind === "header") {
                  return (
                    <div
                      key={"h-" + i}
                      className="flex items-center gap-2 px-1"
                      style={{ height: HEADER_HEIGHT }}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300/80">
                        {row.title}
                      </span>
                      <div className="flex-1 h-px bg-amber-500/20" />
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
                    <Label className={"text-[11px] font-mono font-bold w-14 shrink-0 " + (isPatched ? "text-amber-300" : "text-amber-400")}>
                      {s.label}
                    </Label>
                    <Slider
                      value={[displayVal]}
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      onValueChange={([v]) => !isPatched && onUpdateParameter(id, s.k, v)}
                      className={"flex-1 " + (isPatched ? "pointer-events-none [&_[role=slider]]:bg-amber-400 [&_[role=slider]]:border-amber-300" : "")}
                      aria-label={s.label}
                    />
                    <span className={"text-[10px] font-mono tabular-nums w-12 text-right " + (isPatched ? "text-amber-300 font-bold" : "text-foreground")}>
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
        SPLATS_KNOBS.map((k) => (
          <Handle
            key={k}
            id={"in-" + k}
            type="target"
            position={Position.Left}
            className={"!border-2 !border-background !w-3.5 !h-3.5 " + (patched[k] ? "!bg-amber-300" : "!bg-amber-400")}
            style={{
              top: "auto",
              bottom: bottomFor(k) + "px",
            }}
          />
        ))}
    </Card>
  );
}

export default SplatsNode;
