import { Play, Pause, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";

interface MasterControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  masterVolume: number;
  onMasterVolumeChange: (volume: number) => void;
  activeCryptos: number;
}

const MasterControls = ({
  isPlaying,
  onTogglePlay,
  masterVolume,
  onMasterVolumeChange,
  activeCryptos,
}: MasterControlsProps) => {
  return (
    <Card className="bg-gradient-card backdrop-blur-sm border-border shadow-card">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Master Controls</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {activeCryptos} {activeCryptos === 1 ? "layer" : "layers"} active
            </p>
          </div>
          <Button
            size="lg"
            onClick={onTogglePlay}
            disabled={activeCryptos === 0}
            className="w-16 h-16 rounded-full shadow-glow"
          >
            {isPlaying ? (
              <Pause className="w-8 h-8" />
            ) : (
              <Play className="w-8 h-8 ml-1" />
            )}
          </Button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Master Volume</p>
            </div>
            <p className="text-sm font-medium text-foreground">
              {Math.round(masterVolume * 100)}%
            </p>
          </div>
          <Slider
            value={[masterVolume * 100]}
            onValueChange={(values) => onMasterVolumeChange(values[0] / 100)}
            max={100}
            step={1}
            className="w-full"
          />
        </div>
      </div>
    </Card>
  );
};

export default MasterControls;
