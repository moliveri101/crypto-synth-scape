import { Node, Edge } from "reactflow";

// localStorage key under which all saved layouts live as a single JSON blob.
const STORAGE_KEY = "crypto-synth:layouts";
// Schema version — bump when we change the storage format in a way that
// requires migration. For now v1 is just {nodes, edges, savedAt}.
const SCHEMA_VERSION = 1;

export interface SavedLayout {
  version: number;
  nodes: Node[];
  edges: Edge[];
  savedAt: number; // epoch ms
}

type AllLayouts = Record<string, SavedLayout>;

/**
 * Read the full layouts blob from localStorage.
 * Returns an empty object if nothing saved or parsing fails.
 */
function readAll(): AllLayouts {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as AllLayouts;
  } catch {
    return {};
  }
}

function writeAll(all: AllLayouts): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (err) {
    console.error("[LayoutStore] failed to write", err);
  }
}

/** Save the current canvas state under a named slot. Overwrites. */
export function saveLayout(name: string, nodes: Node[], edges: Edge[]): void {
  if (!name.trim()) return;
  const all = readAll();
  all[name] = {
    version: SCHEMA_VERSION,
    // Deep-clone via JSON roundtrip to drop any un-serializable fields (like
    // functions) that ReactFlow might store on nodes.
    nodes: JSON.parse(JSON.stringify(nodes)),
    edges: JSON.parse(JSON.stringify(edges)),
    savedAt: Date.now(),
  };
  writeAll(all);
}

/** Retrieve a saved layout by name. Returns null if not found. */
export function loadLayout(name: string): SavedLayout | null {
  const all = readAll();
  return all[name] ?? null;
}

/** Delete a saved layout by name. */
export function deleteLayout(name: string): void {
  const all = readAll();
  delete all[name];
  writeAll(all);
}

/** List all saved layout names + their save timestamps, newest first. */
export function listLayouts(): Array<{ name: string; savedAt: number }> {
  const all = readAll();
  return Object.entries(all)
    .map(([name, data]) => ({ name, savedAt: data.savedAt ?? 0 }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

/** Export the current canvas state as a JSON string (for download). */
export function exportLayoutString(nodes: Node[], edges: Edge[]): string {
  return JSON.stringify({
    version: SCHEMA_VERSION,
    nodes,
    edges,
    savedAt: Date.now(),
  }, null, 2);
}

/** Parse a JSON string back into a SavedLayout. Throws on bad input. */
export function importLayoutString(jsonStr: string): SavedLayout {
  const parsed = JSON.parse(jsonStr);
  if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error("Invalid layout file — missing nodes or edges");
  }
  return parsed as SavedLayout;
}
