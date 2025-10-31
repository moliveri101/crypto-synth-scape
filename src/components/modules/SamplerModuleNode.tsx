import { Handle, Position } from "reactflow";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Music2, ChevronDown, ChevronUp, X, Mic, Square, Play, Pause, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

interface SamplerModuleNodeProps {
  id: string;
  data: {
    volume: number;
    loop: boolean;
    isRecording: boolean;
    isPlaying: boolean;
    hasRecording: boolean;
    collapsed: boolean;
    onStartRecording?: (id: string) => void;
    onStopRecording?: (id: string) => void;
    onStartPlayback?: (id: string) => void;
    onStopPlayback?: (id: string) => void;
    onVolumeChange?: (id: string, volume: number) => void;
    onLoopChange?: (id: string, loop: boolean) => void;
    onToggleCollapse?: (id: string) => void;
    onRemove?: (id: string) => void;
  };
}

const SamplerModuleNode = ({ data, id }: SamplerModuleNodeProps) => {
  return (
    <Card className="min-w-[280px] bg-card/95 backdrop-blur-sm border-primary/20 shadow-glow">
      <Handle id="in" type="target" position={Position.Left} className="!bg-primary" />
      
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <div className="flex items-center gap-2">
            <Music2 className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Sampler</h3>
          </div>
          <div className="flex gap-1 items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => data.onRemove?.(id)}
            >
              <X className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-accent"
              onClick={() => data.onToggleCollapse?.(id)}
            >
              {data.collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            </Button>
          </div>
        </div>

        {!data.collapsed && (
          <div className="space-y-3">
            <div className="flex gap-2">
              {!data.isRecording ? (
                <Button
                  onClick={() => data.onStartRecording?.(id)}
                  className="flex-1 gap-2"
                  variant="default"
                >
                  <Mic className="w-4 h-4" />
                  Record
                </Button>
              ) : (
                <Button
                  onClick={() => data.onStopRecording?.(id)}
                  className="flex-1 gap-2"
                  variant="destructive"
                >
                  <Square className="w-4 h-4" />
                  Stop Recording
                </Button>
              )}
            </div>

            {data.hasRecording && (
              <>
                <div className="flex gap-2">
                  {!data.isPlaying ? (
                    <Button
                      onClick={() => data.onStartPlayback?.(id)}
                      className="flex-1 gap-2"
                      variant="secondary"
                    >
                      <Play className="w-4 h-4" />
                      Play
                    </Button>
                  ) : (
                    <Button
                      onClick={() => data.onStopPlayback?.(id)}
                      className="flex-1 gap-2"
                      variant="secondary"
                    >
                      <Pause className="w-4 h-4" />
                      Stop
                    </Button>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-sm text-muted-foreground flex items-center gap-2">
                    <Repeat className="w-4 h-4" />
                    Loop
                  </Label>
                  <Switch
                    checked={data.loop}
                    onCheckedChange={(checked) => data.onLoopChange?.(id, checked)}
                  />
                </div>

                <div>
                  <Label className="text-sm text-muted-foreground">
                    Volume: {(data.volume * 100).toFixed(0)}%
                  </Label>
                  <Slider
                    value={[data.volume]}
                    onValueChange={([v]) => data.onVolumeChange?.(id, v)}
                    min={0}
                    max={1}
                    step={0.01}
                    className="mt-2"
                  />
                </div>
              </>
            )}

            {!data.hasRecording && !data.isRecording && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Click Record to capture audio from your microphone
              </p>
            )}

            {data.isRecording && (
              <div className="flex items-center justify-center gap-2 py-2">
                <div className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
                <p className="text-xs text-muted-foreground">Recording...</p>
              </div>
            )}
          </div>
        )}
      </div>

      <Handle id="out" type="source" position={Position.Right} className="!bg-primary" />
    </Card>
  );
};

export default SamplerModuleNode;
