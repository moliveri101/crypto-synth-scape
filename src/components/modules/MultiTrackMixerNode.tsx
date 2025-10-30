import { Handle, Position, NodeProps } from "reactflow";
import { MixerModuleData } from "@/types/modules";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, ChevronDown, ChevronUp, VolumeX } from "lucide-react";
import { Label } from "@/components/ui/label";

const MultiTrackMixerNode = ({ data, id }: NodeProps<MixerModuleData & {
  onTogglePlay: () => void;
  onMasterVolumeChange: (volume: number) => void;
  onToggleCollapse: (id: string) => void;
  onChannelVolumeChange?: (channel: number, volume: number) => void;
  onChannelPanChange?: (channel: number, pan: number) => void;
  onChannelMuteToggle?: (channel: number) => void;
}>) => {
  const { 
    type, 
    masterVolume, 
    isPlaying, 
    inputCount, 
    collapsed, 
    channels = [],
    onTogglePlay, 
    onMasterVolumeChange, 
    onToggleCollapse,
    onChannelVolumeChange,
    onChannelPanChange,
    onChannelMuteToggle
  } = data;

  const trackCount = type === "mixer-4" ? 4 : 
                     type === "mixer-8" ? 8 : 
                     type === "mixer-16" ? 16 : 32;

  const mixerLabel = `${trackCount}-Track Mixer`;

  return (
    <div className="bg-gradient-card backdrop-blur-sm border-2 border-primary/50 rounded-lg shadow-glow min-w-[320px]">
      {/* Input handles - one for each track */}
      {Array.from({ length: trackCount }).map((_, i) => (
        <Handle
          key={`in-${i}`}
          id={`in-${i}`}
          type="target"
          position={Position.Left}
          style={{ 
            top: `${((i + 1) / (trackCount + 1)) * 100}%`,
          }}
          className="!bg-primary !w-2 !h-2 !border-2 !border-background"
        />
      ))}

      {/* L/R Output handles */}
      <Handle
        id="out-L"
        type="source"
        position={Position.Right}
        style={{ top: "40%" }}
        className="!bg-accent !w-3 !h-3 !border-2 !border-background"
      />
      <Handle
        id="out-R"
        type="source"
        position={Position.Right}
        style={{ top: "60%" }}
        className="!bg-accent !w-3 !h-3 !border-2 !border-background"
      />
      
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3 className="font-bold text-foreground">{mixerLabel}</h3>
            <p className="text-xs text-muted-foreground">
              {inputCount} connected • L/R Output
            </p>
          </div>
          <div className="flex gap-2 items-center">
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
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-accent"
              onClick={() => onToggleCollapse(id)}
            >
              {collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            </Button>
          </div>
        </div>

        {!collapsed && (
          <>
            {/* Channel strips */}
            <div className="grid grid-cols-4 gap-2 max-h-[400px] overflow-y-auto">
              {channels.slice(0, trackCount).map((channel, i) => (
                <div key={i} className="bg-secondary/50 rounded p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] text-muted-foreground">Ch {i + 1}</Label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => onChannelMuteToggle?.(i)}
                    >
                      {channel.muted ? (
                        <VolumeX className="w-3 h-3 text-destructive" />
                      ) : (
                        <Volume2 className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                  
                  {/* Volume fader */}
                  <div className="h-24 flex flex-col items-center justify-center">
                    <div className="transform -rotate-90 w-20">
                      <Slider
                        value={[channel.volume * 100]}
                        onValueChange={([v]) => onChannelVolumeChange?.(i, v / 100)}
                        min={0}
                        max={100}
                        step={1}
                        disabled={channel.muted}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground mt-2">
                      {Math.round(channel.volume * 100)}
                    </span>
                  </div>

                  {/* Pan control */}
                  <div>
                    <Label className="text-[9px] text-muted-foreground">Pan</Label>
                    <Slider
                      value={[(channel.pan + 1) * 50]}
                      onValueChange={([v]) => onChannelPanChange?.(i, (v / 50) - 1)}
                      min={0}
                      max={100}
                      step={1}
                      className="mt-1"
                      disabled={channel.muted}
                    />
                    <div className="flex justify-between text-[8px] text-muted-foreground mt-0.5">
                      <span>L</span>
                      <span>R</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Master Section */}
            <div className="border-t border-border pt-4">
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
          </>
        )}
      </div>
    </div>
  );
};

export default MultiTrackMixerNode;
