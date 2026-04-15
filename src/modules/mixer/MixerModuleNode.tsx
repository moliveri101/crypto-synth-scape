import React from "react";
import { Handle, Position, NodeProps } from "reactflow";
import StereoHandles from "@/modules/base/StereoHandles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";

interface ChannelData {
  volume: number;
  pan: number;
  muted: boolean;
}

interface MixerData {
  type: "mixer-4" | "mixer-8" | "mixer-16" | "mixer-32";
  masterVolume: number;
  isPlaying: boolean;
  inputCount: number;
  collapsed: boolean;
  channels: ChannelData[];
}

function MixerModuleNode({ data, id }: NodeProps<MixerData>) {
  const {
    type,
    masterVolume,
    isPlaying,
    inputCount,
    collapsed,
    channels,
  } = data;
  const { onRemove, onToggleCollapse, onUpdateParameter, onAction, onStart, onStop } = useModuleActions();

  const trackCount = parseInt(type.split("-")[1], 10);

  return (
    <Card className="bg-background border border-border shadow-lg rounded-xl overflow-hidden" style={{ minWidth: 320 }}>
      {/* Input handles — one per track along the left side */}
      {Array.from({ length: trackCount }).map((_, i) => (
        <Handle
          key={`in-${i}`}
          type="target"
          position={Position.Left}
          id={`input-${i}`}
          style={{ top: `${((i + 1) / (trackCount + 1)) * 100}%` }}
          className="!w-3 !h-3"
        />
      ))}

      {/* Stereo L/R output on the right */}
      <StereoHandles type="source" position={Position.Right} />

      <div className="p-3 space-y-3">
        <ModuleHeader
          id={id}
          title={`${trackCount}-Track Mixer`}
          subtitle={`${inputCount} connected`}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
          onRemove={onRemove}
        >
          {/* Play / Pause button in header row */}
          <Button
            size="icon"
            variant={isPlaying ? "destructive" : "default"}
            className="h-12 w-12 rounded-full shrink-0"
            aria-label={isPlaying ? "Pause mixer" : "Play mixer"}
            onClick={() => (isPlaying ? onStop(id) : onStart(id))}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </Button>
        </ModuleHeader>

        {!collapsed && (
          <>
            {/* Channel strips */}
            <div className="grid grid-cols-4 gap-2 max-h-[400px] overflow-y-auto pr-1">
              {channels.map((channel, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center gap-1.5 bg-muted/40 rounded-lg p-2"
                >
                  {/* Channel label */}
                  <span className="text-[10px] font-medium text-muted-foreground">
                    CH {i + 1}
                  </span>

                  {/* Mute toggle */}
                  <Button
                    size="icon"
                    variant={channel.muted ? "destructive" : "ghost"}
                    className="h-6 w-6"
                    aria-label={channel.muted ? `Unmute channel ${i + 1}` : `Mute channel ${i + 1}`}
                    onClick={() =>
                      onUpdateParameter(id, `channel_${i}_muted`, !channel.muted)
                    }
                  >
                    {channel.muted ? (
                      <VolumeX className="w-3 h-3" />
                    ) : (
                      <Volume2 className="w-3 h-3" />
                    )}
                  </Button>

                  {/* Volume fader (vertical via rotation) */}
                  <div className="h-24 flex items-center justify-center">
                    <div className="-rotate-90 w-20">
                      <Slider
                        min={0}
                        max={200}
                        step={1}
                        value={[Math.round(channel.volume * 100)]}
                        onValueChange={([v]) =>
                          onUpdateParameter(id, `channel_${i}_volume`, v / 100)
                        }
                        aria-label={`Channel ${i + 1} volume`}
                      />
                    </div>
                  </div>

                  {/* Pan slider with L/R labels */}
                  <div className="w-full space-y-0.5">
                    <div className="flex justify-between">
                      <span className="text-[8px] text-muted-foreground">L</span>
                      <span className="text-[8px] text-muted-foreground">R</span>
                    </div>
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      value={[Math.round((channel.pan + 1) * 50)]}
                      onValueChange={([v]) =>
                        onUpdateParameter(id, `channel_${i}_pan`, v / 50 - 1)
                      }
                      aria-label={`Channel ${i + 1} pan`}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Master section */}
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
              <Volume2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium text-muted-foreground shrink-0">
                Master
              </span>
              <Slider
                min={0}
                max={200}
                step={1}
                value={[Math.round(masterVolume * 100)]}
                onValueChange={([v]) =>
                  onUpdateParameter(id, "masterVolume", v / 100)
                }
                className="flex-1"
                aria-label="Master volume"
              />
              <span className="text-[10px] text-muted-foreground w-8 text-right">
                {Math.round(masterVolume * 100)}%
              </span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export default MixerModuleNode;
