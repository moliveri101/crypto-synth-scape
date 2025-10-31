import { Edge } from "reactflow";
import { AudioModule } from "@/audio/AudioModule";
import { MixerModule } from "@/audio/modules/MixerModule";

/**
 * Centralized audio routing service
 * Handles all audio module connections and disconnections
 */
export class AudioRouter {
  private connections: Set<string> = new Set();

  /**
   * Rebuild all audio connections based on current edges
   */
  routeAudio(nodes: any[], edges: Edge[]) {
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
        const module = node.data.audioModule as MixerModule;
        if (module) {
          const activeChannels = mixerChannelInputs[node.id] || new Set();
          for (let i = 0; i < module.getChannelCount(); i++) {
            module.setChannelActive(i, activeChannels.has(i));
          }
        }
      }
    });

    // Disconnect all existing connections
    nodes.forEach(node => {
      const module = node.data.audioModule as AudioModule;
      if (module) {
        module.disconnect();
      }
    });

    // Rebuild connections
    edges.forEach(edge => {
      this.connectModules(nodes, edge);
    });

    console.log(`AudioRouter: Routed ${edges.length} connections`);
  }

  /**
   * Connect two modules based on an edge
   */
  private connectModules(nodes: any[], edge: Edge) {
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);

    if (!sourceNode || !targetNode) return;

    const sourceModule = sourceNode.data.audioModule as AudioModule;
    const targetModule = targetNode.data.audioModule;

    if (!sourceModule || !targetModule) return;

    // Handle mixer channel connections
    if (targetNode.data.type && targetNode.data.type.startsWith("mixer-")) {
      const mixerModule = targetModule as MixerModule;
      const channelIndex = edge.targetHandle ? parseInt(edge.targetHandle.split("-")[1]) : 0;
      const channelInput = mixerModule.getChannelInput(channelIndex);
      if (channelInput) {
        sourceModule.connect(channelInput);
        console.log(`Connected ${edge.source} to ${edge.target} channel ${channelIndex}`);
      }
    } else {
      // Standard connection
      sourceModule.connect(targetModule);
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
      if (sourceNode?.data.audioModule) {
        const module = sourceNode.data.audioModule as AudioModule;
        module.start();
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
      if (sourceNode?.data.audioModule) {
        const module = sourceNode.data.audioModule as AudioModule;
        module.stop();
      }
    });
  }
}

export const audioRouter = new AudioRouter();
