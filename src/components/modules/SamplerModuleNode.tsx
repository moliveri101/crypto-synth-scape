import { Handle, Position } from "reactflow";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Music2, ChevronDown, ChevronUp, X, Upload, Mic, Play, Square, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useState, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SamplerModuleNodeProps {
  id: string;
  data: {
    collapsed: boolean;
    selectedPad: number;
    pads: Array<{
      hasSample: boolean;
      isPlaying: boolean;
      duration: number;
      volume: number;
      pitch: number;
      loop: boolean;
      loopStart: number;
      loopEnd: number;
    }>;
    volume: number;
    filterFreq: number;
    filterRes: number;
    onTriggerPad?: (id: string, padIndex: number) => void;
    onStopPad?: (id: string, padIndex: number) => void;
    onLoadSample?: (id: string, padIndex: number, file: File) => void;
    onRecordToPad?: (id: string, padIndex: number) => void;
    onPadVolumeChange?: (id: string, padIndex: number, volume: number) => void;
    onPadPitchChange?: (id: string, padIndex: number, pitch: number) => void;
    onPadLoopChange?: (id: string, padIndex: number, loop: boolean) => void;
    onPadLoopStartChange?: (id: string, padIndex: number, time: number) => void;
    onPadLoopEndChange?: (id: string, padIndex: number, time: number) => void;
    onVolumeChange?: (id: string, volume: number) => void;
    onFilterFreqChange?: (id: string, freq: number) => void;
    onFilterResChange?: (id: string, res: number) => void;
    onSelectPad?: (id: string, padIndex: number) => void;
    onToggleCollapse?: (id: string) => void;
    onRemove?: (id: string) => void;
  };
}

const SamplerModuleNode = ({ data, id }: SamplerModuleNodeProps) => {
  const [activeTab, setActiveTab] = useState("pads");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedPad = data.selectedPad;
  const pad = data.pads[selectedPad];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      data.onLoadSample?.(id, selectedPad, file);
    }
  };

  return (
    <Card className="min-w-[320px] bg-card/95 backdrop-blur-sm border-primary/20 shadow-glow">
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
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="pads">Pads</TabsTrigger>
              <TabsTrigger value="controls">Controls</TabsTrigger>
            </TabsList>

            <TabsContent value="pads" className="space-y-3 mt-3">
              {/* Pad Grid */}
              <div className="grid grid-cols-4 gap-2">
                {data.pads.map((pad, index) => (
                  <Button
                    key={index}
                    variant={selectedPad === index ? "default" : "outline"}
                    className={`h-12 relative ${
                      pad.isPlaying ? 'animate-pulse' : ''
                    } ${
                      pad.hasSample ? 'border-primary' : ''
                    }`}
                    onClick={() => {
                      data.onSelectPad?.(id, index);
                      if (pad.hasSample) {
                        data.onTriggerPad?.(id, index);
                      }
                    }}
                  >
                    <span className="text-xs">{index + 1}</span>
                    {pad.hasSample && (
                      <div className="absolute bottom-1 right-1 w-1.5 h-1.5 bg-primary rounded-full" />
                    )}
                  </Button>
                ))}
              </div>

              {/* Pad Actions */}
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 gap-2"
                  variant="secondary"
                  size="sm"
                >
                  <Upload className="w-3 h-3" />
                  Load
                </Button>
                <Button
                  onClick={() => data.onRecordToPad?.(id, selectedPad)}
                  className="flex-1 gap-2"
                  variant="secondary"
                  size="sm"
                >
                  <Mic className="w-3 h-3" />
                  Record
                </Button>
              </div>

              {pad?.hasSample && (
                <div className="flex gap-2">
                  {!pad.isPlaying ? (
                    <Button
                      onClick={() => data.onTriggerPad?.(id, selectedPad)}
                      className="flex-1 gap-2"
                      size="sm"
                    >
                      <Play className="w-3 h-3" />
                      Play
                    </Button>
                  ) : (
                    <Button
                      onClick={() => data.onStopPad?.(id, selectedPad)}
                      className="flex-1 gap-2"
                      variant="destructive"
                      size="sm"
                    >
                      <Square className="w-3 h-3" />
                      Stop
                    </Button>
                  )}
                </div>
              )}

              {pad?.hasSample && (
                <div className="text-xs text-muted-foreground text-center">
                  Pad {selectedPad + 1} • {pad.duration.toFixed(2)}s
                </div>
              )}
            </TabsContent>

            <TabsContent value="controls" className="space-y-3 mt-3">
              {pad?.hasSample ? (
                <>
                  {/* Pad Controls */}
                  <div className="space-y-3 p-2 bg-accent/20 rounded-md">
                    <Label className="text-xs font-semibold">Pad {selectedPad + 1} Controls</Label>
                    
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Volume: {(pad.volume * 100).toFixed(0)}%
                      </Label>
                      <Slider
                        value={[pad.volume]}
                        onValueChange={([v]) => data.onPadVolumeChange?.(id, selectedPad, v)}
                        min={0}
                        max={1}
                        step={0.01}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Pitch: {pad.pitch.toFixed(2)}x
                      </Label>
                      <Slider
                        value={[pad.pitch]}
                        onValueChange={([v]) => data.onPadPitchChange?.(id, selectedPad, v)}
                        min={0.25}
                        max={4}
                        step={0.01}
                        className="mt-1"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Loop</Label>
                      <Switch
                        checked={pad.loop}
                        onCheckedChange={(checked) => data.onPadLoopChange?.(id, selectedPad, checked)}
                      />
                    </div>

                    {pad.loop && (
                      <div className="space-y-2 pl-2 border-l-2 border-primary/30">
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            Loop Start: {pad.loopStart.toFixed(2)}s
                          </Label>
                          <Slider
                            value={[pad.loopStart]}
                            onValueChange={([v]) => data.onPadLoopStartChange?.(id, selectedPad, v)}
                            min={0}
                            max={pad.duration}
                            step={0.01}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            Loop End: {pad.loopEnd.toFixed(2)}s
                          </Label>
                          <Slider
                            value={[pad.loopEnd]}
                            onValueChange={([v]) => data.onPadLoopEndChange?.(id, selectedPad, v)}
                            min={pad.loopStart}
                            max={pad.duration}
                            step={0.01}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Global Controls */}
                  <div className="space-y-3 p-2 bg-accent/10 rounded-md">
                    <Label className="text-xs font-semibold flex items-center gap-2">
                      <Sliders className="w-3 h-3" />
                      Global
                    </Label>
                    
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Master Volume: {(data.volume * 100).toFixed(0)}%
                      </Label>
                      <Slider
                        value={[data.volume]}
                        onValueChange={([v]) => data.onVolumeChange?.(id, v)}
                        min={0}
                        max={1}
                        step={0.01}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Filter: {data.filterFreq.toFixed(0)}Hz
                      </Label>
                      <Slider
                        value={[data.filterFreq]}
                        onValueChange={([v]) => data.onFilterFreqChange?.(id, v)}
                        min={20}
                        max={20000}
                        step={10}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Resonance: {data.filterRes.toFixed(1)}
                      </Label>
                      <Slider
                        value={[data.filterRes]}
                        onValueChange={([v]) => data.onFilterResChange?.(id, v)}
                        min={0}
                        max={30}
                        step={0.1}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Load or record a sample to access controls
                </p>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <Handle id="out" type="source" position={Position.Right} className="!bg-primary" />
    </Card>
  );
};

export default SamplerModuleNode;
