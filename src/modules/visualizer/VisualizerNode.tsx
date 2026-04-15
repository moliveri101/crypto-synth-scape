import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sparkles, Maximize2 } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { VISUALIZER_KNOBS, type VisualizerKnob, type VisualizerModule } from "./VisualizerModule";

interface VisualizerData {
  type: "visualizer";
  shapeX: number; shapeY: number; zoom: number;
  rotation: number; color: number; detail: number;
  collapsed: boolean;
}

// WebGL Julia-set fragment shader. Takes the 6 knobs as uniforms.
const VERT_SRC = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG_SRC = `
precision mediump float;
uniform vec2  u_resolution;
uniform vec2  u_julia;     // (shapeX, shapeY)
uniform float u_zoom;
uniform float u_rot;
uniform float u_color;
uniform float u_detail;

vec3 palette(float t) {
  // Smooth 3-stop gradient shifted by u_color
  vec3 a = vec3(0.5, 0.5, 0.5);
  vec3 b = vec3(0.5, 0.5, 0.5);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.00, 0.33, 0.67) + u_color;
  return a + b * cos(6.2831 * (c * t + d));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  uv *= (2.0 / u_zoom);
  // Rotate
  float s = sin(u_rot), co = cos(u_rot);
  uv = mat2(co, -s, s, co) * uv;

  vec2 z = uv;
  float i;
  float maxI = u_detail;
  for (float n = 0.0; n < 256.0; n++) {
    if (n >= maxI) break;
    z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + u_julia;
    if (dot(z, z) > 4.0) { i = n; break; }
    i = n;
  }
  float t = i / maxI;
  vec3 col = palette(t);
  // Fade interior to black
  if (i >= maxI - 1.0) col = vec3(0.05, 0.02, 0.10);
  gl_FragColor = vec4(col, 1.0);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

function VisualizerNode({ data, id }: NodeProps<VisualizerData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { collapsed } = data;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const uniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});
  const moduleRef = useRef<VisualizerModule | null>(null);
  const rafRef = useRef<number | null>(null);

  // Subscribe to the audio module so the UI reflects modulated vs manual state
  const [patched, setPatched] = useState<Record<VisualizerKnob, boolean>>({
    shapeX: false, shapeY: false, zoom: false,
    rotation: false, color: false, detail: false,
  });

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as VisualizerModule | undefined;
    if (!mod) return;
    moduleRef.current = mod;
    const update = () => {
      const snap = mod.getSnapshot();
      setPatched({ ...snap.patched });
    };
    mod.setOnSnapshotUpdate(update);
    update();
    return () => { mod.setOnSnapshotUpdate(null); };
  }, [id]);

  // WebGL setup — compile shader, run a 60fps loop that reads from the module
  useEffect(() => {
    if (collapsed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl");
    if (!gl) return;
    glRef.current = gl;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // Full-viewport triangle pair
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1, 1,
      -1,  1,  1, -1,  1, 1,
    ]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    uniformsRef.current = {
      res:    gl.getUniformLocation(prog, "u_resolution"),
      julia:  gl.getUniformLocation(prog, "u_julia"),
      zoom:   gl.getUniformLocation(prog, "u_zoom"),
      rot:    gl.getUniformLocation(prog, "u_rot"),
      color:  gl.getUniformLocation(prog, "u_color"),
      detail: gl.getUniformLocation(prog, "u_detail"),
    };

    // Smoothed state so visuals don't jitter on every data tick
    const smoothed: Record<VisualizerKnob, number> = {
      shapeX: -0.7, shapeY: 0.27, zoom: 1.0,
      rotation: 0, color: 0, detail: 96,
    };
    const LERP = 0.12;

    const render = () => {
      const mod = moduleRef.current;
      if (!mod) { rafRef.current = requestAnimationFrame(render); return; }
      const { values } = mod.getSnapshot();

      for (const k of VISUALIZER_KNOBS) {
        smoothed[k] += (values[k] - smoothed[k]) * LERP;
      }

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniformsRef.current.res!, canvas.width, canvas.height);
      gl.uniform2f(uniformsRef.current.julia!, smoothed.shapeX, smoothed.shapeY);
      gl.uniform1f(uniformsRef.current.zoom!, smoothed.zoom);
      gl.uniform1f(uniformsRef.current.rot!, smoothed.rotation);
      gl.uniform1f(uniformsRef.current.color!, smoothed.color);
      gl.uniform1f(uniformsRef.current.detail!, smoothed.detail);

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

  // Slider definitions — knob name, label, min/max/step, display formatter
  const SLIDERS: Array<{
    k: VisualizerKnob; label: string; min: number; max: number; step: number;
    fmt: (v: number) => string;
  }> = [
    { k: "shapeX",   label: "Shape X",  min: -1.5, max: 1.5, step: 0.001, fmt: (v) => v.toFixed(3) },
    { k: "shapeY",   label: "Shape Y",  min: -1.5, max: 1.5, step: 0.001, fmt: (v) => v.toFixed(3) },
    { k: "zoom",     label: "Zoom",     min: 0.3,  max: 4.0, step: 0.01,  fmt: (v) => v.toFixed(2) + "×" },
    { k: "rotation", label: "Rotation", min: 0,    max: Math.PI * 2, step: 0.01, fmt: (v) => `${Math.round((v / (Math.PI * 2)) * 360)}°` },
    { k: "color",    label: "Color",    min: 0,    max: 1,   step: 0.01,  fmt: (v) => v.toFixed(2) },
    { k: "detail",   label: "Detail",   min: 32,   max: 256, step: 1,     fmt: (v) => Math.round(v).toString() },
  ];

  const ROW_HEIGHT = 40;

  return (
    <Card
      className="bg-background border border-violet-500/40 shadow-lg rounded-xl overflow-hidden relative"
      style={{ minWidth: 360 }}
    >
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id}
          title="FRACTAL VISUALIZER"
          subtitle="Julia set"
          icon={<Sparkles className="w-5 h-5 text-violet-400" />}
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
            {/* WebGL canvas */}
            <canvas
              ref={canvasRef}
              className="w-full rounded-md bg-black nodrag nopan"
              style={{ height: 220, display: "block" }}
              onDoubleClick={openFullscreen}
            />

            {/* Knob sliders — one per row, input handle sits on the left edge */}
            <div className="space-y-1 nodrag nopan">
              {SLIDERS.map((s) => {
                const isPatched = patched[s.k];
                const displayVal = moduleRef.current?.getSnapshot().values[s.k] ?? data[s.k];
                return (
                  <div
                    key={s.k}
                    className="flex items-center gap-2"
                    style={{ minHeight: ROW_HEIGHT }}
                  >
                    <Label className={`text-[10px] uppercase tracking-wide w-14 shrink-0 ${
                      isPatched ? "text-violet-300 font-bold" : "text-muted-foreground"
                    }`}>
                      {s.label}
                    </Label>
                    <Slider
                      value={[displayVal]}
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      onValueChange={([v]) => !isPatched && onUpdateParameter(id, s.k, v)}
                      className={`flex-1 ${isPatched ? "pointer-events-none [&_[role=slider]]:bg-violet-400 [&_[role=slider]]:border-violet-300" : ""}`}
                      aria-label={s.label}
                    />
                    <span className={`text-[10px] font-mono w-14 text-right ${
                      isPatched ? "text-violet-300 font-bold" : "text-muted-foreground"
                    }`}>
                      {s.fmt(displayVal)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* One input handle per knob, left edge, aligned with its slider row */}
      {!collapsed &&
        VISUALIZER_KNOBS.map((k, i) => (
          <Handle
            key={k}
            id={`in-${k}`}
            type="target"
            position={Position.Left}
            className={`!border-2 !border-background !w-3.5 !h-3.5 ${
              patched[k] ? "!bg-violet-300" : "!bg-violet-400"
            }`}
            style={{
              // Align with each slider row — tuned to the 220px canvas + header.
              top: "auto",
              bottom: `${(VISUALIZER_KNOBS.length - 1 - i) * ROW_HEIGHT + ROW_HEIGHT / 2 + 8}px`,
            }}
          />
        ))}
    </Card>
  );
}

export default VisualizerNode;
