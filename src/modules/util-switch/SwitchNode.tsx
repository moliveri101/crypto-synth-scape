import { useEffect, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { SplitSquareHorizontal } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { type SwitchModule, type SwitchSnapshot } from "./SwitchModule";

interface SwitchData {
  type: "util-switch";
  smooth: number;
  collapsed: boolean;
}

function SwitchNode({ data, id }: NodeProps<SwitchData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { smooth, collapsed } = data;

  const [snapshot, setSnapshot] = useState<SwitchSnapshot | null>(null);
  const smoothPatched = snapshot?.smoothPatched ?? false;

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as SwitchModule | undefined;
    if (!mod) return;
    mod.setOnSnapshotUpdate(setSnapshot);
    setSnapshot(mod.getSnapshot());
    return () => { mod.setOnSnapshotUpdate(null); };
  }, [id]);

  const a = snapshot?.a ?? 0;
  const b = snapshot?.b ?? 0;
  const sel = snapshot?.select ?? 0;
  const out = snapshot?.output ?? 0;
  const displaySmooth = snapshot?.smooth ?? smooth;
  const onA = sel < 0.5;

  return (
    <Card className="bg-background border border-lime-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 260 }}>
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id} title="SWITCH" subtitle={onA ? "→ A" : "→ B"}
          icon={<SplitSquareHorizontal className="w-5 h-5 text-lime-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        />
        {!collapsed && (
          <>
            <div className="grid grid-cols-3 gap-1 text-[10px] font-mono tabular-nums nodrag nopan">
              <div className={"p-1 text-center border " + (onA ? "bg-lime-900/40 border-lime-500" : "bg-neutral-900 border-neutral-700")}>
                <div className="text-lime-400">A</div>
                <div className="text-foreground">{a.toFixed(2)}</div>
              </div>
              <div className={"p-1 text-center border " + (!onA ? "bg-lime-900/40 border-lime-500" : "bg-neutral-900 border-neutral-700")}>
                <div className="text-lime-400">B</div>
                <div className="text-foreground">{b.toFixed(2)}</div>
              </div>
              <div className="bg-lime-900/30 p-1 text-center border border-lime-600/40">
                <div className="text-lime-300">Out</div>
                <div className="text-lime-300 font-bold">{out.toFixed(2)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 nodrag nopan">
              <Label className={"text-[11px] font-mono font-bold w-14 shrink-0 " + (smoothPatched ? "text-lime-300" : "text-lime-400")}>Smooth</Label>
              <Slider value={[displaySmooth]} min={0} max={1} step={0.001}
                onValueChange={([v]) => !smoothPatched && onUpdateParameter(id, "smooth", v)}
                className={"flex-1 " + (smoothPatched ? "pointer-events-none [&_[role=slider]]:bg-lime-400 [&_[role=slider]]:border-lime-300" : "")}
                aria-label="Smooth" />
              <span className={"text-[10px] font-mono tabular-nums w-12 text-right " + (smoothPatched ? "text-lime-300 font-bold" : "text-foreground")}>
                {displaySmooth.toFixed(2)}
              </span>
            </div>
          </>
        )}
      </div>

      <Handle id="out-value" type="source" position={Position.Right}
        className="!border-2 !border-background !w-4 !h-4 !bg-lime-400" style={{ top: "50%" }} />

      {!collapsed && (
        <>
          <Handle id="in-a" type="target" position={Position.Left}
            className="!border-2 !border-background !w-3.5 !h-3.5 !bg-lime-400"
            style={{ top: "30%" }} />
          <Handle id="in-b" type="target" position={Position.Left}
            className="!border-2 !border-background !w-3.5 !h-3.5 !bg-lime-400"
            style={{ top: "50%" }} />
          <Handle id="in-select" type="target" position={Position.Left}
            className="!border-2 !border-background !w-4 !h-4 !bg-lime-300"
            style={{ top: "70%" }} />
          <Handle id="in-smooth" type="target" position={Position.Left}
            className={"!border-2 !border-background !w-3.5 !h-3.5 " + (smoothPatched ? "!bg-lime-300" : "!bg-lime-400")}
            style={{ top: "88%" }} />
        </>
      )}
    </Card>
  );
}

export default SwitchNode;
