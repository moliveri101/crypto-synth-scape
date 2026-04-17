import React, { useState, useRef } from "react";
import { Position, NodeProps } from "reactflow";
import StereoHandles from "@/modules/base/StereoHandles";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Music2, Play, Square, Upload, Mic } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";

interface PadState {
  hasSample: boolean;
  isPlaying: boolean;
  duration: number;
  volume: number;
  pitch: number;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
}

interface SamplerData {
  type: "sampler";
  collapsed: boolean;
  selectedPad: number;
  pads: PadState[];
  volume: number;
  filterFreq: number;
  filterRes: number;
}

function SamplerModuleNode({ data, id }: NodeProps<SamplerData>) {
  const {
    collapsed,
    selectedPad,
    pads,
    volume,
    filterFreq,
    filterRes,
  } = data;
  const { onRemove, onToggleCollapse, onUpdateParameter, onAction, onStart, onStop } = useModuleActions();

  const [activeTab, setActiveTab] = useState("pads");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentPad = pads[selectedPad] ?? {
    hasSample: false,
    isPlaying: false,
    duration: 0,
    volume: 0.8,
    pitch: 1,
    loop: false,
    loopStart: 0,
    loopEnd: 1,
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onAction(id, "loadSample", { padIndex: selectedPad, file });
      e.target.value = "";
    }
  };

  const handlePadClick = (index: number) => {
    onUpdateParameter(id, "selectedPad", index);
    if (pads[index]?.hasSample) {
      onAction(id, "triggerPad", { padIndex: index });
    }
  };

  return (
    <Card className="min-w-[320px] bg-background border border-border shadow-lg rounded-none overflow-hidden">
      <StereoHandles type="target" position={Position.Left} />

      <CardHeader className="p-3 pb-0">
        <ModuleHeader
          id={id}
          icon={<Music2 className="w-5 h-5" />}
          title="Sampler"
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
          onRemove={onRemove}
        />
      </CardHeader>

      {!collapsed && (
        <CardContent className="p-3 pt-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full mb-2">
              <TabsTrigger value="pads" className="flex-1 text-xs">
                Pads
              </TabsTrigger>
              <TabsTrigger value="controls" className="flex-1 text-xs">
                Controls
              </TabsTrigger>
            </TabsList>

            {/* ---- Pads Tab ---- */}
            <TabsContent value="pads" className="space-y-3 mt-0">
              {/* 4x2 pad grid */}
              <div className="grid grid-cols-4 gap-1.5">
                {pads.slice(0, 8).map((pad, index) => (
                  <Button
                    key={index}
                    variant={selectedPad === index ? "default" : "outline"}
                    className={`relative h-12 text-xs font-mono ${
                      pad.isPlaying ? "animate-pulse" : ""
                    }`}
                    aria-label={`Pad ${index + 1}${pad.hasSample ? " (loaded)" : ""}${pad.isPlaying ? " (playing)" : ""}`}
                    onClick={() => handlePadClick(index)}
                  >
                    {index + 1}
                    {pad.hasSample && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-green-500" />
                    )}
                  </Button>
                ))}
              </div>

              {/* Pad actions */}
              <div className="flex items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-xs"
                  aria-label={`Load sample to pad ${selectedPad + 1}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5 mr-1" />
                  Load
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-xs"
                  aria-label={`Record to pad ${selectedPad + 1}`}
                  onClick={() =>
                    onAction(id, "recordToPad", { padIndex: selectedPad })
                  }
                >
                  <Mic className="w-3.5 h-3.5 mr-1" />
                  Record
                </Button>
              </div>

              {/* Play/Stop for selected pad */}
              {currentPad.hasSample && (
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs"
                    aria-label={`Play pad ${selectedPad + 1}`}
                    onClick={() =>
                      onAction(id, "triggerPad", { padIndex: selectedPad })
                    }
                  >
                    <Play className="w-3.5 h-3.5 mr-1" />
                    Play
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs"
                    aria-label={`Stop pad ${selectedPad + 1}`}
                    onClick={() =>
                      onAction(id, "stopPad", { padIndex: selectedPad })
                    }
                  >
                    <Square className="w-3.5 h-3.5 mr-1" />
                    Stop
                  </Button>
                </div>
              )}

              {/* Duration display */}
              {currentPad.hasSample && (
                <div className="flex items-center justify-between text-[10px] text-muted-foreground bg-muted/50 rounded-none px-2.5 py-1.5">
                  <span>Duration</span>
                  <span className="font-medium">
                    {currentPad.duration.toFixed(2)}s
                  </span>
                </div>
              )}
            </TabsContent>

            {/* ---- Controls Tab ---- */}
            <TabsContent value="controls" className="space-y-3 mt-0">
              {/* Per-pad controls */}
              {currentPad.hasSample && (
                <div className="space-y-2.5 border-b border-border pb-3">
                  <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Pad {selectedPad + 1} Controls
                  </Label>

                  {/* Pad volume */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        Volume
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {Math.round(currentPad.volume * 100)}%
                      </span>
                    </div>
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      value={[Math.round(currentPad.volume * 100)]}
                      onValueChange={([v]) =>
                        onUpdateParameter(
                          id,
                          `pad_${selectedPad}_volume`,
                          v / 100
                        )
                      }
                      aria-label={`Pad ${selectedPad + 1} volume`}
                    />
                  </div>

                  {/* Pad pitch */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        Pitch
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {currentPad.pitch.toFixed(2)}x
                      </span>
                    </div>
                    <Slider
                      min={25}
                      max={400}
                      step={1}
                      value={[Math.round(currentPad.pitch * 100)]}
                      onValueChange={([v]) =>
                        onUpdateParameter(
                          id,
                          `pad_${selectedPad}_pitch`,
                          v / 100
                        )
                      }
                      aria-label={`Pad ${selectedPad + 1} pitch`}
                    />
                  </div>

                  {/* Loop toggle */}
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor={`loop-${id}-${selectedPad}`}
                      className="text-[10px] text-muted-foreground"
                    >
                      Loop
                    </Label>
                    <Switch
                      id={`loop-${id}-${selectedPad}`}
                      checked={currentPad.loop}
                      onCheckedChange={(checked) =>
                        onUpdateParameter(
                          id,
                          `pad_${selectedPad}_loop`,
                          checked
                        )
                      }
                      aria-label={`Toggle loop for pad ${selectedPad + 1}`}
                    />
                  </div>

                  {/* Loop start / end (only when loop is on) */}
                  {currentPad.loop && (
                    <>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">
                            Loop Start
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {currentPad.loopStart.toFixed(2)}s
                          </span>
                        </div>
                        <Slider
                          min={0}
                          max={Math.round(currentPad.duration * 100)}
                          step={1}
                          value={[Math.round(currentPad.loopStart * 100)]}
                          onValueChange={([v]) =>
                            onUpdateParameter(
                              id,
                              `pad_${selectedPad}_loopStart`,
                              v / 100
                            )
                          }
                          aria-label={`Pad ${selectedPad + 1} loop start`}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">
                            Loop End
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {currentPad.loopEnd.toFixed(2)}s
                          </span>
                        </div>
                        <Slider
                          min={0}
                          max={Math.round(currentPad.duration * 100)}
                          step={1}
                          value={[Math.round(currentPad.loopEnd * 100)]}
                          onValueChange={([v]) =>
                            onUpdateParameter(
                              id,
                              `pad_${selectedPad}_loopEnd`,
                              v / 100
                            )
                          }
                          aria-label={`Pad ${selectedPad + 1} loop end`}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Global controls */}
              <div className="space-y-2.5">
                <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Global Controls
                </Label>

                {/* Master volume */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      Master Volume
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {Math.round(volume * 100)}%
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[Math.round(volume * 100)]}
                    onValueChange={([v]) =>
                      onUpdateParameter(id, "volume", v / 100)
                    }
                    aria-label="Master volume"
                  />
                </div>

                {/* Filter frequency */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      Filter Freq
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {filterFreq >= 1000
                        ? `${(filterFreq / 1000).toFixed(1)}kHz`
                        : `${Math.round(filterFreq)}Hz`}
                    </span>
                  </div>
                  <Slider
                    min={20}
                    max={20000}
                    step={1}
                    value={[filterFreq]}
                    onValueChange={([v]) =>
                      onUpdateParameter(id, "filterFreq", v)
                    }
                    aria-label="Filter frequency"
                  />
                </div>

                {/* Filter resonance */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      Resonance
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {filterRes.toFixed(1)}
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={300}
                    step={1}
                    value={[Math.round(filterRes * 10)]}
                    onValueChange={([v]) =>
                      onUpdateParameter(id, "filterRes", v / 10)
                    }
                    aria-label="Filter resonance"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      )}

      <StereoHandles type="source" position={Position.Right} />
    </Card>
  );
}

export default SamplerModuleNode;
