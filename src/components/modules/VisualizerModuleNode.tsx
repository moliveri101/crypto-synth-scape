import { useEffect, useRef } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { VisualizerModuleData } from "@/types/modules";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

const VisualizerModuleNode = ({ data, id }: NodeProps<VisualizerModuleData & {
  isPlaying: boolean;
  activeCryptos: number;
  onToggleCollapse: (id: string) => void;
}>) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { isPlaying, activeCryptos, collapsed, onToggleCollapse } = data;

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
        const barCount = 32;
        const barWidth = width / barCount;

        for (let i = 0; i < barCount; i++) {
          const time = Date.now() / 1000;
          const value =
            Math.sin(i / 5 + time * 2) * 0.3 +
            Math.sin(i / 3 + time * 1.5) * 0.3 +
            Math.sin(i / 7 + time) * 0.4;

          const barHeight = ((value + 1) / 2) * height * 0.8;
          const x = i * barWidth;
          const y = height - barHeight;

          const gradient = ctx.createLinearGradient(0, y, 0, height);
          gradient.addColorStop(0, "hsl(188, 95%, 58%)");
          gradient.addColorStop(0.5, "hsl(268, 85%, 66%)");
          gradient.addColorStop(1, "hsl(320, 85%, 65%)");

          ctx.fillStyle = gradient;
          ctx.fillRect(x, y, barWidth - 1, barHeight);
        }
      } else {
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
    <div className="bg-gradient-card backdrop-blur-sm border-2 border-border rounded-lg shadow-card overflow-hidden w-[320px]">
      <Handle
        id="in"
        type="target"
        position={Position.Left}
        className="!bg-primary !w-3 !h-3 !border-2 !border-background"
      />
      
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-sm text-foreground">Audio Visualizer</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-accent"
            onClick={() => onToggleCollapse(id)}
          >
            {collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </Button>
        </div>
        {!collapsed && (
          <canvas
            ref={canvasRef}
            width={320}
            height={120}
            className="w-full h-[120px] rounded"
          />
        )}
      </div>
    </div>
  );
};

export default VisualizerModuleNode;
