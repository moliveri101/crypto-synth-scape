import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";

interface AudioVisualizerProps {
  isPlaying: boolean;
  activeCryptos: number;
}

const AudioVisualizer = ({ isPlaying, activeCryptos }: AudioVisualizerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;

      ctx.fillStyle = "hsl(220, 20%, 12%)";
      ctx.fillRect(0, 0, width, height);

      if (isPlaying && activeCryptos > 0) {
        const barCount = 64;
        const barWidth = width / barCount;

        for (let i = 0; i < barCount; i++) {
          // Create dynamic wave pattern
          const time = Date.now() / 1000;
          const value =
            Math.sin(i / 5 + time * 2) * 0.3 +
            Math.sin(i / 3 + time * 1.5) * 0.3 +
            Math.sin(i / 7 + time) * 0.4;

          const barHeight = ((value + 1) / 2) * height * 0.8;
          const x = i * barWidth;
          const y = height - barHeight;

          // Gradient based on position
          const gradient = ctx.createLinearGradient(0, y, 0, height);
          gradient.addColorStop(0, "hsl(188, 95%, 58%)");
          gradient.addColorStop(0.5, "hsl(268, 85%, 66%)");
          gradient.addColorStop(1, "hsl(320, 85%, 65%)");

          ctx.fillStyle = gradient;
          ctx.fillRect(x, y, barWidth - 2, barHeight);
        }
      } else {
        // Idle state - flat line with subtle pulse
        ctx.strokeStyle = "hsl(188, 95%, 58%, 0.3)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [isPlaying, activeCryptos]);

  return (
    <Card className="bg-gradient-card backdrop-blur-sm border-border shadow-card overflow-hidden">
      <canvas
        ref={canvasRef}
        width={800}
        height={200}
        className="w-full h-[200px]"
      />
    </Card>
  );
};

export default AudioVisualizer;
