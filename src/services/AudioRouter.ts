import { Edge, Node } from "reactflow";
import { audioGraphManager } from "./AudioGraphManager";
import { getDescriptor } from "@/modules/registry";

/**
 * Centralized audio routing service.
 * Uses smart diffing — only adds/removes connections that actually changed.
 * Reads from the module registry so it never needs module-specific code.
 */
export class AudioRouter {
  private previousEdgeKeys = new Set<string>();

  routeAudio(nodes: Node[], edges: Edge[]): void {
    const currentKeys = audioGraphManager.getCurrentConnectionKeys(edges);

    const toRemove = new Set([...this.previousEdgeKeys].filter((k) => !currentKeys.has(k)));
    const toAdd = new Set([...currentKeys].filter((k) => !this.previousEdgeKeys.has(k)));

    // Always re-evaluate mixer/multi-input channel activation. This covers:
    //   - existing connections from a prior session (hot-reload, zombie
    //     recovery) where `previousEdgeKeys` already includes everything and
    //     the diff is empty, so setChannelActive would never run otherwise
    //   - modules whose inputHandles list changes at runtime
    // The call itself is idempotent — each setChannelActive() is a no-op
    // when the requested state matches the current one.
    this.updateMixerChannels(nodes, edges);

    if (toRemove.size === 0 && toAdd.size === 0) {
      // Topology unchanged — still forward data, but skip the connect/disconnect churn
      this.forwardData(nodes, edges);
      return;
    }

    // Disconnect removed edges
    for (const key of toRemove) {
      const [source, targetWithHandle] = key.split("->");
      const [target, handle] = targetWithHandle.split(":");
      const sourceModule = audioGraphManager.getModule(source);
      if (sourceModule) {
        sourceModule.disconnect();
        audioGraphManager.removeConnection(source, target, handle);
      }
    }

    // Connect new edges
    for (const key of toAdd) {
      const [source, targetWithHandle] = key.split("->");
      const [target, handle] = targetWithHandle.split(":");
      const edge = edges.find(
        (e) =>
          e.source === source &&
          e.target === target &&
          (handle ? e.targetHandle === handle : true),
      );
      if (edge) {
        this.connectModules(nodes, edge);
      }
    }

    this.previousEdgeKeys = currentKeys;

    // Forward data from data-producing modules to data-consuming modules
    this.forwardData(nodes, edges);
  }

  /**
   * For every edge where the source module has getDataOutput() and the
   * target module has onDataInput(), push the data through.
   * Returns an array of {nodeId, updates} for the caller to merge into React state.
   */
  forwardData(_nodes: Node[], edges: Edge[]): Array<{ nodeId: string; updates: Record<string, any> }> {
    const result: Array<{ nodeId: string; updates: Record<string, any> }> = [];
    // Dedupe per (source, target, handle) so each distinct data edge fires once
    const seen = new Set<string>();

    for (const edge of edges) {
      const handleKey = edge.targetHandle ?? "__default";
      const pairKey = `${edge.source}->${edge.target}:${handleKey}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const srcModule = audioGraphManager.getModule(edge.source);
      const tgtModule = audioGraphManager.getModule(edge.target);
      if (!srcModule || !tgtModule) continue;

      const fullData = srcModule.getDataOutput();
      if (!fullData) continue;

      // Always forward the FULL dataset to consumers. Consumers that want
      // to auto-select a single field (e.g. translators) can use the
      // `sourceHandle` argument below — the handle id encodes which field
      // was patched. This keeps the drum machine's field dropdown populated
      // with every available field regardless of which source handle was used.
      tgtModule.onDataInput(fullData, edge.targetHandle ?? undefined, edge.sourceHandle ?? undefined);
      result.push({
        nodeId: edge.target,
        updates: {
          dataValues: { ...fullData },
          tracks: (tgtModule as any).getTracks
            ? JSON.parse(JSON.stringify((tgtModule as any).getTracks()))
            : undefined,
        },
      });
    }
    return result;
  }

  /**
   * For any node whose descriptor defines `inputHandles`,
   * look up mixer-style channel inputs and activate/deactivate them.
   */
  private updateMixerChannels(nodes: Node[], edges: Edge[]): void {
    // Build a map: nodeId → set of connected channel indices
    const channelInputs = new Map<string, Set<number>>();

    for (const edge of edges) {
      const targetNode = nodes.find((n) => n.id === edge.target);
      if (!targetNode) continue;

      const desc = getDescriptor(targetNode.data.type);
      if (!desc?.inputHandles) continue; // only process multi-input modules

      if (!channelInputs.has(edge.target)) {
        channelInputs.set(edge.target, new Set());
      }
      const channelIndex = this.resolveChannelIndex(targetNode, edge.targetHandle);
      if (channelIndex >= 0) {
        channelInputs.get(edge.target)!.add(channelIndex);
      }
    }

    // Tell each multi-input module which channels are active
    for (const node of nodes) {
      const desc = getDescriptor(node.data.type);
      if (!desc?.inputHandles) continue;

      const module = audioGraphManager.getModule(node.id);
      if (!module || typeof (module as any).setChannelActive !== "function") continue;

      const mixer = module as any;
      const activeChannels = channelInputs.get(node.id) ?? new Set<number>();
      const numChannels = typeof mixer.getChannelCount === "function" ? mixer.getChannelCount() : 0;

      for (let i = 0; i < numChannels; i++) {
        mixer.setChannelActive(i, activeChannels.has(i));
      }
    }
  }

  private connectModules(nodes: Node[], edge: Edge): void {
    const sourceModule = audioGraphManager.getModule(edge.source);
    const targetModule = audioGraphManager.getModule(edge.target);
    if (!sourceModule || !targetModule) return;

    if (audioGraphManager.hasConnection(edge.source, edge.target, edge.targetHandle ?? undefined)) {
      return;
    }

    const targetNode = nodes.find((n) => n.id === edge.target);
    if (!targetNode) return;

    const desc = getDescriptor(targetNode.data.type);

    // If the target has named input handles (mixer channels), connect to the specific channel
    if (desc?.inputHandles && typeof (targetModule as any).getChannelInput === "function") {
      const channelIndex = this.resolveChannelIndex(targetNode, edge.targetHandle);
      if (channelIndex >= 0) {
        const channelInput = (targetModule as any).getChannelInput(channelIndex);
        if (channelInput) {
          sourceModule.connect(channelInput);
          audioGraphManager.addConnection(edge.source, edge.target, edge.targetHandle ?? undefined);
        }
      }
    } else {
      sourceModule.connect(targetModule);
      audioGraphManager.addConnection(edge.source, edge.target);
    }
  }

  /**
   * Resolve a target handle id to its integer channel index.
   *
   * Supports two handle-naming styles:
   *   - numeric: "in-0", "in-3"          → 0, 3   (mixer, drum machine)
   *   - named:   "in-volume", "in-pitch" → looked up by position in the
   *              module's inputHandles() descriptor list (translators)
   *
   * Returns -1 if the handle can't be resolved.
   */
  private resolveChannelIndex(node: Node, handle: string | null | undefined): number {
    if (!handle) return 0;

    // Numeric handle id: "in-3" or legacy "input-3" → 3
    const numMatch = handle.match(/^(?:in|input)-(\d+)$/);
    if (numMatch) return parseInt(numMatch[1], 10);

    const desc = getDescriptor(node.data.type);
    if (desc?.inputHandles) {
      const handles = desc.inputHandles(node.data);
      const idx = handles.findIndex((h) => h.id === handle);
      if (idx >= 0) return idx;
    }
    return -1;
  }

  // ── Chain helpers ────────────────────────────────────────────────────

  getUpstreamSources(nodeId: string, nodes: Node[], edges: Edge[], visited = new Set<string>()): Node[] {
    if (visited.has(nodeId)) return [];
    visited.add(nodeId);

    const directSources = edges
      .filter((e) => e.target === nodeId)
      .map((e) => nodes.find((n) => n.id === e.source))
      .filter(Boolean) as Node[];

    const all = [...directSources];
    for (const src of directSources) {
      all.push(...this.getUpstreamSources(src.id, nodes, edges, visited));
    }
    return all;
  }

  startModuleChain(nodeId: string, nodes: Node[], edges: Edge[]): void {
    const sources = this.getUpstreamSources(nodeId, nodes, edges);
    for (const src of sources) {
      audioGraphManager.getModule(src.id)?.start();
    }
  }

  stopModuleChain(nodeId: string, nodes: Node[], edges: Edge[]): void {
    const sources = this.getUpstreamSources(nodeId, nodes, edges);
    for (const src of sources) {
      audioGraphManager.getModule(src.id)?.stop();
    }
  }
}

export const audioRouter = new AudioRouter();
