import { Handle, Position, NodeProps } from "reactflow";
import StereoHandles from "@/modules/base/StereoHandles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { VerticalSlider } from "@/components/ui/vertical-slider";
import { Volume2, VolumeX } from "lucide-react";
import ModuleHeader from "@/modules/base/ModuleHeader";
import { useModuleActions } from "@/modules/base/ModuleContext";

interface ChannelData {
  volume: number;  // 0..3 (0% to 300%)
  pan: number;     // -1..+1
  muted: boolean;
}

interface MixerData {
  type: "mixer-4" | "mixer-8" | "mixer-16" | "mixer-32";
  masterVolume: number; // 0..3
  inputCount: number;
  collapsed: boolean;
  channels: ChannelData[];
}

// Wider-range volume: linear gain 0..3 (300%). In dB terms this is
// -∞ → +9.5 dB, giving plenty of headroom to bring quiet sources up.
const VOLUME_MAX = 3;

/** Convert linear gain (0..∞) to a dB string. Handles silence gracefully. */
function volumeToDb(v: number): string {
  if (v <= 0.001) return "-∞";
  const db = 20 * Math.log10(v);
  const sign = db >= 0 ? "+" : "";
  return `${sign}${db.toFixed(1)}dB`;
}

function MixerModuleNode({ data, id }: NodeProps<MixerData>) {
  const {
    type,
    masterVolume,
    inputCount,
    collapsed,
    channels,
  } = data;
  const { onRemove, onToggleCollapse, onUpdateParameter } = useModuleActions();

  const trackCount = parseInt(type.split("-")[1], 10);

  return (
    <Card className="bg-background border border-border shadow-lg rounded-xl overflow-hidden" style={{ minWidth: 340 }}>
      {/* Per-channel input handles on the left edge.
          Handle IDs MUST match the descriptor's inputHandles() entries
          (`in-0`, `in-1`, …) so the AudioRouter can resolve them. */}
      {Array.from({ length: trackCount }).map((_, i) => (
        <Handle
          key={`in-${i}`}
          type="target"
          position={Position.Left}
          id={`in-${i}`}
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
        />

        {!collapsed && (
          <>
            {/* Channel strips. nodrag/nopan keeps ReactFlow from stealing
                pointer events from the sliders while the user drags. */}
            <div className="grid grid-cols-4 gap-2 max-h-[440px] overflow-y-auto pr-1 nodrag nopan">
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

                  {/* dB readout — lives above the fader so it doesn't rotate */}
                  <span className="text-[9px] font-mono tabular-nums text-muted-foreground">
                    {volumeToDb(channel.volume)}
                  </span>

                  {/* Volume fader — proper vertical slider (Radix native
                      orientation). Taller travel distance + native pointer
                      mapping makes drag feel smooth. */}
                  <div className="h-32 flex items-center justify-center nodrag nopan">
                    <VerticalSlider
                      min={0}
                      max={VOLUME_MAX * 100}
                      step={1}
                      value={[Math.round(channel.volume * 100)]}
                      onValueChange={([v]) =>
                        onUpdateParameter(id, `channel_${i}_volume`, v / 100)
                      }
                      aria-label={`Channel ${i + 1} volume`}
                    />
                  </div>

                  {/* % readout below fader */}
                  <span className="text-[9px] font-mono tabular-nums text-foreground">
                    {Math.round(channel.volume * 100)}%
                  </span>

                  {/* Pan slider with L/R labels. Double-click anywhere on
                      the pan row snaps the channel back to center (pan=0),
                      which is especially useful when the slider drifted
                      off-center while dragging. */}
                  <div
                    className="w-full space-y-0.5 nodrag nopan cursor-pointer"
                    onDoubleClick={() => onUpdateParameter(id, `channel_${i}_pan`, 0)}
                    title="Double-click to center"
                  >
                    <div className="flex justify-between">
                      <span className="text-[8px] text-muted-foreground">L</span>
                      <span className="text-[8px] text-muted-foreground">C</span>
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

            {/* Master section — also wider range. nodrag/nopan so the
                master fader doesn't fight ReactFlow pan. */}
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 nodrag nopan">
              <Volume2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium text-muted-foreground shrink-0">
                Master
              </span>
              <Slider
                min={0}
                max={VOLUME_MAX * 100}
                step={1}
                value={[Math.round(masterVolume * 100)]}
                onValueChange={([v]) =>
                  onUpdateParameter(id, "masterVolume", v / 100)
                }
                className="flex-1"
                aria-label="Master volume"
              />
              <span className="text-[10px] font-mono tabular-nums text-muted-foreground w-20 text-right">
                {Math.round(masterVolume * 100)}% · {volumeToDb(masterVolume)}
              </span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export default MixerModuleNode;
