import { useEffect, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Hash } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { type CounterModule, type CounterSnapshot } from "./CounterModule";

interface CounterData {
  type: "chop-counter";
  steps: number;
  collapsed: boolean;
}

function CounterNode({ data, id }: NodeProps<CounterData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { steps, collapsed } = data;

  const [snapshot, setSnapshot] = useState<CounterSnapshot | null>(null);
  const stepsPatched = snapshot?.patched.steps ?? false;

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as CounterModule | undefined;
    if (!mod) return;
    mod.setOnSnapshotUpdate(setSnapshot);
    setSnapshot(mod.getSnapshot());
    return () => { mod.setOnSnapshotUpdate(null); };
  }, [id]);

  const displaySteps = snapshot?.values.steps ?? steps;
  const totalSteps = snapshot?.totalSteps ?? 8;
  const currentStep = snapshot?.step ?? 0;

  return (
    <Card className="bg-background border border-indigo-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 280 }}>
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id} title="COUNTER" subtitle={`${currentStep + 1} / ${totalSteps}`}
          icon={<Hash className="w-5 h-5 text-indigo-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        />
        {!collapsed && (
          <>
            {/* Step grid visualizer */}
            <div className="nodrag nopan">
              <div className="flex flex-wrap gap-0.5">
                {Array.from({ length: totalSteps }, (_, i) => (
                  <div
                    key={i}
                    className={
                      "w-3 h-3 border " +
                      (i === currentStep
                        ? "bg-indigo-300 border-indigo-200"
                        : "bg-neutral-900 border-neutral-700")
                    }
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 nodrag nopan">
              <Label className={"text-[11px] font-mono font-bold w-12 shrink-0 " + (stepsPatched ? "text-indigo-300" : "text-indigo-400")}>Steps</Label>
              <Slider value={[displaySteps]} min={0} max={1} step={0.001}
                onValueChange={([v]) => !stepsPatched && onUpdateParameter(id, "steps", v)}
                className={"flex-1 " + (stepsPatched ? "pointer-events-none [&_[role=slider]]:bg-indigo-400 [&_[role=slider]]:border-indigo-300" : "")}
                aria-label="Steps" />
              <span className={"text-[10px] font-mono tabular-nums w-14 text-right " + (stepsPatched ? "text-indigo-300 font-bold" : "text-foreground")}>
                {totalSteps}
              </span>
            </div>
          </>
        )}
      </div>

      <Handle id="out-value" type="source" position={Position.Right}
        className="!border-2 !border-background !w-4 !h-4 !bg-indigo-400" style={{ top: "50%" }} />

      {!collapsed && (
        <>
          <Handle id="in-trigger" type="target" position={Position.Left}
            className="!border-2 !border-background !w-4 !h-4 !bg-indigo-300"
            style={{ top: 50 }} />
          <Handle id="in-steps" type="target" position={Position.Left}
            className={"!border-2 !border-background !w-3.5 !h-3.5 " + (stepsPatched ? "!bg-indigo-300" : "!bg-indigo-400")}
            style={{ top: "65%" }} />
          <Handle id="in-reset" type="target" position={Position.Left}
            className="!border-2 !border-background !w-3.5 !h-3.5 !bg-indigo-400"
            style={{ top: "85%" }} />
        </>
      )}
    </Card>
  );
}

export default CounterNode;
