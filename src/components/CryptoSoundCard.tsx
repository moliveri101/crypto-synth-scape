import { CryptoSound } from "@/types/crypto";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { X, TrendingUp, TrendingDown } from "lucide-react";

interface CryptoSoundCardProps {
  cryptoSound: CryptoSound;
  onRemove: () => void;
  onVolumeChange: (volume: number) => void;
  onWaveformChange: (waveform: OscillatorType) => void;
}

const waveforms: OscillatorType[] = ["sine", "square", "sawtooth", "triangle"];

const CryptoSoundCard = ({
  cryptoSound,
  onRemove,
  onVolumeChange,
  onWaveformChange,
}: CryptoSoundCardProps) => {
  const { crypto, volume, waveform, isPlaying } = cryptoSound;
  const priceChange = crypto.price_change_percentage_24h;
  const isPositive = priceChange >= 0;

  return (
    <Card className="relative overflow-hidden bg-gradient-card backdrop-blur-sm border-border shadow-card">
      <div className="absolute inset-0 bg-gradient-glow opacity-50" />
      
      <div className="relative p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <img
              src={crypto.image}
              alt={crypto.name}
              className="w-12 h-12 rounded-full ring-2 ring-primary/20"
            />
            <div>
              <h3 className="font-bold text-lg text-foreground">{crypto.name}</h3>
              <p className="text-sm text-muted-foreground">
                {crypto.symbol.toUpperCase()}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Price</p>
            <p className="text-lg font-bold text-foreground">
              ${crypto.current_price.toLocaleString()}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">24h Change</p>
            <div className="flex items-center gap-1">
              {isPositive ? (
                <TrendingUp className="w-4 h-4 text-success" />
              ) : (
                <TrendingDown className="w-4 h-4 text-destructive" />
              )}
              <p
                className={`text-lg font-bold ${
                  isPositive ? "text-success" : "text-destructive"
                }`}
              >
                {priceChange.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Waveform</p>
            {isPlaying && (
              <div className="flex gap-1">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1 h-8 bg-primary rounded-full animate-wave"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {waveforms.map((w) => (
              <Button
                key={w}
                size="sm"
                variant={waveform === w ? "default" : "outline"}
                onClick={() => onWaveformChange(w)}
                className="flex-1 text-xs"
              >
                {w}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Volume</p>
            <p className="text-sm font-medium text-foreground">
              {Math.round(volume * 100)}%
            </p>
          </div>
          <Slider
            value={[volume * 100]}
            onValueChange={(values) => onVolumeChange(values[0] / 100)}
            max={100}
            step={1}
            className="w-full"
          />
        </div>
      </div>
    </Card>
  );
};

export default CryptoSoundCard;
