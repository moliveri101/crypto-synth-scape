import { Handle, Position, NodeProps } from "reactflow";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { VisualizerModuleData } from "@/types/modules";
import { Badge } from "@/components/ui/badge";

const VisualizerModuleNode = ({
  data,
  id,
  isConnectable,
}: NodeProps<VisualizerModuleData> & {
  id: string;
  isConnectable: boolean;
  data: VisualizerModuleData & {
    onRemove: (id: string) => void;
    onUpdate: (id: string, data: Partial<VisualizerModuleData>) => void;
  };
}) => {
  const handleCollapse = () => {
    data.onUpdate(id, { collapsed: !data.collapsed });
  };

  return (
    <Card className="min-w-[280px] bg-gradient-to-br from-purple-900/90 to-pink-900/90 border-purple-500">
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="w-3 h-3 bg-purple-500"
      />

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-purple-400" />
            <h3 className="font-semibold text-white">Mandelbrot Visualizer</h3>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => data.onRemove(id)}
              className="h-6 w-6 p-0 text-white hover:bg-purple-800"
            >
              <X className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCollapse}
              className="h-6 w-6 p-0 text-white hover:bg-purple-800"
            >
              {data.collapsed ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {!data.collapsed && (
          <div className="space-y-2">
            <Badge variant={data.isActive ? "default" : "secondary"} className="w-full justify-center">
              {data.isActive ? "Background Active" : "Not Connected"}
            </Badge>
            <p className="text-xs text-purple-200 text-center">
              Connect to mixer output to activate psychedelic background
            </p>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className="w-3 h-3 bg-purple-500"
      />
    </Card>
  );
};

export default VisualizerModuleNode;
