import { useEffect, useRef } from "react";

interface MandelbrotVisualizerProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
}

const MandelbrotVisualizer = ({ analyser, isPlaying }: MandelbrotVisualizerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const timeRef = useRef(0);
  const zoomRef = useRef(1);
  const offsetXRef = useRef(0);
  const offsetYRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      // Swap dimensions to match 90deg rotation so the fractal fills the screen
      canvas.width = window.innerHeight;
      canvas.height = window.innerWidth;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    const mandelbrot = (cx: number, cy: number, maxIter: number) => {
      let x = 0, y = 0, iteration = 0;
      while (x * x + y * y <= 4 && iteration < maxIter) {
        const xtemp = x * x - y * y + cx;
        y = 2 * x * y + cy;
        x = xtemp;
        iteration++;
      }
      return iteration;
    };

    const draw = () => {
      if (!canvas || !ctx) return;

      timeRef.current += 0.005;
      
      let bassEnergy = 0;
      let midEnergy = 0;
      let trebleEnergy = 0;
      
      // Only analyze audio if analyser is available and playing
      if (analyser && dataArray && isPlaying) {
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate energy in different frequency ranges
        const third = Math.floor(dataArray.length / 3);
        for (let i = 0; i < third; i++) bassEnergy += dataArray[i];
        for (let i = third; i < third * 2; i++) midEnergy += dataArray[i];
        for (let i = third * 2; i < dataArray.length; i++) trebleEnergy += dataArray[i];
        
        bassEnergy = bassEnergy / third / 255;
        midEnergy = midEnergy / third / 255;
        trebleEnergy = trebleEnergy / third / 255;
      }
      // Otherwise use default values for time-based animation only

      // Animate zoom and position based on audio
      const targetZoom = 1 + bassEnergy * 2;
      zoomRef.current += (targetZoom - zoomRef.current) * 0.1;
      
      offsetXRef.current = Math.sin(timeRef.current * 0.3 + midEnergy * Math.PI) * 0.2;
      offsetYRef.current = Math.cos(timeRef.current * 0.2 + trebleEnergy * Math.PI) * 0.2;

      const maxIter = 50 + Math.floor(bassEnergy * 50);
      const scale = 3 / Math.min(canvas.width, canvas.height) / zoomRef.current;

      // Faster low-res rendering using block fills for performance
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const STEP = 3; // larger = faster, more pixelated

      for (let px = 0; px < canvas.width; px += STEP) {
        for (let py = 0; py < canvas.height; py += STEP) {
          const baseCenterX = -1;
          const baseCenterY = -0.15;
          const x0 = (px - canvas.width / 2) * scale + baseCenterX + offsetXRef.current;
          const y0 = (py - canvas.height / 2) * scale + baseCenterY + offsetYRef.current;
          
          const iter = mandelbrot(x0, y0, maxIter);
          if (iter === maxIter) continue; // keep interior transparent
          const ratio = iter / maxIter;

          // Psychedelic color palette based on audio
          const hue = (ratio * 360 + timeRef.current * 50 + bassEnergy * 180) % 360;
          const sat = 70 + midEnergy * 30;
          const light = 40 + trebleEnergy * 40;

          // Convert HSL to RGB
          const c = (1 - Math.abs(2 * light / 100 - 1)) * sat / 100;
          const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
          const m = light / 100 - c / 2;

          let r = 0, g = 0, b = 0;
          if (hue < 60) { r = c; g = x; }
          else if (hue < 120) { r = x; g = c; }
          else if (hue < 180) { g = c; b = x; }
          else if (hue < 240) { g = x; b = c; }
          else if (hue < 300) { r = x; b = c; }
          else { r = c; b = x; }

          const rr = Math.round((r + m) * 255);
          const gg = Math.round((g + m) * 255);
          const bb = Math.round((b + m) * 255);
          ctx.fillStyle = `rgb(${rr}, ${gg}, ${bb})`;
          ctx.fillRect(px, py, STEP, STEP);
        }
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [analyser, isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-1/2 left-1/2 z-0 pointer-events-none opacity-50"
      style={{ 
        imageRendering: "pixelated",
        background: "transparent",
        width: "100vh",
        height: "100vw",
        transform: "translate(-50%, -50%) rotate(90deg)",
        transformOrigin: "center center"
      }}
    />
  );
};

export default MandelbrotVisualizer;
