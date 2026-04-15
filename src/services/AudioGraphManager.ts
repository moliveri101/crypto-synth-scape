import { AudioModule } from "@/modules/base/AudioModule";
import { Edge } from "reactflow";

/**
 * Centralized audio graph manager (singleton).
 * Stores all audio modules outside React state to prevent
 * unnecessary re-creation on renders.
 */
export class AudioGraphManager {
  private modules = new Map<string, AudioModule>();
  private connections = new Map<string, Set<string>>();

  registerModule(nodeId: string, module: AudioModule): void {
    this.modules.set(nodeId, module);
  }

  unregisterModule(nodeId: string): void {
    const module = this.modules.get(nodeId);
    if (module) {
      module.dispose();
      this.modules.delete(nodeId);
      this.connections.delete(nodeId);
    }
  }

  dispose(): void {
    this.modules.forEach((m) => m.dispose());
    this.modules.clear();
    this.connections.clear();
  }

  getModule(nodeId: string): AudioModule | undefined {
    return this.modules.get(nodeId);
  }

  getAllModules(): Map<string, AudioModule> {
    return this.modules;
  }

  // ── Connection tracking ────────────────────────────────────────────────

  private connectionKey(sourceId: string, targetId: string, targetHandle?: string): string {
    return targetHandle
      ? `${sourceId}->${targetId}:${targetHandle}`
      : `${sourceId}->${targetId}`;
  }

  hasConnection(sourceId: string, targetId: string, targetHandle?: string): boolean {
    const key = this.connectionKey(sourceId, targetId, targetHandle);
    return this.connections.get(sourceId)?.has(key) ?? false;
  }

  addConnection(sourceId: string, targetId: string, targetHandle?: string): void {
    const key = this.connectionKey(sourceId, targetId, targetHandle);
    if (!this.connections.has(sourceId)) {
      this.connections.set(sourceId, new Set());
    }
    this.connections.get(sourceId)!.add(key);
  }

  removeConnection(sourceId: string, targetId: string, targetHandle?: string): void {
    const key = this.connectionKey(sourceId, targetId, targetHandle);
    this.connections.get(sourceId)?.delete(key);
  }

  getCurrentConnectionKeys(edges: Edge[]): Set<string> {
    const keys = new Set<string>();
    for (const edge of edges) {
      keys.add(
        edge.targetHandle
          ? `${edge.source}->${edge.target}:${edge.targetHandle}`
          : `${edge.source}->${edge.target}`,
      );
    }
    return keys;
  }

  clearConnections(): void {
    this.connections.clear();
  }

  dispose(): void {
    this.modules.forEach((m) => m.dispose());
    this.modules.clear();
    this.connections.clear();
  }
}

export const audioGraphManager = new AudioGraphManager();
