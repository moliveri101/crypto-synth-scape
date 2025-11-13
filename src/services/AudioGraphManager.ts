import { AudioModule } from "@/audio/AudioModule";
import { Edge } from "reactflow";

/**
 * Centralized audio graph manager
 * Stores all audio modules outside React state to prevent unnecessary re-routing
 */
export class AudioGraphManager {
  private modules: Map<string, AudioModule> = new Map();
  private connections: Map<string, Set<string>> = new Map();

  /**
   * Register an audio module
   */
  registerModule(nodeId: string, module: AudioModule) {
    this.modules.set(nodeId, module);
    console.log(`AudioGraphManager: Registered module ${nodeId}`);
  }

  /**
   * Unregister and dispose an audio module
   */
  unregisterModule(nodeId: string) {
    const module = this.modules.get(nodeId);
    if (module) {
      module.dispose();
      this.modules.delete(nodeId);
      this.connections.delete(nodeId);
      console.log(`AudioGraphManager: Unregistered module ${nodeId}`);
    }
  }

  /**
   * Get a module by node ID
   */
  getModule(nodeId: string): AudioModule | undefined {
    return this.modules.get(nodeId);
  }

  /**
   * Get all modules
   */
  getAllModules(): Map<string, AudioModule> {
    return this.modules;
  }

  /**
   * Check if connection already exists
   */
  hasConnection(sourceId: string, targetId: string, targetHandle?: string): boolean {
    const key = targetHandle ? `${sourceId}->${targetId}:${targetHandle}` : `${sourceId}->${targetId}`;
    const sourceConnections = this.connections.get(sourceId);
    return sourceConnections ? sourceConnections.has(key) : false;
  }

  /**
   * Track a new connection
   */
  addConnection(sourceId: string, targetId: string, targetHandle?: string) {
    const key = targetHandle ? `${sourceId}->${targetId}:${targetHandle}` : `${sourceId}->${targetId}`;
    if (!this.connections.has(sourceId)) {
      this.connections.set(sourceId, new Set());
    }
    this.connections.get(sourceId)!.add(key);
  }

  /**
   * Remove connection tracking
   */
  removeConnection(sourceId: string, targetId: string, targetHandle?: string) {
    const key = targetHandle ? `${sourceId}->${targetId}:${targetHandle}` : `${sourceId}->${targetId}`;
    const sourceConnections = this.connections.get(sourceId);
    if (sourceConnections) {
      sourceConnections.delete(key);
    }
  }

  /**
   * Get all current connection keys
   */
  getCurrentConnectionKeys(edges: Edge[]): Set<string> {
    const keys = new Set<string>();
    edges.forEach(edge => {
      const key = edge.targetHandle 
        ? `${edge.source}->${edge.target}:${edge.targetHandle}` 
        : `${edge.source}->${edge.target}`;
      keys.add(key);
    });
    return keys;
  }

  /**
   * Clear all connections tracking
   */
  clearConnections() {
    this.connections.clear();
  }

  /**
   * Dispose all modules and clear
   */
  dispose() {
    this.modules.forEach(module => module.dispose());
    this.modules.clear();
    this.connections.clear();
    console.log('AudioGraphManager: Disposed all modules');
  }
}

export const audioGraphManager = new AudioGraphManager();
