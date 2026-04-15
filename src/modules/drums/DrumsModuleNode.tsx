import React from "react";
import { Position, NodeProps } from "reactflow";
import StereoHandles from "@/modules/base/StereoHandles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Music } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";

const DRUMS = [
  { value: "kick", label: "Kick" },
  { value: "snare", label: "Snare" },
  { value: "hihat", label: "Hi-Hat" },
  { value: "clap", label: "Clap" },
  { value: "tom", label: "Tom" },
  { value: "low-tom", label: "Low Tom" },
  { value: "mid-tom", label: "Mid Tom" },
  { value: "high-tom", label: "High Tom" },
  { value: "cowbell", label: "Cowbell" },
  { value: "ride", label: "Ride Cymbal" },
  { value: "crash", label: "Crash Cymbal" },
  { value: "shaker", label: "Shaker" },
  { value: "clave", label: "Clave" },
  { value: "rim", label: "Rim" },
  { value: "rimshot", label: "Rimshot" },
  { value: "bongo", label: "Bongo" },
  { value: "conga", label: "Conga" },
];

interface DrumsData {
  type: "drums";
  selectedDrum: string;
  volume: number;
  pitch: number;
  collapsed: boolean;
}

function DrumsModuleNode({ data, id }: NodeProps<DrumsData>) {
  const {
    selectedDrum,
    collapsed,
  } = data;
  const { onRemove, onToggleCollapse, onUpdateParameter, onAction, onStart, onStop } = useModuleActions();

  return (
    <Card className="w-[280px] bg-background border border-amber-500/50 shadow-lg rounded-xl overflow-hidden">
      <StereoHandles type="target" position={Position.Left} className="!bg-amber-500" />

      <CardHeader className="p-3 pb-0">
        <ModuleHeader
          id={id}
          icon={<Music className="w-5 h-5 text-amber-500" />}
          title="DRUMS"
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
          onRemove={onRemove}
        />
      </CardHeader>

      {!collapsed && (
        <CardContent className="p-3 pt-2 space-y-3">
          {/* Drum sound selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Drum Sound
            </label>
            <Select
              value={selectedDrum}
              onValueChange={(value) =>
                onUpdateParameter(id, "selectedDrum", value)
              }
            >
              <SelectTrigger className="h-7 text-xs" aria-label="Select drum sound">
                <SelectValue placeholder="Select drum..." />
              </SelectTrigger>
              <SelectContent>
                {DRUMS.map((drum) => (
                  <SelectItem key={drum.value} value={drum.value} className="text-xs">
                    {drum.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Info text */}
          <p className="text-[10px] text-muted-foreground italic">
            Volume and pitch controlled by connected crypto data
          </p>

          {/* Trigger button */}
          <Button
            size="sm"
            variant="outline"
            className="w-full border-amber-500/50 hover:bg-amber-500/10 text-amber-600"
            aria-label="Trigger drum sound"
            onClick={() => onAction(id, "trigger")}
          >
            Trigger Sound
          </Button>
        </CardContent>
      )}

      <StereoHandles type="source" position={Position.Right} className="!bg-amber-500" />
    </Card>
  );
}

export default DrumsModuleNode;
