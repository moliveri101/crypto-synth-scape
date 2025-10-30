import { Handle, Position } from "reactflow";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Music2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SamplerModuleNodeProps {
  id: string;
  data: {
    sample: string;
    pitch: number;
    decay: number;
    collapsed: boolean;
    onSampleChange?: (sample: string) => void;
    onPitchChange?: (pitch: number) => void;
    onDecayChange?: (decay: number) => void;
    onToggleCollapse?: (id: string) => void;
  };
}

const SAMPLES = [
  { value: "sine", label: "Sine Wave" },
  { value: "piano", label: "Piano" },
  { value: "synth", label: "Synth Pad" },
  { value: "bell", label: "Bell" },
  { value: "strings", label: "Strings" },
];

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
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-accent"
            onClick={() => data.onToggleCollapse?.(id)}
          >
            {data.collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </Button>
        </div>

        {!data.collapsed && (
          <div className="space-y-3">
          <div>
            <Label className="text-sm text-muted-foreground">Sample</Label>
            <Select value={data.sample} onValueChange={data.onSampleChange}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SAMPLES.map((sample) => (
                  <SelectItem key={sample.value} value={sample.value}>
                    {sample.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm text-muted-foreground">
              Pitch: {data.pitch.toFixed(1)}
            </Label>
            <Slider
              value={[data.pitch]}
              onValueChange={([v]) => data.onPitchChange?.(v)}
              min={-12}
              max={12}
              step={0.1}
              className="mt-2"
            />
          </div>

          <div>
            <Label className="text-sm text-muted-foreground">
              Decay: {data.decay.toFixed(2)}s
            </Label>
            <Slider
              value={[data.decay]}
              onValueChange={([v]) => data.onDecayChange?.(v)}
              min={0.1}
              max={5}
              step={0.1}
              className="mt-2"
            />
          </div>
        </div>
        )}
      </div>

      <Handle id="out" type="source" position={Position.Right} className="!bg-primary" />
    </Card>
  );
};

export default SamplerModuleNode;
