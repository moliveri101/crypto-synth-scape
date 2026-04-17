import React from "react";
import { Position, NodeProps } from "reactflow";
import StereoHandles from "@/modules/base/StereoHandles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play, Square, TrendingUp, TrendingDown } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";

type WaveformType = "sine" | "square" | "sawtooth" | "triangle";

interface CryptoData {
  type: "crypto";
  crypto: {
    id: string;
    name: string;
    symbol: string;
    image: string;
    current_price: number;
    price_change_percentage_24h: number;
    total_volume: number;
  };
  volume: number;
  waveform: OscillatorType;
  isPlaying: boolean;
  collapsed: boolean;
  scale: string;
  rootNote: string;
  octave: number;
  pitch: number;
  onRemove: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onUpdateParameter: (id: string, param: string, value: unknown) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
}

const WAVEFORMS: { value: WaveformType; label: string }[] = [
  { value: "sine", label: "Sine" },
  { value: "square", label: "Square" },
  { value: "sawtooth", label: "Saw" },
  { value: "triangle", label: "Tri" },
];

const SCALES = [
  "chromatic",
  "major",
  "minor",
  "pentatonic",
  "blues",
  "dorian",
  "mixolydian",
];

const ROOT_NOTES = [
  "C", "C#", "D", "D#", "E", "F",
  "F#", "G", "G#", "A", "A#", "B",
];

const OCTAVES = [1, 2, 3, 4, 5, 6, 7];

function CryptoModuleNode({ data, id }: NodeProps<CryptoData>) {
  const { onRemove, onToggleCollapse, onUpdateParameter, onStart, onStop } = useModuleActions();
  const {
    crypto,
    volume,
    waveform,
    isPlaying,
    collapsed,
    scale,
    rootNote,
    octave,
    pitch,
  } = data;

  const priceChange = crypto.price_change_percentage_24h;
  const isPriceUp = priceChange >= 0;

  return (
    <Card className="w-72 bg-background border border-border shadow-lg rounded-none overflow-hidden">
      <ModuleHeader
        icon={
          <img
            src={crypto.image}
            alt={crypto.name}
            className="w-6 h-6 rounded-full"
          />
        }
        title={crypto.name}
        subtitle={crypto.symbol.toUpperCase()}
        collapsed={collapsed}
        onToggleCollapse={() => onToggleCollapse(id)}
        onRemove={() => onRemove(id)}
      />

      {!collapsed && (
        <div className="px-3 pb-3 space-y-3">
          {/* Play / Stop */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={isPlaying ? "destructive" : "default"}
              className="flex-1"
              aria-label={isPlaying ? "Stop playback" : "Start playback"}
              onClick={() => (isPlaying ? onStop(id) : onStart(id))}
            >
              {isPlaying ? (
                <>
                  <Square className="w-3.5 h-3.5 mr-1.5" /> Stop
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 mr-1.5" /> Play
                </>
              )}
            </Button>
          </div>

          {/* Price info */}
          <div className="flex items-center justify-between text-xs bg-muted/50 rounded-none px-2.5 py-2">
            <span className="font-medium">
              ${crypto.current_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
            </span>
            <span
              className={`flex items-center gap-0.5 font-medium ${
                isPriceUp ? "text-green-500" : "text-red-500"
              }`}
            >
              {isPriceUp ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              {Math.abs(priceChange).toFixed(2)}%
            </span>
          </div>

          {/* Activity indicator */}
          {isPlaying && (
            <div className="flex items-end justify-center gap-0.5 h-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-1 bg-primary rounded-full animate-pulse"
                  style={{
                    height: `${40 + Math.random() * 60}%`,
                    animationDelay: `${i * 0.15}s`,
                    animationDuration: `${0.4 + i * 0.1}s`,
                  }}
                />
              ))}
            </div>
          )}

          {/* Waveform selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Waveform
            </label>
            <div className="grid grid-cols-4 gap-1">
              {WAVEFORMS.map((w) => (
                <Button
                  key={w.value}
                  size="sm"
                  variant={waveform === w.value ? "default" : "outline"}
                  className="h-7 text-[11px] px-1"
                  aria-label={`Set waveform to ${w.value}`}
                  onClick={() =>
                    onUpdateParameter(id, "waveform", w.value)
                  }
                >
                  {w.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Volume slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Volume
              </label>
              <span className="text-[10px] text-muted-foreground">
                {Math.round(volume * 100)}%
              </span>
            </div>
            <Slider
              min={0}
              max={200}
              step={1}
              value={[Math.round(volume * 100)]}
              onValueChange={([v]) =>
                onUpdateParameter(id, "volume", v / 100)
              }
              aria-label="Volume"
            />
          </div>

          {/* Tone settings */}
          <div className="space-y-2">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Tone Settings
            </label>

            {/* Pitch slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Pitch</span>
                <span className="text-[10px] text-muted-foreground">
                  {pitch > 0 ? `+${pitch}` : pitch}
                </span>
              </div>
              <Slider
                min={-12}
                max={12}
                step={1}
                value={[pitch]}
                onValueChange={([v]) =>
                  onUpdateParameter(id, "pitch", v)
                }
                aria-label="Pitch"
              />
            </div>

            {/* Scale select */}
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground">Scale</span>
              <Select
                value={scale}
                onValueChange={(v) =>
                  onUpdateParameter(id, "scale", v)
                }
              >
                <SelectTrigger className="h-7 text-xs" aria-label="Select scale">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCALES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Root note select */}
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground">Root Note</span>
              <Select
                value={rootNote}
                onValueChange={(v) =>
                  onUpdateParameter(id, "rootNote", v)
                }
              >
                <SelectTrigger className="h-7 text-xs" aria-label="Select root note">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROOT_NOTES.map((n) => (
                    <SelectItem key={n} value={n} className="text-xs">
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Octave select */}
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground">Octave</span>
              <Select
                value={String(octave)}
                onValueChange={(v) =>
                  onUpdateParameter(id, "octave", Number(v))
                }
              >
                <SelectTrigger className="h-7 text-xs" aria-label="Select octave">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OCTAVES.map((o) => (
                    <SelectItem key={o} value={String(o)} className="text-xs">
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      <StereoHandles type="source" position={Position.Right} />
    </Card>
  );
}

export default CryptoModuleNode;
