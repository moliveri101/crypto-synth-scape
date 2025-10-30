import { Handle, Position, NodeProps } from "reactflow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Music, ChevronDown, ChevronUp, X } from "lucide-react";
import { DrumsModuleData } from "@/types/modules";

const DRUMS = [
  { value: "kick", label: "Kick", icon: "🥁" },
  { value: "snare", label: "Snare", icon: "🎵" },
  { value: "hihat", label: "Hi-Hat", icon: "🎶" },
  { value: "clap", label: "Clap", icon: "👏" },
] as const;

const DrumsModuleNode = ({ data, id }: NodeProps<DrumsModuleData & { 
  onParameterChange: (nodeId: string, param: string, value: any) => void,
  onToggleCollapse?: (id: string) => void,
  onRemove?: (id: string) => void,
  onTrigger?: (id: string) => void,
}>) => {
  return (
    <Card className="w-[280px] border-2 border-amber-500/50 shadow-glow bg-card/95 backdrop-blur">
      <Handle id="in" type="target" position={Position.Left} className="!bg-amber-500 !w-3 !h-3" />
      
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5 text-amber-500" />
            <CardTitle className="text-sm font-bold text-foreground">DRUMS</CardTitle>
          </div>
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
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground">Select Drum</span>
            <div className="grid grid-cols-2 gap-2">
              {DRUMS.map((drum) => (
                <Button
                  key={drum.value}
                  variant={data.selectedDrum === drum.value ? "default" : "outline"}
                  className="h-16 flex-col gap-1"
                  onClick={() => data.onParameterChange(id, "selectedDrum", drum.value)}
                >
                  <span className="text-2xl">{drum.icon}</span>
                  <span className="text-xs">{drum.label}</span>
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Volume</span>
              <span className="text-xs font-mono text-foreground">{Math.round(data.volume * 100)}%</span>
            </div>
            <Slider
              value={[data.volume * 100]}
              onValueChange={([value]) => data.onParameterChange(id, "volume", value / 100)}
              min={0}
              max={100}
              step={1}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Pitch</span>
              <span className="text-xs font-mono text-foreground">{data.pitch > 0 ? '+' : ''}{data.pitch}</span>
            </div>
            <Slider
              value={[data.pitch]}
              onValueChange={([value]) => data.onParameterChange(id, "pitch", value)}
              min={-12}
              max={12}
              step={1}
              className="w-full"
            />
          </div>

          <Button
            variant="default"
            className="w-full"
            onClick={() => data.onTrigger?.(id)}
          >
            Trigger Sound
          </Button>
        </CardContent>
      )}

      <Handle id="out" type="source" position={Position.Right} className="!bg-amber-500 !w-3 !h-3" />
    </Card>
  );
};

export default DrumsModuleNode;
