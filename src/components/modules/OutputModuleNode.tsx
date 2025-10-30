import { Handle, Position, NodeProps } from "reactflow";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Headphones, Volume2, X, Speaker } from "lucide-react";

interface OutputModuleData {
  type: "output-speakers" | "output-headphones";
  volume: number;
  isActive: boolean;
  onVolumeChange: (volume: number) => void;
  onRemove: (id: string) => void;
}

const OutputModuleNode = ({ data, id }: NodeProps<OutputModuleData>) => {
  const { type, volume, isActive, onVolumeChange, onRemove } = data;
  const isSpeakers = type === "output-speakers";

  return (
    <div className="bg-gradient-card backdrop-blur-sm border-2 border-accent/50 rounded-lg shadow-glow w-[240px]">
      <Handle
        id="in-L"
        type="target"
        position={Position.Left}
        style={{ top: "40%" }}
        className="!bg-accent !w-3 !h-3 !border-2 !border-background"
      />
      <Handle
        id="in-R"
        type="target"
        position={Position.Left}
        style={{ top: "60%" }}
        className="!bg-accent !w-3 !h-3 !border-2 !border-background"
      />
      
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            {isSpeakers ? (
              <Speaker className="w-5 h-5 text-accent" />
            ) : (
              <Headphones className="w-5 h-5 text-accent" />
            )}
            <div>
              <h3 className="font-bold text-foreground">
                {isSpeakers ? "Speakers" : "Headphones"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isActive ? "Active" : "Inactive"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onRemove(id)}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>

        {/* Volume Control */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Volume</p>
            </div>
            <p className="text-sm font-medium text-foreground">
              {Math.round(volume * 100)}%
            </p>
          </div>
          <Slider
            value={[volume * 100]}
            onValueChange={(values) => onVolumeChange(values[0] / 100)}
            max={100}
            step={1}
          />
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
          <span>{isActive ? 'Connected' : 'No input'}</span>
        </div>
      </div>
    </div>
  );
};

export default OutputModuleNode;
