import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Compass, Maximize2 } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { TUNNEL_KNOBS, type TunnelKnob, type TunnelModule } from "./TunnelModule";

interface TunnelData {
  type: "visualizer-tunnel";
  speed: number; twist: number; rings: number; stripes: number;
  warp: number; flare: number; color: number; contrast: number;
  collapsed: boolean;
}

const VERT_SRC = "attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }";

// Infinite-tunnel shader using polar (r, theta) remapping. Each pixel's angle
// around the center becomes a texture "u" coordinate; the inverse of the
// distance to center becomes a "v" coordinate that moves past the camera as
// time advances. Warp adds radial wobble, rings and stripes pattern the walls.
const FRAG_SRC = [
  "precision highp float;",
  "uniform vec2  u_resolution;",
  "uniform float u_time;",
  "uniform float u_speed;",
  "uniform float u_twist;",
  "uniform float u_rings;",
  "uniform float u_stripes;",
  "uniform float u_warp;",
  "uniform float u_flare;",
  "uniform float u_color;",
  "uniform float u_contrast;",
  "",
  "vec3 palette(float t, float offset) {",
  "  vec3 a = vec3(0.5, 0.5, 0.5);",
  "  vec3 b = vec3(0.5, 0.5, 0.5);",
  "  vec3 c = vec3(1.0, 1.0, 1.0);",
  "  vec3 d = vec3(0.00, 0.33, 0.67) + offset;",
  "  return a + b * cos(6.2831 * (c * t + d));",
  "}",
  "",
  "void main() {",
  "  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);",
  "  // Add a subtle radial wobble so the tunnel feels organic, not rigid",
  "  float wobble = sin(u_time * 0.7 + atan(uv.y, uv.x) * 3.0) * u_warp * 0.18;",
  "  float r = length(uv) * (1.0 + wobble);",
  "  float theta = atan(uv.y, uv.x);",
  "",
  "  // Core tunnel remap: u = angle + twist, v = 1/r + time * speed",
  "  float stripes = max(1.0, floor(u_stripes * 18.0 + 2.0));",
  "  float rings   = max(2.0, floor(u_rings * 24.0 + 4.0));",
  "  float u = theta / 6.2831 * stripes + u_time * u_twist * 0.5;",
  "  float v = 1.0 / max(r, 0.04) + u_time * (0.4 + u_speed * 3.0);",
  "",
  "  // Checker-like pattern along the tunnel walls",
  "  float pat = sin(v * rings) * sin(u * 6.28);",
  "  // Contrast maps raw pattern into a sharper band",
  "  pat = smoothstep(-u_contrast, u_contrast, pat);",
  "",
  "  // Depth falloff — center of image is deep in the tunnel, fades with 1/r",
  "  float depth = clamp(r * 1.2, 0.0, 1.0);",
  "  vec3 col = palette(pat * 0.5 + v * 0.05, u_color);",
  "  col *= 0.2 + 0.8 * depth;",
  "",
  "  // Bright flare at the tunnel's vanishing point",
  "  float flare = pow(max(0.0, 1.0 - r * 2.2), 3.5) * u_flare;",
  "  col += palette(u_time * 0.1, u_color + 0.25) * flare;",
  "",
  "  col = pow(col, vec3(0.85));",
  "  gl_FragColor = vec4(col, 1.0);",
  "}",
].join("\n");

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

function TunnelNode({ data, id }: NodeProps<TunnelData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { collapsed } = data;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moduleRef = useRef<TunnelModule | null>(null);
  const rafRef = useRef<number | null>(null);

  const [patched, setPatched] = useState<Record<TunnelKnob, boolean>>({
    speed: false, twist: false, rings: false, stripes: false,
    warp: false, flare: false, color: false, contrast: false,
  });

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as TunnelModule | undefined;
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
    const gl = canvas.getContext("webgl");
    if (!gl) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1, 1,
      -1,  1,  1, -1,  1, 1,
    ]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const U = {
      res:      gl.getUniformLocation(prog, "u_resolution"),
      time:     gl.getUniformLocation(prog, "u_time"),
      speed:    gl.getUniformLocation(prog, "u_speed"),
      twist:    gl.getUniformLocation(prog, "u_twist"),
      rings:    gl.getUniformLocation(prog, "u_rings"),
      stripes:  gl.getUniformLocation(prog, "u_stripes"),
      warp:     gl.getUniformLocation(prog, "u_warp"),
      flare:    gl.getUniformLocation(prog, "u_flare"),
      color:    gl.getUniformLocation(prog, "u_color"),
      contrast: gl.getUniformLocation(prog, "u_contrast"),
    };

    const target: Record<TunnelKnob, number> = {
      speed: 0.5, twist: 0.2, rings: 0.4, stripes: 0.5,
      warp: 0.15, flare: 0.5, color: 0.65, contrast: 0.6,
    };
    const smoothed: Record<TunnelKnob, number> = { ...target };
    const TAU_TARGET: Record<TunnelKnob, number> = {
      speed: 0.6, twist: 0.8, rings: 1.0, stripes: 1.0,
      warp: 0.8, flare: 0.6, color: 0.6, contrast: 0.6,
    };
    const TAU_SMOOTH: Record<TunnelKnob, number> = {
      speed: 0.15, twist: 0.2, rings: 0.3, stripes: 0.3,
      warp: 0.2, flare: 0.15, color: 0.15, contrast: 0.15,
    };
    let lastT = performance.now();
    const startT = lastT;

    const render = () => {
      const mod = moduleRef.current;
      if (!mod) { rafRef.current = requestAnimationFrame(render); return; }
      const { values } = mod.getSnapshot();

      const now = performance.now();
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;

      for (const k of TUNNEL_KNOBS) {
        const aT = 1 - Math.exp(-dt / TAU_TARGET[k]);
        const aS = 1 - Math.exp(-dt / TAU_SMOOTH[k]);
        target[k] += (values[k] - target[k]) * aT;
        smoothed[k] += (target[k] - smoothed[k]) * aS;
      }

      const w = Math.max(1, Math.floor(canvas.clientWidth * 0.9));
      const h = Math.max(1, Math.floor(canvas.clientHeight * 0.9));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.res!, canvas.width, canvas.height);
      gl.uniform1f(U.time!, (now - startT) / 1000);
      gl.uniform1f(U.speed!, smoothed.speed);
      gl.uniform1f(U.twist!, smoothed.twist);
      gl.uniform1f(U.rings!, smoothed.rings);
      gl.uniform1f(U.stripes!, smoothed.stripes);
      gl.uniform1f(U.warp!, smoothed.warp);
      gl.uniform1f(U.flare!, smoothed.flare);
      gl.uniform1f(U.color!, smoothed.color);
      gl.uniform1f(U.contrast!, smoothed.contrast);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
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
    k: TunnelKnob; label: string; min: number; max: number; step: number;
    fmt: (v: number) => string;
  };
  type LayoutRow = { kind: "header"; title: string } | { kind: "slider"; def: SliderDef };

  const LAYOUT: LayoutRow[] = [
    { kind: "header", title: "Flight" },
    { kind: "slider", def: { k: "speed", label: "Speed", min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "twist", label: "Twist", min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "warp",  label: "Warp",  min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "header", title: "Pattern" },
    { kind: "slider", def: { k: "rings",   label: "Rings",   min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "stripes", label: "Stripes", min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "header", title: "Appearance" },
    { kind: "slider", def: { k: "flare",    label: "Flare",    min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "color",    label: "Color",    min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "contrast", label: "Contrast", min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
  ];

  const ROW_HEIGHT = 28;
  const HEADER_HEIGHT = 22;

  const bottomFor = (knob: TunnelKnob): number => {
    const idx = LAYOUT.findIndex((row) => row.kind === "slider" && row.def.k === knob);
    let bottom = 8;
    for (let j = LAYOUT.length - 1; j > idx; j--) {
      bottom += LAYOUT[j].kind === "header" ? HEADER_HEIGHT : ROW_HEIGHT;
    }
    return bottom + ROW_HEIGHT / 2;
  };

  return (
    <Card
      className="bg-background border border-purple-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 360 }}
    >
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id}
          title="TUNNEL"
          subtitle="Infinite flight"
          icon={<Compass className="w-5 h-5 text-purple-400" />}
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
              className="w-full rounded-none bg-black nodrag nopan"
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
                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300/80">
                        {row.title}
                      </span>
                      <div className="flex-1 h-px bg-purple-500/20" />
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
                    <Label className={"text-[11px] font-mono font-bold w-14 shrink-0 " + (isPatched ? "text-purple-300" : "text-purple-400")}>
                      {s.label}
                    </Label>
                    <Slider
                      value={[displayVal]}
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      onValueChange={([v]) => !isPatched && onUpdateParameter(id, s.k, v)}
                      className={"flex-1 " + (isPatched ? "pointer-events-none [&_[role=slider]]:bg-purple-400 [&_[role=slider]]:border-purple-300" : "")}
                      aria-label={s.label}
                    />
                    <span className={"text-[10px] font-mono tabular-nums w-12 text-right " + (isPatched ? "text-purple-300 font-bold" : "text-foreground")}>
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
        TUNNEL_KNOBS.map((k) => (
          <Handle
            key={k}
            id={"in-" + k}
            type="target"
            position={Position.Left}
            className={"!border-2 !border-background !w-3.5 !h-3.5 " + (patched[k] ? "!bg-purple-300" : "!bg-purple-400")}
            style={{
              top: "auto",
              bottom: bottomFor(k) + "px",
            }}
          />
        ))}
    </Card>
  );
}

export default TunnelNode;
