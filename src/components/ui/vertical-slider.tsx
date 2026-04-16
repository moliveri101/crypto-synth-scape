import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

/**
 * Vertical slider built on Radix Slider's orientation="vertical" mode.
 *
 * This is the correct way to render a fader — it uses Radix's native pointer
 * mapping instead of the CSS `-rotate-90` trick that caused the mixer faders
 * to behave jerkily (the rotation broke pointer tracking because Radix's
 * bounding-box math didn't match what the user's mouse actually sees).
 */
export const VerticalSlider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    orientation="vertical"
    className={cn(
      "relative flex h-full w-5 touch-none select-none flex-col items-center justify-center",
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative w-2 h-full grow overflow-hidden rounded-full bg-secondary">
      <SliderPrimitive.Range className="absolute w-full bg-primary" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
));
VerticalSlider.displayName = "VerticalSlider";
