import { Handle, Position, NodeProps } from "reactflow";
import { MixerModuleData } from "@/types/modules";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2 } from "lucide-react";

const MixerModuleNode = ({ data }: NodeProps<MixerModuleData & {
  onTogglePlay: () => void;
  onMasterVolumeChange: (volume: number) => void;
}>) => {
  const { masterVolume, isPlaying, inputCount, onTogglePlay, onMasterVolumeChange } = data;

  return (
    <div className="bg-gradient-card backdrop-blur-sm border-2 border-primary/50 rounded-lg shadow-glow w-[280px]">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-primary !w-3 !h-3 !border-2 !border-background"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-primary !w-3 !h-3 !border-2 !border-background"
      />
      
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-foreground">Master Mixer</h3>
            <p className="text-xs text-muted-foreground">
              {inputCount} {inputCount === 1 ? "input" : "inputs"}
            </p>
          </div>
          <Button
            size="lg"
            onClick={onTogglePlay}
            disabled={inputCount === 0}
            className="w-12 h-12 rounded-full shadow-glow"
          >
            {isPlaying ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6 ml-0.5" />
            )}
          </Button>
        </div>

        {/* VU Meter */}
        {isPlaying && (
          <div className="space-y-1">
            <div className="flex gap-1 h-16 items-end">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t transition-all duration-150"
                  style={{
                    height: `${Math.random() * 100}%`,
                    backgroundColor:
                      i < 14
                        ? "hsl(142, 76%, 36%)"
                        : i < 18
                        ? "hsl(45, 93%, 47%)"
                        : "hsl(0, 72%, 51%)",
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Master Volume */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Master</p>
            </div>
            <p className="text-sm font-medium text-foreground">
              {Math.round(masterVolume * 100)}%
            </p>
          </div>
          <Slider
            value={[masterVolume * 100]}
            onValueChange={(values) => onMasterVolumeChange(values[0] / 100)}
            max={100}
            step={1}
          />
        </div>
      </div>
    </div>
  );
};

export default MixerModuleNode;
