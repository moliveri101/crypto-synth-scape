import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { audioContextManager } from "@/audio/AudioContextManager";

interface MasterOutputPanelProps {
  masterVolume: number;
  onMasterVolumeChange: (volume: number) => void;
}

const MasterOutputPanel = ({ masterVolume, onMasterVolumeChange }: MasterOutputPanelProps) => {
  const [leftLevel, setLeftLevel] = useState(0);
  const [rightLevel, setRightLevel] = useState(0);
  const [leftPeak, setLeftPeak] = useState(0);
  const [rightPeak, setRightPeak] = useState(0);
  const [isClipping, setIsClipping] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  const animationFrameRef = useRef<number>();
  const leftPeakHoldRef = useRef(0);
  const rightPeakHoldRef = useRef(0);
  const peakHoldTimeRef = useRef(0);

  useEffect(() => {
    const updateMeters = () => {
      const analyser = audioContextManager.getAnalyser();
      
      if (analyser) {
        // Get peak levels (0-1 range)
        const levels = audioContextManager.getPeakLevels();
        const left = levels.left;
        const right = levels.right;
        
        // Smooth decay for meters (ballistics)
        setLeftLevel(prev => left > prev ? left : prev * 0.85);
        setRightLevel(prev => right > prev ? right : prev * 0.85);
        
        // Peak hold logic
        const now = Date.now();
        if (left > leftPeakHoldRef.current || now - peakHoldTimeRef.current > 2000) {
          leftPeakHoldRef.current = left;
          peakHoldTimeRef.current = now;
        }
        if (right > rightPeakHoldRef.current || now - peakHoldTimeRef.current > 2000) {
          rightPeakHoldRef.current = right;
        }
        
        setLeftPeak(leftPeakHoldRef.current);
        setRightPeak(rightPeakHoldRef.current);
        
        // Check for clipping (> -0.3dBFS ≈ 0.97 linear)
        const clipping = left > 0.97 || right > 0.97;
        setIsClipping(clipping);
      }
      
      animationFrameRef.current = requestAnimationFrame(updateMeters);
    };
    
    updateMeters();
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    audioContextManager.setMasterVolume(newMuted ? 0 : masterVolume);
  };

  const handleVolumeChange = (value: number) => {
    if (!isMuted) {
      onMasterVolumeChange(value);
      audioContextManager.setMasterVolume(value);
    } else {
      onMasterVolumeChange(value);
    }
  };

  const levelToDb = (level: number): string => {
    if (level < 0.001) return "-∞";
    const db = 20 * Math.log10(level);
    return db.toFixed(1);
  };

  const getLevelColor = (level: number): string => {
    if (level > 0.97) return "bg-destructive";
    if (level > 0.7) return "bg-yellow-500";
    return "bg-green-500";
  };

  if (isCollapsed) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          className="h-12 w-12 shadow-glow bg-gradient-card backdrop-blur-sm"
        >
          <Volume2 className="w-5 h-5" />
        </Button>
      </div>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 z-50 bg-gradient-card backdrop-blur-sm border-accent/50 shadow-glow w-[320px]">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-accent" />
            <h3 className="font-bold text-foreground">Master Output</h3>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              className={`h-7 w-7 ${isMuted ? 'text-destructive' : ''}`}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed(true)}
              className="h-7 w-7"
            >
              <span className="text-xs">−</span>
            </Button>
          </div>
        </div>

        {/* Clipping Warning */}
        {isClipping && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2 rounded animate-pulse">
            <AlertTriangle className="w-4 h-4" />
            <span>Clipping detected! Lower the volume.</span>
          </div>
        )}

        {/* VU Meters */}
        <div className="space-y-3">
          {/* Left Channel */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium">L</span>
              <span className="text-muted-foreground font-mono">{levelToDb(leftLevel)} dB</span>
            </div>
            <div className="relative h-3 bg-muted/20 rounded-full overflow-hidden">
              {/* Level bar */}
              <div 
                className={`h-full transition-all duration-75 ${getLevelColor(leftLevel)}`}
                style={{ width: `${leftLevel * 100}%` }}
              />
              {/* Peak hold indicator */}
              {leftPeak > 0.05 && (
                <div 
                  className="absolute top-0 bottom-0 w-0.5 bg-white"
                  style={{ left: `${leftPeak * 100}%` }}
                />
              )}
            </div>
          </div>

          {/* Right Channel */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium">R</span>
              <span className="text-muted-foreground font-mono">{levelToDb(rightLevel)} dB</span>
            </div>
            <div className="relative h-3 bg-muted/20 rounded-full overflow-hidden">
              {/* Level bar */}
              <div 
                className={`h-full transition-all duration-75 ${getLevelColor(rightLevel)}`}
                style={{ width: `${rightLevel * 100}%` }}
              />
              {/* Peak hold indicator */}
              {rightPeak > 0.05 && (
                <div 
                  className="absolute top-0 bottom-0 w-0.5 bg-white"
                  style={{ left: `${rightPeak * 100}%` }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Master Volume */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">Master Volume</span>
            <span className="text-foreground font-medium">{Math.round(masterVolume * 100)}%</span>
          </div>
          <Slider
            value={[masterVolume * 100]}
            onValueChange={(values) => handleVolumeChange(values[0] / 100)}
            max={100}
            step={1}
            disabled={isMuted}
            className="w-full"
          />
        </div>

        {/* Audio Status */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className={`w-2 h-2 rounded-full ${leftLevel > 0.01 || rightLevel > 0.01 ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
          <span>{leftLevel > 0.01 || rightLevel > 0.01 ? 'Signal active' : 'No signal'}</span>
        </div>
      </div>
    </Card>
  );
};

export default MasterOutputPanel;
