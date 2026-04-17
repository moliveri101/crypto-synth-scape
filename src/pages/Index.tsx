import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactFlow, {
  Background,
  Controls,
  addEdge,
  Connection,
  Edge,
  Node,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  ConnectionMode,
} from "reactflow";
import "reactflow/dist/style.css";

import { audioContextManager } from "@/audio/AudioContextManager";
import { audioRouter } from "@/services/AudioRouter";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { useModuleManager } from "@/hooks/useModuleManager";
import { useLiveCryptoPrices } from "@/hooks/useLiveCryptoPrices";
import { useToast } from "@/hooks/use-toast";
import { CryptoData } from "@/types/crypto";

// Import the module registry + all module registrations
import { buildNodeTypes, getDescriptor } from "@/modules/registry";
import "@/modules"; // triggers all registerModule() calls

import ModuleToolbar from "@/components/ModuleToolbar";
import { LayoutsMenu } from "@/components/LayoutsMenu";
import InteractiveEdge from "@/components/modules/InteractiveEdge";
import { ModuleProvider } from "@/modules/base/ModuleContext";

const edgeTypes = { custom: InteractiveEdge };

const Index = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [livePricesEnabled, setLivePricesEnabled] = useState(false);
  const { toast } = useToast();

  // Build nodeTypes from the registry (stable reference)
  const nodeTypes = useMemo(() => buildNodeTypes(), []);

  // Generic module manager — no module-specific code
  const {
    addModule,
    removeModule,
    startModule,
    stopModule,
    updateParameter,
    toggleCollapse,
    sendAction,
    clearAll,
    loadLayout,
    refreshAudio,
  } = useModuleManager(nodes, edges, setNodes, setEdges);

  // ── Live crypto price polling ──────────────────────────────────────────

  const activeCryptoIds = nodes
    .filter((n) => n.data.type === "crypto")
    .map((n) => n.data.crypto?.id)
    .filter(Boolean);

  const handlePriceUpdate = useCallback(
    (updatedCryptos: CryptoData[]) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.data.type !== "crypto") return node;
          const updated = updatedCryptos.find((c) => c.id === node.data.crypto?.id);
          if (!updated) return node;

          // Push new price to the audio module
          const module = audioGraphManager.getModule(node.id);
          if (module && typeof (module as any).updateCrypto === "function") {
            (module as any).updateCrypto(updated);
          }

          return { ...node, data: { ...node.data, crypto: updated } };
        }),
      );

      // Forward updated data to any connected data consumers (drum machines, etc.)
      audioRouter.forwardData(nodes, edges);
    },
    [setNodes, nodes, edges],
  );

  useLiveCryptoPrices({
    cryptoIds: activeCryptoIds,
    onPriceUpdate: handlePriceUpdate,
    enabled: livePricesEnabled && activeCryptoIds.length > 0,
    intervalMs: 120000,
  });

  // ── Audio context lifecycle ────────────────────────────────────────────

  useEffect(() => {
    audioContextManager.initialize();
    return () => {
      audioGraphManager.dispose();
      audioContextManager.suspend();
    };
  }, []);

  // ── Zombie-node recovery ──────────────────────────────────────────────
  // During dev HMR, the Index effect cleanup disposes every audio module,
  // but ReactFlow keeps node objects in state. Those nodes end up without
  // a backing audio module — "zombies". On every render we rebuild any
  // missing modules from their descriptor + data so the scene recovers
  // automatically without the user having to remove and re-add nodes.
  useEffect(() => {
    const ctx = audioContextManager.getContext();
    let recovered = 0;
    for (const node of nodes) {
      if (audioGraphManager.getModule(node.id)) continue;
      const desc = getDescriptor(node.data.type);
      if (!desc) continue;
      try {
        const m = desc.createAudio(ctx, node.data);
        audioGraphManager.registerModule(node.id, m);
        recovered++;
      } catch (err) {
        console.error("[zombie recovery] failed to recreate", node.id, err);
      }
    }
    // Any newly-recreated module has no audio connections — its entries in
    // the router's edge cache and the graph manager's connection set are
    // stale. Invalidate both so the next routeAudio() fully reconnects.
    if (recovered > 0) {
      audioGraphManager.clearConnections();
      audioRouter.invalidate();
    }
  }, [nodes]);

  // ── Keep mixer input counts in sync (only when edges change) ───────────

  useEffect(() => {
    setNodes((nds) => {
      const mixerIds = new Set(
        nds
          .filter((n) => getDescriptor(n.data.type)?.inputHandles !== undefined)
          .map((n) => n.id),
      );
      if (mixerIds.size === 0) return nds;

      const counts: Record<string, number> = {};
      // Per-module set of voice indices currently connected. Handles may be
      // either numeric (`in-0`, `in-1` — mixers, drum machine) or named
      // (`in-note`, `in-volume` — translators). For named handles we look up
      // the position in the module's inputHandles() descriptor to get an index.
      const voicesByNode: Record<string, Set<number>> = {};
      for (const e of edges) {
        if (!mixerIds.has(e.target)) continue;
        counts[e.target] = (counts[e.target] || 0) + 1;
        const handle = e.targetHandle;
        if (!handle) continue;

        // Numeric handle: "in-3" or legacy "input-3" → index 3
        const numMatch = handle.match(/^(?:in|input)-(\d+)$/);
        if (numMatch) {
          (voicesByNode[e.target] ??= new Set()).add(parseInt(numMatch[1], 10));
          continue;
        }

        // Named handle: look up its position in the descriptor's handle list
        const targetNode = nds.find((n) => n.id === e.target);
        const desc = targetNode ? getDescriptor(targetNode.data.type) : undefined;
        if (desc?.inputHandles) {
          const handles = desc.inputHandles(targetNode!.data);
          const idx = handles.findIndex((h) => h.id === handle);
          if (idx >= 0) (voicesByNode[e.target] ??= new Set()).add(idx);
        }
      }

      let changed = false;
      const next = nds.map((n) => {
        if (!mixerIds.has(n.id)) return n;
        const newCount = counts[n.id] || 0;
        const newVoices = [...(voicesByNode[n.id] ?? [])].sort((a, b) => a - b);
        const prevVoices: number[] = n.data.connectedVoices ?? [];
        const voicesChanged =
          prevVoices.length !== newVoices.length ||
          prevVoices.some((v, i) => v !== newVoices[i]);
        if (n.data.inputCount === newCount && !voicesChanged) return n;
        changed = true;
        return {
          ...n,
          data: { ...n.data, inputCount: newCount, connectedVoices: newVoices },
        };
      });
      return changed ? next : nds;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges]);

  // ── Audio routing — only on topology change ────────────────────────────

  useEffect(() => {
    audioRouter.routeAudio(nodes, edges);

    // Apply data forwarding updates to React state
    const dataUpdates = audioRouter.forwardData(nodes, edges);
    if (dataUpdates.length > 0) {
      setNodes((nds) =>
        nds.map((n) => {
          const update = dataUpdates.find((u) => u.nodeId === n.id);
          if (!update) return n;
          const merged = { ...n.data };
          if (update.updates.dataValues) merged.dataValues = update.updates.dataValues;
          if (update.updates.tracks) merged.tracks = update.updates.tracks;
          return { ...n, data: merged };
        }),
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges]);

  // ── Continuous data-forwarding tick ───────────────────────────────────
  // Data sources (weather, earthquakes, vitals, etc.) refresh their values
  // on their own internal schedules. Without a periodic tick, connected
  // consumers only see the initial snapshot captured when the edge was drawn.
  // This 1s tick keeps `dataValues` in React state fresh and triggers any
  // downstream side-effects (e.g. pattern regeneration in the drum machine).
  useEffect(() => {
    if (edges.length === 0) return;
    const handle = setInterval(() => {
      const updates = audioRouter.forwardData(nodes, edges);
      if (updates.length === 0) return;
      setNodes((nds) => {
        let changed = false;
        const next = nds.map((n) => {
          const u = updates.find((x) => x.nodeId === n.id);
          if (!u) return n;
          const prev = n.data.dataValues ?? {};
          const nextValues = u.updates.dataValues;
          // Skip setNodes if the values are identical (avoid needless re-renders)
          if (nextValues) {
            const prevKeys = Object.keys(prev);
            const nextKeys = Object.keys(nextValues);
            const same =
              prevKeys.length === nextKeys.length &&
              nextKeys.every((k) => prev[k] === nextValues[k]);
            if (same && !u.updates.tracks) return n;
          }
          changed = true;
          const merged = { ...n.data };
          if (nextValues) merged.dataValues = nextValues;
          if (u.updates.tracks) merged.tracks = u.updates.tracks;
          return { ...n, data: merged };
        });
        return changed ? next : nds;
      });
    }, 250); // 4×/sec — smoother downstream visuals; setNodes is guarded above
    return () => clearInterval(handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges]);

  // ── Edge handlers ──────────────────────────────────────────────────────

  const isValidConnection = useCallback(
    (conn: Connection) => {
      if (conn.source === conn.target) return false;
      return !!(
        nodes.find((n) => n.id === conn.source) &&
        nodes.find((n) => n.id === conn.target)
      );
    },
    [nodes],
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    },
    [setEdges],
  );

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      const newEdge: Edge = {
        id: `e-${params.source}-${params.target}-${Date.now()}`,
        source: params.source || "",
        target: params.target || "",
        sourceHandle: params.sourceHandle || null,
        targetHandle: params.targetHandle || null,
        type: "custom",
        animated: true,
        style: { stroke: "hsl(188, 95%, 58%)", strokeWidth: 2 },
        data: {},
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges],
  );

  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      // Actually remove from state (fixed bug: old code only showed a toast)
      setEdges((eds) => eds.filter((e) => !deletedEdges.some((d) => d.id === e.id)));
    },
    [setEdges],
  );

  // ── Module actions context ─────────────────────────────────────────────
  // Passed via React context so module components always have fresh callbacks
  // without needing to inject them into ReactFlow's node data.
  const moduleActions = useMemo(
    () => ({
      onRemove: removeModule,
      onToggleCollapse: toggleCollapse,
      onUpdateParameter: updateParameter,
      onAction: sendAction,
      onStart: startModule,
      onStop: stopModule,
    }),
    [removeModule, toggleCollapse, updateParameter, sendAction, startModule, stopModule],
  );

  const enrichedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        type: edge.type || "custom",
        data: { ...edge.data, onDelete: deleteEdge },
        style: {
          stroke: edge.selected ? "hsl(268, 85%, 66%)" : "hsl(188, 95%, 58%)",
          strokeWidth: edge.selected ? 3 : 2,
        },
        animated: true,
      })),
    [edges, deleteEdge],
  );

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="w-full h-screen bg-background relative">
      <div className="relative z-30 w-full h-full">
        <ModuleToolbar
          onAddModule={(type, extraData) => {
            const result = addModule(type, extraData);
            toast({
              title: result.success ? "Module added" : "Already added",
              description: result.message,
            });
          }}
          livePricesEnabled={livePricesEnabled}
          onToggleLivePrices={() => {
            setLivePricesEnabled((prev) => !prev);
            toast({
              title: !livePricesEnabled ? "Live Prices Enabled" : "Live Prices Disabled",
              description: !livePricesEnabled
                ? "Crypto prices will update every 2 minutes"
                : "Price tracking stopped",
            });
          }}
          layoutsMenu={
            <LayoutsMenu
              getNodes={() => nodes}
              getEdges={() => edges}
              onLoad={(n, e) => loadLayout(n, e)}
              onClear={() => clearAll()}
            />
          }
          onRefreshAudio={() => {
            refreshAudio();
            toast({
              title: "Audio routing refreshed",
              description: "Rebuilt every connection from the current edges.",
            });
          }}
        />

        <ModuleProvider value={moduleActions}>
          <ReactFlow
            nodes={nodes}
            edges={enrichedEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onEdgesDelete={onEdgesDelete}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            proOptions={{ hideAttribution: true }}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
            <Controls />
          </ReactFlow>
        </ModuleProvider>
      </div>
    </div>
  );
};

export default Index;
