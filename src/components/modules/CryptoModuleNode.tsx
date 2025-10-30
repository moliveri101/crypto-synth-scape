import { Handle, Position, NodeProps } from "reactflow";
import { CryptoModuleData } from "@/types/modules";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { X, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from "lucide-react";

const waveforms: OscillatorType[] = ["sine", "square", "sawtooth", "triangle"];

const CryptoModuleNode = ({ data, id }: NodeProps<CryptoModuleData & {
  onRemove: (id: string) => void;
  onVolumeChange: (id: string, volume: number) => void;
  onWaveformChange: (id: string, waveform: OscillatorType) => void;
  onToggleCollapse: (id: string) => void;
}>) => {
  const { crypto, volume, waveform, isPlaying, collapsed, onRemove, onVolumeChange, onWaveformChange, onToggleCollapse } = data;
  const priceChange = crypto.price_change_percentage_24h;
  const isPositive = priceChange >= 0;

  return (
    <div className="bg-gradient-card backdrop-blur-sm border-2 border-border rounded-lg shadow-glow w-[280px]">
      <Handle
        id="out"
        type="source"
        position={Position.Right}
        className="!bg-primary !w-3 !h-3 !border-2 !border-background"
      />
      
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <img
              src={crypto.image}
              alt={crypto.name}
              className="w-8 h-8 rounded-full ring-2 ring-primary/20"
            />
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-sm text-foreground truncate">
                {crypto.name}
              </h3>
              <p className="text-xs text-muted-foreground">
                {crypto.symbol.toUpperCase()}
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-accent"
              onClick={() => onToggleCollapse(id)}
            >
              {collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onRemove(id)}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {!collapsed && (
          <>
        {/* Price Info */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Price</p>
            <p className="font-bold text-foreground">
              ${crypto.current_price.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">24h</p>
            <div className="flex items-center gap-1">
              {isPositive ? (
                <TrendingUp className="w-3 h-3 text-success" />
              ) : (
                <TrendingDown className="w-3 h-3 text-destructive" />
              )}
              <p
                className={`font-bold ${
                  isPositive ? "text-success" : "text-destructive"
                }`}
              >
                {priceChange.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>

        {/* Activity Indicator */}
        {isPlaying && (
          <div className="flex gap-1 justify-center py-1">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-1 h-6 bg-primary rounded-full animate-wave"
                style={{ animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        )}

        {/* Waveform Select */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Waveform</p>
          <div className="grid grid-cols-4 gap-1">
            {waveforms.map((w) => (
              <Button
                key={w}
                size="sm"
                variant={waveform === w ? "default" : "outline"}
                onClick={() => onWaveformChange(id, w)}
                className="h-7 text-xs px-1"
              >
                {w[0].toUpperCase()}
              </Button>
            ))}
          </div>
        </div>

        {/* Volume Control */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <p className="text-muted-foreground">Volume</p>
            <p className="text-foreground font-medium">{Math.round(volume * 100)}%</p>
          </div>
          <Slider
            value={[volume * 100]}
            onValueChange={(values) => onVolumeChange(id, values[0] / 100)}
            max={100}
            step={1}
          />
        </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CryptoModuleNode;
