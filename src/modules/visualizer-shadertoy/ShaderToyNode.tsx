import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Wand2, Maximize2 } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import {
  SHADER_KNOBS, SHADER_PRESETS,
  type ShaderKnob, type ShaderPreset, type ShaderToyModule,
} from "./ShaderToyModule";
import { VERT_SRC, SHADER_SOURCES } from "./shaders";

interface ShaderToyData {
  type: "visualizer-shadertoy";
  speed: number; zoom: number; warp: number;
  intensity: number; color: number; detail: number;
  preset: ShaderPreset;
  collapsed: boolean;
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

function ShaderToyNode({ data, id }: NodeProps<ShaderToyData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { collapsed, preset } = data;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moduleRef = useRef<ShaderToyModule | null>(null);
  const rafRef = useRef<number | null>(null);
  const presetRef = useRef<ShaderPreset>(preset);

  const [patched, setPatched] = useState<Record<ShaderKnob, boolean>>({
    speed: false, zoom: false, warp: false,
    intensity: false, color: false, detail: false,
  });

  useEffect(() => { presetRef.current = preset; }, [preset]);

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as ShaderToyModule | undefined;
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

    // Compile one program per preset up front — switching is then a zero-cost
    // uniform/program swap inside the render loop.
    const programs: Record<string, { prog: WebGLProgram; U: Record<string, WebGLUniformLocation | null> }> = {};
    for (const key of SHADER_PRESETS) {
      const prog = gl.createProgram()!;
      gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERT_SRC));
      gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, SHADER_SOURCES[key]));
      gl.linkProgram(prog);
      gl.useProgram(prog);
      programs[key] = {
        prog,
        U: {
          res:       gl.getUniformLocation(prog, "u_resolution"),
          time:      gl.getUniformLocation(prog, "u_time"),
          speed:     gl.getUniformLocation(prog, "u_speed"),
          zoom:      gl.getUniformLocation(prog, "u_zoom"),
          warp:      gl.getUniformLocation(prog, "u_warp"),
          intensity: gl.getUniformLocation(prog, "u_intensity"),
          color:     gl.getUniformLocation(prog, "u_color"),
          detail:    gl.getUniformLocation(prog, "u_detail"),
        },
      };
    }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1, 1,
      -1,  1,  1, -1,  1, 1,
    ]), gl.STATIC_DRAW);

    const bindPositionAttr = (prog: WebGLProgram) => {
      const posLoc = gl.getAttribLocation(prog, "a_pos");
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    };

    const target: Record<ShaderKnob, number> = {
      speed: 0.5, zoom: 0.5, warp: 0.4,
      intensity: 0.7, color: 0.4, detail: 0.5,
    };
    const smoothed: Record<ShaderKnob, number> = { ...target };
    const TAU_TARGET: Record<ShaderKnob, number> = {
      speed: 0.6, zoom: 0.8, warp: 0.8,
      intensity: 0.6, color: 0.6, detail: 0.8,
    };
    const TAU_SMOOTH: Record<ShaderKnob, number> = {
      speed: 0.15, zoom: 0.2, warp: 0.2,
      intensity: 0.15, color: 0.15, detail: 0.2,
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

      for (const k of SHADER_KNOBS) {
        const aT = 1 - Math.exp(-dt / TAU_TARGET[k]);
        const aS = 1 - Math.exp(-dt / TAU_SMOOTH[k]);
        target[k] += (values[k] - target[k]) * aT;
        smoothed[k] += (target[k] - smoothed[k]) * aS;
      }

      const activeKey = presetRef.current || "plasma";
      const active = programs[activeKey] || programs.plasma;
      gl.useProgram(active.prog);
      bindPositionAttr(active.prog);

      const w = Math.max(1, Math.floor(canvas.clientWidth * 0.9));
      const h = Math.max(1, Math.floor(canvas.clientHeight * 0.9));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      const U = active.U;
      gl.uniform2f(U.res!, canvas.width, canvas.height);
      gl.uniform1f(U.time!, (now - startT) / 1000);
      gl.uniform1f(U.speed!, smoothed.speed);
      gl.uniform1f(U.zoom!, smoothed.zoom);
      gl.uniform1f(U.warp!, smoothed.warp);
      gl.uniform1f(U.intensity!, smoothed.intensity);
      gl.uniform1f(U.color!, smoothed.color);
      gl.uniform1f(U.detail!, smoothed.detail);

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
    k: ShaderKnob; label: string; min: number; max: number; step: number;
    fmt: (v: number) => string;
  };
  type LayoutRow = { kind: "header"; title: string } | { kind: "slider"; def: SliderDef };

  const LAYOUT: LayoutRow[] = [
    { kind: "header", title: "Motion" },
    { kind: "slider", def: { k: "speed", label: "Speed", min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "warp",  label: "Warp",  min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "header", title: "Shape" },
    { kind: "slider", def: { k: "zoom",   label: "Zoom",   min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "detail", label: "Detail", min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "header", title: "Appearance" },
    { kind: "slider", def: { k: "intensity", label: "Bright", min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
    { kind: "slider", def: { k: "color",     label: "Color",  min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) } },
  ];

  const ROW_HEIGHT = 28;
  const HEADER_HEIGHT = 22;
  const PRESET_ROW_HEIGHT = 36;

  const bottomFor = (knob: ShaderKnob): number => {
    const idx = LAYOUT.findIndex((row) => row.kind === "slider" && row.def.k === knob);
    let bottom = 8;
    for (let j = LAYOUT.length - 1; j > idx; j--) {
      bottom += LAYOUT[j].kind === "header" ? HEADER_HEIGHT : ROW_HEIGHT;
    }
    return bottom + ROW_HEIGHT / 2;
  };

  return (
    <Card
      className="bg-background border border-teal-500/40 shadow-lg rounded-xl overflow-hidden relative"
      style={{ minWidth: 360 }}
    >
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id}
          title="SHADER TOY"
          subtitle="VJ gallery"
          icon={<Wand2 className="w-5 h-5 text-teal-400" />}
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

            {/* Preset picker */}
            <div
              className="flex items-center gap-2 nodrag nopan"
              style={{ height: PRESET_ROW_HEIGHT }}
            >
              <Label className="text-[11px] font-mono font-bold text-teal-400 w-14 shrink-0">
                Preset
              </Label>
              <Select
                value={preset}
                onValueChange={(v) => onUpdateParameter(id, "preset", v)}
              >
                <SelectTrigger
                  className="h-7 text-[11px] flex-1 capitalize"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHADER_PRESETS.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="nodrag nopan">
              {LAYOUT.map((row, i) => {
                if (row.kind === "header") {
                  return (
                    <div
                      key={"h-" + i}
                      className="flex items-center gap-2 px-1"
                      style={{ height: HEADER_HEIGHT }}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider text-teal-300/80">
                        {row.title}
                      </span>
                      <div className="flex-1 h-px bg-teal-500/20" />
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
                    <Label className={"text-[11px] font-mono font-bold w-14 shrink-0 " + (isPatched ? "text-teal-300" : "text-teal-400")}>
                      {s.label}
                    </Label>
                    <Slider
                      value={[displayVal]}
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      onValueChange={([v]) => !isPatched && onUpdateParameter(id, s.k, v)}
                      className={"flex-1 " + (isPatched ? "pointer-events-none [&_[role=slider]]:bg-teal-400 [&_[role=slider]]:border-teal-300" : "")}
                      aria-label={s.label}
                    />
                    <span className={"text-[10px] font-mono tabular-nums w-12 text-right " + (isPatched ? "text-teal-300 font-bold" : "text-foreground")}>
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
        SHADER_KNOBS.map((k) => (
          <Handle
            key={k}
            id={"in-" + k}
            type="target"
            position={Position.Left}
            className={"!border-2 !border-background !w-3.5 !h-3.5 " + (patched[k] ? "!bg-teal-300" : "!bg-teal-400")}
            style={{
              top: "auto",
              bottom: bottomFor(k) + "px",
            }}
          />
        ))}
    </Card>
  );
}

export default ShaderToyNode;
