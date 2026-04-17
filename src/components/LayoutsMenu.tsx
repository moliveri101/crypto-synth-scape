import { useEffect, useRef, useState } from "react";
import { Node, Edge } from "reactflow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Trash2, Save, Upload, Download, FolderOpen, Plus, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  saveLayout, loadLayout, deleteLayout, listLayouts,
  exportLayoutString, importLayoutString,
} from "@/services/LayoutStore";
import { PRESET_LAYOUTS, type PresetLayout } from "@/services/PresetLayouts";

interface LayoutsMenuProps {
  /** Current canvas nodes — captured when the user saves. */
  getNodes: () => Node[];
  /** Current canvas edges — captured when the user saves. */
  getEdges: () => Edge[];
  /** Called after "Load" or "Import" resolves. Replaces the canvas. */
  onLoad: (nodes: Node[], edges: Edge[]) => void;
  /** Called when the user clicks "New (clear canvas)". */
  onClear: () => void;
}

function formatAgo(ts: number): string {
  const delta = Date.now() - ts;
  const sec = Math.round(delta / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export const LayoutsMenu = ({ getNodes, getEdges, onLoad, onClear }: LayoutsMenuProps) => {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [layouts, setLayouts] = useState<Array<{ name: string; savedAt: number }>>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  // Re-read the layouts list whenever the popover opens
  useEffect(() => {
    if (open) setLayouts(listLayouts());
  }, [open]);

  const refresh = () => setLayouts(listLayouts());

  const handleSave = () => {
    const name = newName.trim();
    if (!name) {
      toast({ title: "Name required", description: "Give the layout a name first", variant: "destructive" });
      return;
    }
    saveLayout(name, getNodes(), getEdges());
    setNewName("");
    refresh();
    toast({ title: "Layout saved", description: `"${name}" saved` });
  };

  const handleLoad = (name: string) => {
    const saved = loadLayout(name);
    if (!saved) {
      toast({ title: "Not found", description: `No layout named "${name}"`, variant: "destructive" });
      return;
    }
    onLoad(saved.nodes, saved.edges);
    setOpen(false);
    toast({ title: "Layout loaded", description: `"${name}" restored` });
  };

  const handleDelete = (name: string) => {
    if (!confirm(`Delete layout "${name}"?`)) return;
    deleteLayout(name);
    refresh();
  };

  const handleExport = () => {
    const json = exportLayoutString(getNodes(), getEdges());
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crypto-synth-layout-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const layout = importLayoutString(String(reader.result));
        onLoad(layout.nodes, layout.edges);
        setOpen(false);
        toast({ title: "Layout imported", description: file.name });
      } catch (err) {
        toast({ title: "Import failed", description: String(err), variant: "destructive" });
      }
    };
    reader.readAsText(file);
    // reset so the same file can be picked again later
    e.target.value = "";
  };

  const handleClear = () => {
    if (!confirm("Clear the canvas? All unsaved modules will be removed.")) return;
    onClear();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-8 text-xs font-medium rounded-none hover:bg-neutral-700 hover:text-neutral-100">
          <FolderOpen className="w-3.5 h-3.5 mr-1" />
          Layouts
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 bg-card border-border p-2 rounded-none" align="start">
        <div className="space-y-3">
          {/* Save current as... */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">
              Save current
            </div>
            <div className="flex gap-1">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                placeholder="Layout name..."
                className="h-8 text-xs rounded-none"
              />
              <Button size="sm" onClick={handleSave} className="h-8 rounded-none" title="Save">
                <Save className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Built-in presets — curated examples demonstrating how the
              modules fit together. Same load path as user-saved layouts. */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">
              <Sparkles className="w-3 h-3" />
              Presets ({PRESET_LAYOUTS.length})
            </div>
            <div className="max-h-64 overflow-y-auto space-y-0.5">
              {PRESET_LAYOUTS.map((p: PresetLayout) => (
                <button
                  key={p.id}
                  className="w-full text-left py-1.5 px-2 hover:bg-neutral-700/60 text-foreground group"
                  onClick={() => {
                    onLoad(p.nodes, p.edges);
                    setOpen(false);
                    toast({ title: "Preset loaded", description: p.name });
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium flex-1 truncate">{p.name}</span>
                    <span
                      className={
                        "text-[8px] font-bold uppercase tracking-wider shrink-0 " +
                        (p.difficulty === "Easy" ? "text-green-400"
                          : p.difficulty === "Medium" ? "text-yellow-400"
                          : "text-rose-400")
                      }
                    >
                      {p.difficulty}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    {p.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Saved layouts list */}
          <div className="space-y-1 border-t border-border pt-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">
              Saved ({layouts.length})
            </div>
            {layouts.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic px-1 py-2">
                No layouts saved yet.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-0.5">
                {layouts.map((l) => (
                  <div
                    key={l.name}
                    className="flex items-center gap-1 group hover:bg-neutral-700/40"
                  >
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 justify-start h-8 text-xs rounded-none hover:bg-neutral-700 hover:text-neutral-100"
                      onClick={() => handleLoad(l.name)}
                    >
                      <span className="truncate flex-1 text-left">{l.name}</span>
                      <span className="text-[9px] text-muted-foreground ml-2 shrink-0">
                        {formatAgo(l.savedAt)}
                      </span>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-none opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => handleDelete(l.name)}
                      title="Delete layout"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border pt-2 space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">
              File / Canvas
            </div>
            <div className="grid grid-cols-3 gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-[11px] rounded-none hover:bg-neutral-700 hover:text-neutral-100"
                onClick={handleExport}
                title="Download as .json"
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                Export
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-[11px] rounded-none hover:bg-neutral-700 hover:text-neutral-100"
                onClick={handleImportClick}
                title="Load from .json"
              >
                <Upload className="w-3.5 h-3.5 mr-1" />
                Import
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-[11px] rounded-none hover:bg-neutral-700 hover:text-neutral-100"
                onClick={handleClear}
                title="Clear canvas"
              >
                <Plus className="w-3.5 h-3.5 mr-1 rotate-45" />
                New
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              className="hidden"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
