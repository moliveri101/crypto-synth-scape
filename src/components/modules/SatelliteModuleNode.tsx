import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Satellite, Play, Pause, ChevronDown, ChevronUp, X } from "lucide-react";
import { SatelliteModuleData } from "@/types/modules";

const SatelliteModuleNode = ({ data }: NodeProps<SatelliteModuleData & {
  onUpdate: (updates: Partial<SatelliteModuleData>) => void;
  onTogglePlay: () => void;
  onRemove?: () => void;
}>) => {
  const { onUpdate, onTogglePlay, onRemove } = data as any;
  
  const formatValue = (value: number, decimals = 2) => value.toFixed(decimals);

  return (
    <Card className="w-[280px] bg-gradient-to-br from-background via-background to-primary/5 shadow-xl border-primary/20">
      <div className="p-3 border-b border-border/50 flex items-center justify-between bg-primary/5">
        <div className="flex items-center gap-2">
          <Satellite className="w-5 h-5 text-primary" />
          <div className="flex flex-col">
            <span className="font-semibold text-sm">
              {data.satellite?.name || "No Satellite"}
            </span>
            {data.satellite && (
              <span className="text-xs text-muted-foreground">
                ID: {data.satellite.id}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant={data.isPlaying ? "default" : "outline"}
            className="h-8 w-8"
            onClick={onTogglePlay}
          >
            {data.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => onUpdate({ collapsed: !data.collapsed })}
          >
            {data.collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
          {onRemove && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
              onClick={onRemove}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {!data.collapsed && (
        <div className="p-4 space-y-4">
          {data.satellite && (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Speed:</span>
                    <Badge variant="secondary" className="text-xs">
                      {formatValue(data.speed)} km/s
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Altitude:</span>
                    <Badge variant="secondary" className="text-xs">
                      {formatValue(data.altitude)} km
                    </Badge>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Latitude:</span>
                    <Badge variant="secondary" className="text-xs">
                      {formatValue(data.latitude)}°
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Longitude:</span>
                    <Badge variant="secondary" className="text-xs">
                      {formatValue(data.longitude)}°
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-border/50">
                <div className="text-xs text-muted-foreground mb-2">Audio Mappings</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>Rhythm:</span>
                    <span className="text-primary">Speed</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Note (Hz):</span>
                    <span className="text-primary">Altitude</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pitch Var:</span>
                    <span className="text-primary">Latitude</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Volume Var:</span>
                    <span className="text-primary">Longitude</span>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium">Waveform</label>
            <Select
              value={data.waveform}
              onValueChange={(value) => onUpdate({ waveform: value as OscillatorType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sine">Sine</SelectItem>
                <SelectItem value="square">Square</SelectItem>
                <SelectItem value="sawtooth">Sawtooth</SelectItem>
                <SelectItem value="triangle">Triangle</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-medium">Volume</label>
              <span className="text-xs text-muted-foreground">{Math.round(data.volume * 100)}%</span>
            </div>
            <Slider
              value={[data.volume]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={([value]) => onUpdate({ volume: value })}
              className="w-full"
            />
          </div>
        </div>
      )}

      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-primary" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-primary" />
    </Card>
  );
};

export default SatelliteModuleNode;
