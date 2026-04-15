import { Handle, Position } from "reactflow";

interface StereoHandleProps {
  type: "source" | "target";
  position: Position;
  /** Base CSS class for handle color — defaults to primary */
  className?: string;
}

/**
 * Renders a pair of L/R handles with labels.
 * Source handles go on the right, target handles on the left.
 */
const StereoHandles = ({
  type,
  position,
  className = "!bg-primary",
}: StereoHandleProps) => {
  const prefix = type === "source" ? "out" : "in";

  return (
    <>
      <Handle
        id={`${prefix}-L`}
        type={type}
        position={position}
        style={{ top: "40%" }}
        className={`!w-3 !h-3 !border-2 !border-background ${className}`}
      />
      <Handle
        id={`${prefix}-R`}
        type={type}
        position={position}
        style={{ top: "60%" }}
        className={`!w-3 !h-3 !border-2 !border-background ${className}`}
      />
      {/* L / R labels */}
      <span
        className="absolute text-[8px] font-bold text-muted-foreground pointer-events-none select-none"
        style={{
          [position === Position.Left ? "left" : "right"]: -2,
          top: "calc(40% - 10px)",
          transform: position === Position.Left ? "translateX(-100%)" : "translateX(100%)",
        }}
      >
        L
      </span>
      <span
        className="absolute text-[8px] font-bold text-muted-foreground pointer-events-none select-none"
        style={{
          [position === Position.Left ? "left" : "right"]: -2,
          top: "calc(60% - 10px)",
          transform: position === Position.Left ? "translateX(-100%)" : "translateX(100%)",
        }}
      >
        R
      </span>
    </>
  );
};

export default StereoHandles;
