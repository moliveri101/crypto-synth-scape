import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Box, Maximize2 } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { MANDELBULB_KNOBS, type MandelbulbKnob, type MandelbulbModule } from "./MandelbulbModule";

interface MandelbulbData {
  type: "visualizer-mandelbulb";
  power: number; iterations: number; fold: number; mirror: number;
  copies: number; spacing: number; merge: number;
  rotX: number; rotY: number;
  zoom: number; color: number; glow: number;
  collapsed: boolean;
}

const VERT_SRC = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// Mandelbulb raymarcher. Classic Pixar/Quilez-style distance estimator with
// simple diffuse lighting, ambient occlusion from iteration count, and a
// rainbow palette driven by orbit distance.
const FRAG_SRC = `
precision highp float;
uniform vec2  u_resolution;
uniform float u_power;
uniform float u_iterations;
uniform float u_fold;
uniform float u_mirror;
uniform float u_copies;
uniform float u_spacing;
uniform float u_merge;
uniform float u_rotX;
uniform float u_rotY;
uniform float u_zoom;
uniform float u_color;
uniform float u_glow;
uniform float u_time;

#define MAX_STEPS 72
#define MAX_DIST  8.0
#define EPSILON   0.0015
#define MAX_ITER  9

// Kaleidoscopic mirror around Y axis — wraps the XZ-plane angle to give
// n rotational copies of the shape. When n == 1 this is a no-op.
void kaleidoscope(inout vec3 p, float n) {
  if (n < 1.5) return;
  float a = atan(p.x, p.z);
  float r = length(p.xz);
  float slice = 6.28318530718 / n;
  a = mod(a + 0.5 * slice, slice) - 0.5 * slice;
  p.x = sin(a) * r;
  p.z = cos(a) * r;
}

// Space fold — blend a point toward its absolute-value version. Continuous
// fold amount lets the shape morph smoothly between asymmetric (0) and fully
// mirrored across all three planes (1).
void spaceFold(inout vec3 p, float amount) {
  p.x = mix(p.x, abs(p.x), amount);
  p.y = mix(p.y, abs(p.y), amount);
  p.z = mix(p.z, abs(p.z), amount);
}

// Smooth minimum — blends two surfaces where they get close. k controls the
// blend radius: k=0 is a hard union (visible seam), large k fully fuses them.
// This is the classic "metaball merge" look when copies overlap.
float smin(float a, float b, float k) {
  if (k <= 0.0001) return min(a, b);
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// DE for a single Mandelbulb centered at origin. Called repeatedly from the
// outer DE() for each copy — each copy translates its input position first.
vec2 bulbDE(vec3 pos) {
  spaceFold(pos, u_fold);
  kaleidoscope(pos, u_mirror);

  vec3 z = pos;
  float dr = 1.0;
  float r = 0.0;
  float trap = 1e20;
  for (int i = 0; i < MAX_ITER; i++) {
    if (float(i) >= u_iterations) break;
    r = length(z);
    if (r > 2.0) break;
    float theta = acos(z.z / r);
    float phi   = atan(z.y, z.x);
    dr = pow(r, u_power - 1.0) * u_power * dr + 1.0;
    float zr = pow(r, u_power);
    theta *= u_power;
    phi   *= u_power;
    z = zr * vec3(sin(theta)*cos(phi), sin(phi)*sin(theta), cos(theta)) + pos;
    trap = min(trap, length(z));
  }
  return vec2(0.5 * log(r) * r / dr, trap);
}

// Outer DE — places u_copies copies of the bulb on a ring of radius
// u_spacing in the XZ plane, optionally rotating over time so they orbit.
// Copies are combined with a smooth union so when they overlap they fuse
// organically rather than showing a hard seam.
vec2 DE(vec3 pos) {
  float N = max(1.0, floor(u_copies + 0.5));
  if (N < 1.5) {
    // Fast path — no copy loop overhead
    return bulbDE(pos);
  }
  float bestD = 1e20;
  float bestT = 1e20;
  float rotate = u_time * 0.15; // gentle autonomous orbit
  for (int i = 0; i < 8; i++) {
    if (float(i) >= N) break;
    float angle = 6.28318530718 * float(i) / N + rotate;
    vec3 offset = vec3(cos(angle), 0.0, sin(angle)) * u_spacing;
    vec2 de = bulbDE(pos - offset);
    bestD = smin(bestD, de.x, u_merge);
    if (de.y < bestT) bestT = de.y;
  }
  return vec2(bestD, bestT);
}

mat3 rotY(float a) {
  float s = sin(a), c = cos(a);
  return mat3(c, 0, -s,  0, 1, 0,  s, 0, c);
}
mat3 rotX(float a) {
  float s = sin(a), c = cos(a);
  return mat3(1, 0, 0,  0, c, -s,  0, s, c);
}

// Normal via forward differences on the DE
vec3 getNormal(vec3 p) {
  vec2 e = vec2(0.001, 0);
  return normalize(vec3(
    DE(p + e.xyy).x - DE(p - e.xyy).x,
    DE(p + e.yxy).x - DE(p - e.yxy).x,
    DE(p + e.yyx).x - DE(p - e.yyx).x
  ));
}

vec3 palette(float t, float offset) {
  vec3 a = vec3(0.5, 0.5, 0.5);
  vec3 b = vec3(0.5, 0.5, 0.5);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.00, 0.33, 0.67) + offset;
  return a + b * cos(6.2831 * (c * t + d));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  // Camera orbits at distance u_zoom from origin
  vec3 ro = vec3(0, 0, -u_zoom);
  ro = rotX(u_rotY) * ro;
  ro = rotY(u_rotX) * ro;
  vec3 rd = normalize(vec3(uv, 1.2));
  rd = rotX(u_rotY) * rd;
  rd = rotY(u_rotX) * rd;

  // March
  float t = 0.0;
  float iterAccum = 0.0;
  float trapMin = 1e20;
  bool hit = false;
  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 p = ro + rd * t;
    vec2 de = DE(p);
    float d = de.x;
    trapMin = min(trapMin, de.y);
    if (d < EPSILON) { hit = true; break; }
    if (t > MAX_DIST) break;
    t += d * 0.9; // slight under-relaxation to avoid over-stepping thin features
    iterAccum += 1.0;
  }

  vec3 col;
  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = getNormal(p);
    vec3 lightDir = normalize(vec3(0.6, 0.7, -0.5));
    float diff = max(dot(n, lightDir), 0.0);
    float ao = 1.0 - iterAccum / float(MAX_STEPS);
    vec3 base = palette(trapMin * 0.8 + t * 0.12, u_color);
    col = base * (0.25 + 0.75 * diff) * (0.4 + 0.6 * ao);
    // Rim glow from steep grazing angles
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.5);
    col += rim * palette(u_color + 0.2, u_color) * 0.4 * u_glow;
  } else {
    // Empty-space background: radial gradient tinted by palette + glow
    float d = length(uv);
    col = mix(vec3(0.03, 0.02, 0.08), palette(0.1, u_color) * 0.3, smoothstep(0.0, 1.2, d));
    // Soft glow around the bulb proportional to how close we came
    col += palette(0.0, u_color) * (u_glow * 0.35) * exp(-trapMin * 2.0);
  }

  // Gamma correction
  col = pow(col, vec3(0.8));
  gl_FragColor = vec4(col, 1.0);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

function MandelbulbNode({ data, id }: NodeProps<MandelbulbData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { collapsed } = data;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moduleRef = useRef<MandelbulbModule | null>(null);
  const rafRef = useRef<number | null>(null);

  const [patched, setPatched] = useState<Record<MandelbulbKnob, boolean>>({
    power: false, iterations: false, fold: false, mirror: false,
    copies: false, spacing: false, merge: false,
    rotX: false, rotY: false, zoom: false, color: false, glow: false,
  });

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as MandelbulbModule | undefined;
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
      res:        gl.getUniformLocation(prog, "u_resolution"),
      power:      gl.getUniformLocation(prog, "u_power"),
      iterations: gl.getUniformLocation(prog, "u_iterations"),
      fold:       gl.getUniformLocation(prog, "u_fold"),
      mirror:     gl.getUniformLocation(prog, "u_mirror"),
      copies:     gl.getUniformLocation(prog, "u_copies"),
      spacing:    gl.getUniformLocation(prog, "u_spacing"),
      merge:      gl.getUniformLocation(prog, "u_merge"),
      rotX:       gl.getUniformLocation(prog, "u_rotX"),
      rotY:       gl.getUniformLocation(prog, "u_rotY"),
      zoom:       gl.getUniformLocation(prog, "u_zoom"),
      color:      gl.getUniformLocation(prog, "u_color"),
      glow:       gl.getUniformLocation(prog, "u_glow"),
      time:       gl.getUniformLocation(prog, "u_time"),
    };

    // Two-stage time-constant smoothing — same pattern as the Julia visualizer.
    const target: Record<MandelbulbKnob, number> = {
      power: 8, iterations: 7, fold: 0, mirror: 1,
      copies: 1, spacing: 2.0, merge: 0.3,
      rotX: 0, rotY: 0.2, zoom: 3, color: 0, glow: 0.5,
    };
    const smoothed: Record<MandelbulbKnob, number> = { ...target };
    const TAU_TARGET: Record<MandelbulbKnob, number> = {
      power: 2.0, iterations: 1.5, fold: 1.5, mirror: 1.5,
      copies: 1.5, spacing: 1.2, merge: 0.8,
      rotX: 1.5, rotY: 1.5, zoom: 1.0, color: 0.8, glow: 0.8,
    };
    const TAU_SMOOTH: Record<MandelbulbKnob, number> = {
      power: 0.35, iterations: 0.3, fold: 0.3, mirror: 0.35,
      copies: 0.35, spacing: 0.3, merge: 0.25,
      rotX: 0.25, rotY: 0.25, zoom: 0.25, color: 0.2, glow: 0.2,
    };
    let lastT = performance.now();
    const startT = lastT;

    // Render at reduced resolution for performance — the raymarcher is heavy.
    // The <canvas> is scaled up via CSS, visually indistinguishable in motion.
    const RENDER_SCALE = 0.75;

    const render = () => {
      const mod = moduleRef.current;
      if (!mod) { rafRef.current = requestAnimationFrame(render); return; }
      const { values } = mod.getSnapshot();

      const now = performance.now();
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;

      for (const k of MANDELBULB_KNOBS) {
        const aT = 1 - Math.exp(-dt / TAU_TARGET[k]);
        const aS = 1 - Math.exp(-dt / TAU_SMOOTH[k]);
        target[k] += (values[k] - target[k]) * aT;
        smoothed[k] += (target[k] - smoothed[k]) * aS;
      }

      const w = Math.max(1, Math.floor(canvas.clientWidth * RENDER_SCALE));
      const h = Math.max(1, Math.floor(canvas.clientHeight * RENDER_SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.res!, canvas.width, canvas.height);
      gl.uniform1f(U.power!, smoothed.power);
      gl.uniform1f(U.iterations!, smoothed.iterations);
      gl.uniform1f(U.fold!, smoothed.fold);
      gl.uniform1f(U.mirror!, smoothed.mirror);
      gl.uniform1f(U.copies!, smoothed.copies);
      gl.uniform1f(U.spacing!, smoothed.spacing);
      gl.uniform1f(U.merge!, smoothed.merge);
      gl.uniform1f(U.rotX!, smoothed.rotX);
      gl.uniform1f(U.rotY!, smoothed.rotY);
      gl.uniform1f(U.zoom!, smoothed.zoom);
      gl.uniform1f(U.color!, smoothed.color);
      gl.uniform1f(U.glow!, smoothed.glow);
      gl.uniform1f(U.time!, (now - startT) / 1000);

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

  // Slider definitions grouped into sections. Headers are rendered inline and
  // also factored into the handle position math so each knob's input dot
  // lines up with its slider row.
  type SliderDef = {
    k: MandelbulbKnob; label: string; min: number; max: number; step: number;
    fmt: (v: number) => string;
  };
  type LayoutRow = { kind: "header"; title: string } | { kind: "slider"; def: SliderDef };

  const LAYOUT: LayoutRow[] = [
    { kind: "header", title: "Shape" },
    { kind: "slider", def: { k: "power",      label: "Power",    min: 3, max: 12, step: 0.05, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "iterations", label: "Detail",   min: 1, max: 9, step: 1, fmt: (v) => Math.round(v).toString() } },
    { kind: "header", title: "Multiply & Collide" },
    { kind: "slider", def: { k: "fold",       label: "Fold",     min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "mirror",     label: "Mirror",   min: 1, max: 8, step: 1, fmt: (v) => `×${Math.round(v)}` } },
    { kind: "slider", def: { k: "copies",     label: "Copies",   min: 1, max: 8, step: 1, fmt: (v) => `×${Math.round(v)}` } },
    { kind: "slider", def: { k: "spacing",    label: "Spacing",  min: 0, max: 4, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "merge",      label: "Merge",    min: 0, max: 2, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "header", title: "Camera" },
    { kind: "slider", def: { k: "rotX",       label: "Yaw",      min: 0, max: Math.PI * 2, step: 0.01, fmt: (v) => `${Math.round((v / (Math.PI * 2)) * 360)}°` } },
    { kind: "slider", def: { k: "rotY",       label: "Pitch",    min: 0, max: Math.PI, step: 0.01, fmt: (v) => `${Math.round((v / Math.PI) * 180)}°` } },
    { kind: "slider", def: { k: "zoom",       label: "Distance", min: 1.8, max: 6, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "header", title: "Appearance" },
    { kind: "slider", def: { k: "color",      label: "Color",    min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "glow",       label: "Glow",     min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
  ];

  const ROW_HEIGHT = 28;
  const HEADER_HEIGHT = 22;

  // For each knob, compute the pixel offset from the bottom of the card so
  // its Handle aligns with its slider row (independent of how many header
  // rows sit below it).
  const bottomFor = (knob: MandelbulbKnob): number => {
    const idx = LAYOUT.findIndex((row) => row.kind === "slider" && row.def.k === knob);
    let bottom = 8; // canvas/padding offset at the very bottom
    for (let j = LAYOUT.length - 1; j > idx; j--) {
      bottom += LAYOUT[j].kind === "header" ? HEADER_HEIGHT : ROW_HEIGHT;
    }
    return bottom + ROW_HEIGHT / 2;
  };

  return (
    <Card
      className="bg-background border border-indigo-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 360 }}
    >
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id}
          title="MANDELBULB 3D"
          subtitle="Raymarched fractal"
          icon={<Box className="w-5 h-5 text-indigo-400" />}
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
                      key={`h-${i}`}
                      className="flex items-center gap-2 px-1"
                      style={{ height: HEADER_HEIGHT }}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300/80">
                        {row.title}
                      </span>
                      <div className="flex-1 h-px bg-indigo-500/20" />
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
                    <Label className={`text-[11px] font-mono font-bold w-12 shrink-0 ${
                      isPatched ? "text-indigo-300" : "text-indigo-400"
                    }`}>
                      {s.label}
                    </Label>
                    <Slider
                      value={[displayVal]}
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      onValueChange={([v]) => !isPatched && onUpdateParameter(id, s.k, v)}
                      className={`flex-1 ${isPatched ? "pointer-events-none [&_[role=slider]]:bg-indigo-400 [&_[role=slider]]:border-indigo-300" : ""}`}
                      aria-label={s.label}
                    />
                    <span className={`text-[10px] font-mono tabular-nums w-12 text-right ${
                      isPatched ? "text-indigo-300 font-bold" : "text-foreground"
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

      {!collapsed &&
        MANDELBULB_KNOBS.map((k) => (
          <Handle
            key={k}
            id={`in-${k}`}
            type="target"
            position={Position.Left}
            className={`!border-2 !border-background !w-3.5 !h-3.5 ${
              patched[k] ? "!bg-indigo-300" : "!bg-indigo-400"
            }`}
            style={{
              top: "auto",
              bottom: `${bottomFor(k)}px`,
            }}
          />
        ))}
    </Card>
  );
}

export default MandelbulbNode;
