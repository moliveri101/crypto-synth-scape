import { Handle, Position } from "reactflow";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Music, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ToneSelectorModuleNodeProps {
  id: string;
  data: {
    scale: string;
    rootNote: string;
    octave: number;
    collapsed: boolean;
    onScaleChange?: (scale: string) => void;
    onRootNoteChange?: (note: string) => void;
    onOctaveChange?: (octave: number) => void;
    onToggleCollapse?: (id: string) => void;
  };
}

const SCALES = [
  { value: "major", label: "Major" },
  { value: "minor", label: "Minor" },
  { value: "pentatonic", label: "Pentatonic" },
  { value: "blues", label: "Blues" },
  { value: "chromatic", label: "Chromatic" },
  { value: "dorian", label: "Dorian" },
  { value: "phrygian", label: "Phrygian" },
  { value: "lydian", label: "Lydian" },
];

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const ToneSelectorModuleNode = ({ data, id }: ToneSelectorModuleNodeProps) => {
  return (
    <Card className="min-w-[280px] bg-card/95 backdrop-blur-sm border-accent/20 shadow-glow">
      <Handle type="target" position={Position.Left} className="!bg-accent" />
      
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5 text-accent" />
            <h3 className="font-semibold text-foreground">Tone Selector</h3>
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
            <Label className="text-sm text-muted-foreground">Scale</Label>
            <Select value={data.scale} onValueChange={data.onScaleChange}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCALES.map((scale) => (
                  <SelectItem key={scale.value} value={scale.value}>
                    {scale.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm text-muted-foreground">Root Note</Label>
            <Select value={data.rootNote} onValueChange={data.onRootNoteChange}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTES.map((note) => (
                  <SelectItem key={note} value={note}>
                    {note}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm text-muted-foreground">Octave</Label>
            <Select 
              value={data.octave.toString()} 
              onValueChange={(v) => data.onOctaveChange?.(parseInt(v))}
            >
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 3, 4, 5, 6].map((octave) => (
                  <SelectItem key={octave} value={octave.toString()}>
                    {octave}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!bg-accent" />
    </Card>
  );
};

export default ToneSelectorModuleNode;
