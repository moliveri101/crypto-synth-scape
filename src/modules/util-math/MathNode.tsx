import { useEffect, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sigma } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { MATH_OPS, type MathOp, type MathModule, type MathSnapshot } from "./MathModule";

interface MathData {
  type: "util-math";
  op: MathOp;
  collapsed: boolean;
}

const OP_SYM: Record<MathOp, string> = {
  add: "A + B", subtract: "A − B", multiply: "A × B", divide: "A ÷ B",
  min: "min(A,B)", max: "max(A,B)", average: "avg(A,B)", difference: "|A − B|",
};

function MathNode({ data, id }: NodeProps<MathData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { op, collapsed } = data;

  const [snapshot, setSnapshot] = useState<MathSnapshot | null>(null);

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as MathModule | undefined;
    if (!mod) return;
    mod.setOnSnapshotUpdate(setSnapshot);
    setSnapshot(mod.getSnapshot());
    return () => { mod.setOnSnapshotUpdate(null); };
  }, [id]);

  const a = snapshot?.a ?? 0;
  const b = snapshot?.b ?? 0;
  const r = snapshot?.result ?? 0;

  return (
    <Card className="bg-background border border-yellow-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 240 }}>
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id} title="MATH" subtitle={OP_SYM[op]}
          icon={<Sigma className="w-5 h-5 text-yellow-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        />
        {!collapsed && (
          <>
            <div className="nodrag nopan">
              <Label className="text-[10px] text-muted-foreground">Operation</Label>
              <Select value={op} onValueChange={(v) => onUpdateParameter(id, "op", v)}>
                <SelectTrigger className="h-7 text-[11px] capitalize" onPointerDown={(e) => e.stopPropagation()}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATH_OPS.map((o) => (
                    <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-1 text-[10px] font-mono tabular-nums">
              <div className="bg-neutral-900 p-1 rounded-none text-center">
                <div className="text-yellow-400">A</div>
                <div className="text-foreground">{a.toFixed(2)}</div>
              </div>
              <div className="bg-neutral-900 p-1 rounded-none text-center">
                <div className="text-yellow-400">B</div>
                <div className="text-foreground">{b.toFixed(2)}</div>
              </div>
              <div className="bg-yellow-900/30 p-1 rounded-none text-center border border-yellow-600/40">
                <div className="text-yellow-300">=</div>
                <div className="text-yellow-300 font-bold">{r.toFixed(2)}</div>
              </div>
            </div>
          </>
        )}
      </div>

      <Handle id="out-value" type="source" position={Position.Right}
        className="!border-2 !border-background !w-4 !h-4 !bg-yellow-400" style={{ top: "50%" }} />
      {!collapsed && (
        <>
          <Handle id="in-a" type="target" position={Position.Left}
            className="!border-2 !border-background !w-3.5 !h-3.5 !bg-yellow-400"
            style={{ top: "40%" }} />
          <Handle id="in-b" type="target" position={Position.Left}
            className="!border-2 !border-background !w-3.5 !h-3.5 !bg-yellow-400"
            style={{ top: "65%" }} />
        </>
      )}
    </Card>
  );
}

export default MathNode;
