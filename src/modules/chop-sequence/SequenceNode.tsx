import { useEffect, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { ListMusic } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";
import { audioGraphManager } from "@/services/AudioGraphManager";
import {
  SEQ_STEPS,
  type SequenceModule, type SeqSnapshot,
} from "./SequenceModule";

interface SeqData {
  type: "chop-sequence";
  collapsed: boolean;
  [k: `step${number}`]: number;
}

function SequenceNode({ data, id }: NodeProps<SeqData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();
  const { collapsed } = data;

  const [snapshot, setSnapshot] = useState<SeqSnapshot | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  useEffect(() => {
    const mod = audioGraphManager.getModule(id) as SequenceModule | undefined;
    if (!mod) return;
    mod.setOnSnapshotUpdate(setSnapshot);
    setSnapshot(mod.getSnapshot());
    return () => { mod.setOnSnapshotUpdate(null); };
  }, [id]);

  const steps = snapshot?.steps ?? Array(SEQ_STEPS).fill(0.5);
  const cursor = snapshot?.cursor ?? 0;
  const triggerPatched = snapshot?.triggerPatched ?? false;

  // Drag-to-edit step bars: convert vertical position to 0..1
  const handleBarChange = (i: number, e: React.PointerEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const v = 1 - (e.clientY - rect.top) / rect.height;
    const clamped = Math.max(0, Math.min(1, v));
    onUpdateParameter(id, `step${i}`, clamped);
  };

  return (
    <Card className="bg-background border border-fuchsia-500/40 shadow-lg rounded-none overflow-hidden relative"
      style={{ minWidth: 320 }}>
      <div className="p-3 space-y-2 pl-5">
        <ModuleHeader
          id={id} title="SEQUENCE" subtitle={`step ${cursor + 1} / ${SEQ_STEPS}`}
          icon={<ListMusic className="w-5 h-5 text-fuchsia-400" />}
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(id)}
          onRemove={() => onRemove(id)}
        />
        {!collapsed && (
          <div
            className="flex items-end gap-1 bg-black p-2 nodrag nopan select-none"
            style={{ height: 140 }}
            onPointerLeave={() => setDragging(null)}
            onPointerUp={() => setDragging(null)}
          >
            {steps.map((v, i) => (
              <div
                key={i}
                className={
                  "flex-1 h-full border cursor-pointer flex items-end relative " +
                  (i === cursor ? "border-fuchsia-300" : "border-neutral-800")
                }
                onPointerDown={(e) => { setDragging(i); handleBarChange(i, e); e.currentTarget.setPointerCapture(e.pointerId); }}
                onPointerMove={(e) => { if (dragging === i) handleBarChange(i, e); }}
              >
                <div
                  className={i === cursor ? "bg-fuchsia-300 w-full" : "bg-fuchsia-500/70 w-full"}
                  style={{ height: `${v * 100}%` }}
                />
                <span className="absolute top-0.5 left-0 right-0 text-center text-[9px] font-mono text-neutral-500">
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Handle id="out-value" type="source" position={Position.Right}
        className="!border-2 !border-background !w-4 !h-4 !bg-fuchsia-400" style={{ top: "50%" }} />

      {!collapsed && (
        <>
          <Handle id="in-trigger" type="target" position={Position.Left}
            className={"!border-2 !border-background !w-4 !h-4 " + (triggerPatched ? "!bg-fuchsia-300" : "!bg-fuchsia-500")}
            style={{ top: "40%" }} />
          <Handle id="in-reset" type="target" position={Position.Left}
            className="!border-2 !border-background !w-3.5 !h-3.5 !bg-fuchsia-400"
            style={{ top: "70%" }} />
        </>
      )}
    </Card>
  );
}

export default SequenceNode;
