import { Button } from "@/components/ui/button";
import { X, ChevronDown, ChevronUp } from "lucide-react";

interface ModuleHeaderProps {
  id: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  collapsed: boolean;
  onToggleCollapse: (id: string) => void;
  onRemove: (id: string) => void;
  children?: React.ReactNode; // extra header-row content (badges, indicators)
}

const ModuleHeader = ({
  id,
  title,
  subtitle,
  icon,
  collapsed,
  onToggleCollapse,
  onRemove,
  children,
}: ModuleHeaderProps) => (
  <div className="flex items-start justify-between">
    <div className="flex items-center gap-2 flex-1 min-w-0">
      {icon}
      <div className="min-w-0 flex-1">
        <h3 className="font-bold text-sm text-foreground truncate">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
    <div className="flex gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 hover:bg-accent"
        onClick={() => onToggleCollapse(id)}
        aria-label={collapsed ? "Expand module" : "Collapse module"}
      >
        {collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
        onClick={() => onRemove(id)}
        aria-label="Remove module"
      >
        <X className="w-3 h-3" />
      </Button>
    </div>
  </div>
);

export default ModuleHeader;
