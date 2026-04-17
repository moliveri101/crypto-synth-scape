import { useEffect, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { GitBranch } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { LOGIC_OPS, type LogicOp, type LogicModule, type LogicSnapshot } from "./LogicModule";

interface LogicData {
  type: "util-logic";
  op: LogicOp;
  collapsed: boolean;
}

function LogicNode({ data, id }: NodeProps<LogicData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { op, collapsed } = data;

  const [snapshot, setSnapshot] = useState<LogicSnapshot | null>(null);

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as LogicModule | undefined;
    if (!mod) return;
    mod.setOnSnapshotUpdate(setSnapshot);
    setSnapshot(mod.getSnapshot());
    return () => { mod.setOnSnapshotUpdate(null); };
  }, [id]);

  const a = snapshot?.a ?? false;
  const b = snapshot?.b ?? false;
  const out = snapshot?.output ?? false;

  const Dot = ({ on }: { on: boolean }) => (
    <div className={"w-5 h-5 rounded-full " + (on ? "bg-amber-300" : "bg-neutral-800 border border-neutral-700")} />
  );

  return (
    <Card className="bg-background border border-amber-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 240 }}>
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id} title="LOGIC" subtitle={op.toUpperCase()}
          icon={<GitBranch className="w-5 h-5 text-amber-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        />
        {!collapsed && (
          <>
            <div className="nodrag nopan">
              <Label className="text-[10px] text-muted-foreground">Operation</Label>
              <Select value={op} onValueChange={(v) => onUpdateParameter(id, "op", v)}>
                <SelectTrigger className="h-7 text-[11px] uppercase" onPointerDown={(e) => e.stopPropagation()}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOGIC_OPS.map((o) => (
                    <SelectItem key={o} value={o} className="uppercase">{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-1 nodrag nopan text-center">
              <div className="bg-neutral-900 p-2 flex flex-col items-center gap-1">
                <span className="text-[10px] font-mono text-amber-400">A</span>
                <Dot on={a} />
              </div>
              <div className="bg-neutral-900 p-2 flex flex-col items-center gap-1">
                <span className="text-[10px] font-mono text-amber-400">B</span>
                <Dot on={b} />
              </div>
              <div className="bg-amber-900/30 p-2 border border-amber-600/40 flex flex-col items-center gap-1">
                <span className="text-[10px] font-mono text-amber-300">Out</span>
                <Dot on={out} />
              </div>
            </div>
          </>
        )}
      </div>

      <Handle id="out-value" type="source" position={Position.Right}
        className="!border-2 !border-background !w-4 !h-4 !bg-amber-400" style={{ top: "50%" }} />
      {!collapsed && (
        <>
          <Handle id="in-a" type="target" position={Position.Left}
            className="!border-2 !border-background !w-3.5 !h-3.5 !bg-amber-400"
            style={{ top: "40%" }} />
          <Handle id="in-b" type="target" position={Position.Left}
            className="!border-2 !border-background !w-3.5 !h-3.5 !bg-amber-400"
            style={{ top: "65%" }} />
        </>
      )}
    </Card>
  );
}

export default LogicNode;
