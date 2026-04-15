import { useCallback } from "react";
import { Node, Edge } from "reactflow";
import { audioContextManager } from "@/audio/AudioContextManager";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { audioRouter } from "@/services/AudioRouter";
import { getDescriptor } from "@/modules/registry";

/**
 * Generic module manager hook.
 * Reads from the module registry — zero module-specific code.
 */
export const useModuleManager = (
  nodes: Node[],
  edges: Edge[],
  setNodes: (updater: Node[] | ((prev: Node[]) => Node[])) => void,
  setEdges: (updater: Edge[] | ((prev: Edge[]) => Edge[])) => void,
) => {
  /**
   * Add any module by type. Extra data is merged into the node data.
   * The descriptor's createAudio + defaultData handle everything.
   */
  const addModule = useCallback(
    (type: string, extraData?: Record<string, any>) => {
      const desc = getDescriptor(type);
      if (!desc) {
        return { success: false, message: `Unknown module type: ${type}` };
      }

      // Generate a stable id — include a suffix for uniqueness
      const idBase = extraData?.id ?? type;
      const id = `${type}-${idBase}-${Date.now()}`;

      // Prevent duplicate crypto/satellite modules by checking the source id
      if (extraData?.id) {
        const existing = nodes.find(
          (n) => n.data.type === type && n.data[type]?.id === extraData.id,
        );
        if (existing) {
          return { success: false, message: `${desc.label} module already on canvas` };
        }
      }

      const ctx = audioContextManager.getContext();
      const data = desc.defaultData(extraData);
      const audioModule = desc.createAudio(ctx, data);

      audioGraphManager.registerModule(id, audioModule);

      // Always drop new nodes in the top-left so the user sees them immediately.
      // A tiny per-add stagger keeps successive adds from stacking pixel-perfect.
      const stagger = (nodes.length % 8) * 24;

      const newNode: Node = {
        id,
        type: desc.type,
        position: { x: 40 + stagger, y: 40 + stagger },
        data: { ...data, type: desc.type, collapsed: false, isPlaying: false },
      };

      setNodes((prev) => [...prev, newNode]);
      return { success: true, message: `${desc.label} added to canvas` };
    },
    [nodes, setNodes],
  );

  /**
   * Remove a module (dispose audio + remove node + remove edges).
   */
  const removeModule = useCallback(
    (id: string) => {
      audioGraphManager.unregisterModule(id);
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    },
    [setNodes, setEdges],
  );

  /**
   * Start a module's audio playback.
   */
  const startModule = useCallback(
    (id: string) => {
      audioContextManager.resume();
      audioGraphManager.getModule(id)?.start();
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, isPlaying: true } } : n,
        ),
      );
    },
    [setNodes],
  );

  const stopModule = useCallback(
    (id: string) => {
      audioGraphManager.getModule(id)?.stop();
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, isPlaying: false } } : n,
        ),
      );
    },
    [setNodes],
  );

  /**
   * Update a single parameter on an audio module + React state.
   */
  const updateParameter = useCallback(
    (id: string, param: string, value: any) => {
      // Push to audio engine
      const module = audioGraphManager.getModule(id);
      module?.setParameter(param, value);

      // Push to React state
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;

          const desc = getDescriptor(n.data.type);

          // Nested track updates — read back the authoritative tracks array
          // from the audio module (which may have regenerated patterns).
          if (param === "trackStep" || param === "trackConfig" || param === "tracks") {
            const getTracks = (module as any)?.getTracks;
            const tracks = typeof getTracks === "function"
              ? JSON.parse(JSON.stringify(getTracks.call(module)))
              : n.data.tracks;
            return { ...n, data: { ...n.data, tracks } };
          }

          // Effect modules store custom params in a nested `parameters` map
          if (
            desc?.category === "effect" &&
            param !== "intensity" &&
            param !== "mix" &&
            param !== "isActive"
          ) {
            return {
              ...n,
              data: {
                ...n.data,
                parameters: { ...n.data.parameters, [param]: value },
              },
            };
          }

          return { ...n, data: { ...n.data, [param]: value } };
        }),
      );
    },
    [setNodes],
  );

  /**
   * Toggle collapse state.
   */
  const toggleCollapse = useCallback(
    (id: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, collapsed: !n.data.collapsed } } : n,
        ),
      );
    },
    [setNodes],
  );

  /**
   * Generic action dispatcher — delegates to the audio module's handleAction().
   * Merges any returned data updates into the React node.
   */
  const sendAction = useCallback(
    async (id: string, action: string, payload?: any) => {
      audioContextManager.resume();
      const module = audioGraphManager.getModule(id);
      if (!module) return;

      const updates = await Promise.resolve(module.handleAction(action, payload));

      if (updates && typeof updates === "object") {
        setNodes((nds) =>
          nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...updates } } : n)),
        );
      }
    },
    [setNodes],
  );

  return {
    addModule,
    removeModule,
    startModule,
    stopModule,
    updateParameter,
    toggleCollapse,
    sendAction,
  };
};
