import { Position } from "reactflow";
import StereoHandles from "@/modules/base/StereoHandles";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Speaker, Headphones, X } from "lucide-react";
import { useModuleActions } from "@/modules/base/ModuleContext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OutputModuleNodeProps {
  id: string;
  data: {
    type: "output-speakers" | "output-headphones";
    volume: number;
    isActive: boolean;
    collapsed: boolean;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const OutputModuleNode = ({ data, id }: OutputModuleNodeProps) => {
  const { onRemove, onToggleCollapse, onUpdateParameter, onAction, onStart, onStop } = useModuleActions();
  const isSpeakers = data.type === "output-speakers";
  const Icon = isSpeakers ? Speaker : Headphones;
  const title = isSpeakers ? "Speakers" : "Headphones";

  return (
    <Card className="w-[240px] bg-card/95 backdrop-blur-sm border-border shadow-lg">
      <StereoHandles type="target" position={Position.Left} />

      <div className="p-4 space-y-3">
        {/* --- Header --- */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-foreground" />
            <h3 className="font-bold text-sm text-foreground">{title}</h3>
            {/* Status indicator */}
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                data.isActive ? "bg-green-500" : "bg-gray-500"
              }`}
              aria-label={data.isActive ? "Active" : "Inactive"}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onRemove(id)}
            aria-label="Remove module"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>

        {/* --- Volume --- */}
        <div>
          <Label className="text-xs text-muted-foreground">
            Volume: {(data.volume * 100).toFixed(0)}%
          </Label>
          <Slider
            value={[data.volume]}
            onValueChange={([v]) =>
              onUpdateParameter(id, "volume", v)
            }
            min={0}
            max={1}
            step={0.01}
            className="mt-1"
            aria-label="Output volume"
          />
        </div>
      </div>
    </Card>
  );
};

export default OutputModuleNode;
