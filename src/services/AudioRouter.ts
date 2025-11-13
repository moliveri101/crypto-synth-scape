import { Edge } from "reactflow";
import { AudioModule } from "@/audio/AudioModule";
import { MixerModule } from "@/audio/modules/MixerModule";
import { audioGraphManager } from "./AudioGraphManager";

/**
 * Centralized audio routing service
 * Handles all audio module connections and disconnections
 * Uses smart diffing to only update changed connections
 */
export class AudioRouter {
  private previousEdgeKeys: Set<string> = new Set();

  /**
   * Smart audio routing - only updates changed connections
   */
  routeAudio(nodes: any[], edges: Edge[]) {
    // Get current connection keys
    const currentKeys = audioGraphManager.getCurrentConnectionKeys(edges);
    
    // Find connections to remove (in previous but not in current)
    const toRemove = new Set([...this.previousEdgeKeys].filter(key => !currentKeys.has(key)));
    
    // Find connections to add (in current but not in previous)
    const toAdd = new Set([...currentKeys].filter(key => !this.previousEdgeKeys.has(key)));

    // Only proceed if there are actual changes
    if (toRemove.size === 0 && toAdd.size === 0) {
      return;
    }

    console.log(`AudioRouter: Removing ${toRemove.size}, Adding ${toAdd.size} connections`);

    // Disconnect removed connections
    toRemove.forEach(key => {
      const [source, targetWithHandle] = key.split('->');
      const [target, handle] = targetWithHandle.split(':');
      const sourceModule = audioGraphManager.getModule(source);
      if (sourceModule) {
        sourceModule.disconnect();
        audioGraphManager.removeConnection(source, target, handle);
      }
    });

    // Track mixer channel inputs
    const mixerChannelInputs: { [key: string]: Set<number> } = {};

    edges.forEach(edge => {
      const targetNode = nodes.find(n => n.id === edge.target);
      if (targetNode && targetNode.data.type && targetNode.data.type.startsWith("mixer-")) {
        const channelIndex = edge.targetHandle ? parseInt(edge.targetHandle.split("-")[1]) : 0;
        if (!mixerChannelInputs[edge.target]) {
          mixerChannelInputs[edge.target] = new Set();
        }
        mixerChannelInputs[edge.target].add(channelIndex);
      }
    });

    // Update mixer channel active states
    nodes.forEach(node => {
      if (node.data.type && node.data.type.startsWith("mixer-")) {
        const module = audioGraphManager.getModule(node.id) as MixerModule;
        if (module) {
          const activeChannels = mixerChannelInputs[node.id] || new Set();
          for (let i = 0; i < module.getChannelCount(); i++) {
            module.setChannelActive(i, activeChannels.has(i));
          }
        }
      }
    });

    // Add new connections
    toAdd.forEach(key => {
      const [source, targetWithHandle] = key.split('->');
      const [target, handle] = targetWithHandle.split(':');
      const edge = edges.find(e => 
        e.source === source && 
        e.target === target && 
        (handle ? e.targetHandle === handle : true)
      );
      if (edge) {
        this.connectModules(nodes, edge);
      }
    });

    // Update previous edge keys
    this.previousEdgeKeys = currentKeys;
  }

  /**
   * Connect two modules based on an edge
   */
  private connectModules(nodes: any[], edge: Edge) {
    const sourceModule = audioGraphManager.getModule(edge.source);
    const targetModule = audioGraphManager.getModule(edge.target);

    if (!sourceModule || !targetModule) {
      console.warn(`Cannot connect: module not found (${edge.source} -> ${edge.target})`);
      return;
    }

    // Check if already connected
    if (audioGraphManager.hasConnection(edge.source, edge.target, edge.targetHandle || undefined)) {
      return;
    }

    const targetNode = nodes.find(n => n.id === edge.target);
    if (!targetNode) return;

    // Handle mixer channel connections
    if (targetNode.data.type && targetNode.data.type.startsWith("mixer-")) {
      const mixerModule = targetModule as MixerModule;
      const channelIndex = edge.targetHandle ? parseInt(edge.targetHandle.split("-")[1]) : 0;
      const channelInput = mixerModule.getChannelInput(channelIndex);
      if (channelInput) {
        sourceModule.connect(channelInput);
        audioGraphManager.addConnection(edge.source, edge.target, edge.targetHandle || undefined);
        console.log(`Connected ${edge.source} to ${edge.target} channel ${channelIndex}`);
      }
    } else {
      // Standard connection
      sourceModule.connect(targetModule);
      audioGraphManager.addConnection(edge.source, edge.target);
      console.log(`Connected ${edge.source} to ${edge.target}`);
    }
  }

  /**
   * Get all upstream source nodes recursively
   */
  getUpstreamSources(nodeId: string, nodes: any[], edges: Edge[], visited = new Set<string>()): any[] {
    if (visited.has(nodeId)) return [];
    visited.add(nodeId);

    const directSources = edges
      .filter((e) => e.target === nodeId)
      .map((e) => nodes.find((n) => n.id === e.source))
      .filter(Boolean);

    const allSources = [...directSources];
    directSources.forEach((source) => {
      if (source) {
        allSources.push(...this.getUpstreamSources(source.id, nodes, edges, visited));
      }
    });

    return allSources;
  }

  /**
   * Start a module and all its upstream sources
   */
  startModuleChain(nodeId: string, nodes: any[], edges: Edge[]) {
    const allSources = this.getUpstreamSources(nodeId, nodes, edges);
    console.log('Starting module chain:', nodeId, allSources.map(s => s?.id));

    allSources.forEach((sourceNode) => {
      if (sourceNode?.id) {
        const module = audioGraphManager.getModule(sourceNode.id);
        if (module) {
          module.start();
        }
      }
    });
  }

  /**
   * Stop a module and all its upstream sources
   */
  stopModuleChain(nodeId: string, nodes: any[], edges: Edge[]) {
    const allSources = this.getUpstreamSources(nodeId, nodes, edges);
    console.log('Stopping module chain:', nodeId, allSources.map(s => s?.id));

    allSources.forEach((sourceNode) => {
      if (sourceNode?.id) {
        const module = audioGraphManager.getModule(sourceNode.id);
        if (module) {
          module.stop();
        }
      }
    });
  }
}

export const audioRouter = new AudioRouter();
