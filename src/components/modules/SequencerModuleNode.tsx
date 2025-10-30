import { Handle, Position, NodeProps } from "reactflow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, ChevronDown, ChevronUp, X } from "lucide-react";
import { SequencerModuleData } from "@/types/modules";

const SequencerModuleNode = ({ data, id }: NodeProps<SequencerModuleData & { 
  onParameterChange: (nodeId: string, param: string, value: any) => void,
  onToggleCollapse?: (id: string) => void,
  onRemove?: (id: string) => void,
}>) => {
  const toggleStep = (index: number) => {
    const newSteps = [...data.steps];
    newSteps[index] = !newSteps[index];
    data.onParameterChange(id, "steps", newSteps);
  };

  return (
    <Card className="w-[320px] border-2 border-primary/50 shadow-glow bg-card/95 backdrop-blur">
      <Handle id="in" type="target" position={Position.Left} className="!bg-primary !w-3 !h-3" />
      
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold text-primary flex items-center gap-2">
            SEQUENCER
          </CardTitle>
          <div className="flex gap-1 items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => data.onRemove?.(id)}
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-accent"
              onClick={() => data.onToggleCollapse?.(id)}
            >
              {data.collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {!data.collapsed && (
        <CardContent className="space-y-4 pt-0">
          <div className="flex items-center justify-between gap-2">
            <Button
              onClick={() => data.onParameterChange(id, "isPlaying", !data.isPlaying)}
              variant={data.isPlaying ? "default" : "outline"}
              size="sm"
              className="flex-1"
            >
              {data.isPlaying ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {data.isPlaying ? "Stop" : "Play"}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">BPM</span>
              <span className="text-xs font-mono text-foreground">{data.bpm}</span>
            </div>
            <Slider
              value={[data.bpm]}
              onValueChange={([value]) => data.onParameterChange(id, "bpm", value)}
              min={40}
              max={200}
              step={1}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <span className="text-xs text-muted-foreground">Steps</span>
            <div className="grid grid-cols-8 gap-1">
              {data.steps.map((active, index) => (
                <button
                  key={index}
                  onClick={() => toggleStep(index)}
                  className={`
                    h-8 border rounded transition-all
                    ${active ? "bg-primary border-primary" : "bg-secondary border-border"}
                    ${data.currentStep === index && data.isPlaying ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}
                    hover:border-primary/50
                  `}
                >
                  <span className="text-xs font-mono">{index + 1}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      )}

      <Handle id="out" type="source" position={Position.Right} className="!bg-primary !w-3 !h-3" />
    </Card>
  );
};

export default SequencerModuleNode;
