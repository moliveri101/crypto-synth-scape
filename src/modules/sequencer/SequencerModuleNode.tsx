import React from "react";
import { Position, NodeProps } from "reactflow";
import StereoHandles from "@/modules/base/StereoHandles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Square } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";

interface SequencerData {
  type: "sequencer";
  bpm: number;
  steps: boolean[];
  currentStep: number;
  isPlaying: boolean;
  collapsed: boolean;
}

function SequencerModuleNode({ data, id }: NodeProps<SequencerData>) {
  const {
    bpm,
    steps,
    currentStep,
    isPlaying,
    collapsed,
  } = data;
  const { onRemove, onToggleCollapse, onUpdateParameter, onAction, onStart, onStop } = useModuleActions();

  const toggleStep = (index: number) => {
    const newSteps = [...steps];
    newSteps[index] = !newSteps[index];
    onUpdateParameter(id, "steps", newSteps);
  };

  return (
    <Card className="w-80 bg-background border border-border shadow-lg rounded-xl overflow-hidden">
      <StereoHandles type="target" position={Position.Left} />
      <StereoHandles type="source" position={Position.Right} />

      <div className="p-3 space-y-3">
        <ModuleHeader
          id={id}
          title="SEQUENCER"
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
          onRemove={onRemove}
        />

        {!collapsed && (
          <>
            {/* Play / Stop */}
            <Button
              size="sm"
              variant={isPlaying ? "destructive" : "default"}
              className="w-full"
              aria-label={isPlaying ? "Stop sequencer" : "Play sequencer"}
              onClick={() => isPlaying ? onStop(id) : onStart(id)}
            >
              {isPlaying ? (
                <>
                  <Square className="w-3.5 h-3.5 mr-1.5" /> Stop
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 mr-1.5" /> Play
                </>
              )}
            </Button>

            {/* BPM slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  BPM
                </label>
                <span className="text-[10px] text-muted-foreground">{bpm}</span>
              </div>
              <Slider
                min={40}
                max={200}
                step={1}
                value={[bpm]}
                onValueChange={([v]) => onUpdateParameter(id, "bpm", v)}
                aria-label="BPM"
              />
            </div>

            {/* Step grid: 8 columns x 2 rows = 16 steps */}
            <div className="grid grid-cols-8 gap-1.5">
              {steps.map((active, i) => {
                const isCurrent = isPlaying && currentStep === i;
                return (
                  <Button
                    key={i}
                    size="icon"
                    variant={active ? "default" : "secondary"}
                    className={`h-8 w-full text-[10px] font-medium ${
                      isCurrent ? "ring-2 ring-primary ring-offset-2" : ""
                    }`}
                    aria-label={`Step ${i + 1}${active ? " active" : " inactive"}${
                      isCurrent ? " current" : ""
                    }`}
                    onClick={() => toggleStep(i)}
                  >
                    {i + 1}
                  </Button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export default SequencerModuleNode;
