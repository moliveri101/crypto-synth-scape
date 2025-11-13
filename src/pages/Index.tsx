import { useState, useEffect, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  Connection,
  Edge,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  ConnectionMode,
} from "reactflow";
import "reactflow/dist/style.css";
import { CryptoData } from "@/types/crypto";
import { SatelliteData } from "@/types/modules";
import { audioContextManager } from "@/audio/AudioContextManager";
import { audioRouter } from "@/services/AudioRouter";
import { audioGraphManager } from "@/services/AudioGraphManager";
import { useModuleManager } from "@/hooks/useModuleManager";
import CryptoModuleNode from "@/components/modules/CryptoModuleNode";
import SatelliteModuleNode from "@/components/modules/SatelliteModuleNode";
import MixerModuleNode from "@/components/modules/MixerModuleNode";
import MultiTrackMixerNode from "@/components/modules/MultiTrackMixerNode";
import SequencerModuleNode from "@/components/modules/SequencerModuleNode";
import DrumsModuleNode from "@/components/modules/DrumsModuleNode";
import SamplerModuleNode from "@/components/modules/SamplerModuleNode";
import EffectModuleNode from "@/components/modules/EffectModuleNode";
import OutputModuleNode from "@/components/modules/OutputModuleNode";
import ModuleToolbar from "@/components/ModuleToolbar";
import { useToast } from "@/hooks/use-toast";
import { ModuleType } from "@/types/modules";
import InteractiveEdge from "@/components/modules/InteractiveEdge";
import { useLiveCryptoPrices } from "@/hooks/useLiveCryptoPrices";
import { CryptoModule } from "@/audio/modules/CryptoModule";
import { SatelliteModule } from "@/audio/modules/SatelliteModule";
import { MixerModule } from "@/audio/modules/MixerModule";
import { AudioModule } from "@/audio/AudioModule";

const nodeTypes = {
  crypto: CryptoModuleNode,
  satellite: SatelliteModuleNode,
  mixer: MixerModuleNode,
  "mixer-4": MultiTrackMixerNode,
  "mixer-8": MultiTrackMixerNode,
  "mixer-16": MultiTrackMixerNode,
  "mixer-32": MultiTrackMixerNode,
  "output-speakers": OutputModuleNode,
  "output-headphones": OutputModuleNode,
  sampler: SamplerModuleNode,
  sequencer: SequencerModuleNode,
  drums: DrumsModuleNode,
  reverb: EffectModuleNode,
  delay: EffectModuleNode,
  chorus: EffectModuleNode,
  flanger: EffectModuleNode,
  phaser: EffectModuleNode,
  "pingpong-delay": EffectModuleNode,
  compressor: EffectModuleNode,
  limiter: EffectModuleNode,
  gate: EffectModuleNode,
  "de-esser": EffectModuleNode,
  eq: EffectModuleNode,
  lpf: EffectModuleNode,
  hpf: EffectModuleNode,
  bandpass: EffectModuleNode,
  "resonant-filter": EffectModuleNode,
  overdrive: EffectModuleNode,
  distortion: EffectModuleNode,
  fuzz: EffectModuleNode,
  bitcrusher: EffectModuleNode,
  "tape-saturation": EffectModuleNode,
  vibrato: EffectModuleNode,
  tremolo: EffectModuleNode,
  "ring-mod": EffectModuleNode,
  "pitch-shifter": EffectModuleNode,
  octaver: EffectModuleNode,
  granular: EffectModuleNode,
  vocoder: EffectModuleNode,
  "auto-pan": EffectModuleNode,
  "stereo-widener": EffectModuleNode,
};

const edgeTypes = {
  custom: InteractiveEdge,
};

const EFFECT_TYPES = [
  "reverb", "delay", "chorus", "flanger", "phaser", "pingpong-delay",
  "compressor", "limiter", "gate", "de-esser",
  "eq", "lpf", "hpf", "bandpass", "resonant-filter",
  "overdrive", "distortion", "fuzz", "bitcrusher", "tape-saturation",
  "vibrato", "tremolo", "ring-mod", "pitch-shifter", "octaver",
  "granular", "vocoder", "auto-pan", "stereo-widener"
];

const Index = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [livePricesEnabled, setLivePricesEnabled] = useState(false);
  const { toast } = useToast();

  // Use the module manager hook
  const moduleManager = useModuleManager(nodes, setNodes, setEdges);

  // Get list of crypto IDs from current nodes
  const activeCryptoIds = nodes
    .filter((n) => n.data.type === "crypto")
    .map((n) => n.data.crypto.id);

  // Handle live price updates
  const handlePriceUpdate = useCallback((updatedCryptos: CryptoData[]) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.data.type === "crypto") {
            const updatedCrypto = updatedCryptos.find((c) => c.id === node.data.crypto.id);
          if (updatedCrypto) {
            const module = audioGraphManager.getModule(node.id) as CryptoModule;
            if (module) {
              module.updateCrypto(updatedCrypto);
            }
            
            const oldChange = node.data.crypto.price_change_percentage_24h;
            const newChange = updatedCrypto.price_change_percentage_24h;
            if (Math.abs(newChange - oldChange) > 5) {
              toast({
                title: `${updatedCrypto.symbol.toUpperCase()} Price Update`,
                description: `24h change: ${newChange.toFixed(2)}%`,
                duration: 2000,
              });
            }

            return { ...node, data: { ...node.data, crypto: updatedCrypto } };
          }
        }
        return node;
      })
    );
  }, [setNodes, toast]);

  // Set up live price polling
  useLiveCryptoPrices({
    cryptoIds: activeCryptoIds,
    onPriceUpdate: handlePriceUpdate,
    enabled: livePricesEnabled && activeCryptoIds.length > 0,
    intervalMs: 120000,
  });

  // Initialize audio context
  useEffect(() => {
    audioContextManager.initialize();

    return () => {
      // Dispose all modules via graph manager
      audioGraphManager.dispose();
      // Do not close the AudioContext to avoid context mismatch across HMR/rehydration
      audioContextManager.suspend();
    };
  }, []);

  // Keep mixer input counts in sync
  useEffect(() => {
    const mixerIds = new Set(
      nodes.filter((n) => typeof n.data.type === "string" && n.data.type.startsWith("mixer-")).map((n) => n.id)
    );

    if (mixerIds.size === 0) return;

    const counts: Record<string, number> = {};
    edges.forEach((e) => {
      if (mixerIds.has(e.target)) {
        counts[e.target] = (counts[e.target] || 0) + 1;
      }
    });

    setNodes((nds) =>
      nds.map((n) => {
        if (mixerIds.has(n.id)) {
          const newCount = counts[n.id] || 0;
          if (n.data.inputCount !== newCount) {
            return { ...n, data: { ...n.data, inputCount: newCount } };
          }
        }
        return n;
      })
    );
  }, [edges, nodes, setNodes]);

  // Rebuild audio routing ONLY when topology changes (edges, not node data)
  useEffect(() => {
    audioRouter.routeAudio(nodes, edges);
  }, [edges]);

  const isValidConnection = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) return false;
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      return !!(sourceNode && targetNode);
    },
    [nodes]
  );

  const deleteEdge = useCallback((edgeId: string) => {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    toast({ title: "Disconnected", description: "Connection removed" });
  }, [setEdges, toast]);

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      const newEdge: Edge = {
        id: params.source && params.target ? `e-${params.source}-${params.target}-${Date.now()}` : `e-${Date.now()}`,
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
      toast({ title: "Connected", description: `Connected ${params.source} to ${params.target}` });
    },
    [setEdges, toast]
  );

  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      toast({ title: "Disconnected", description: `${deletedEdges.length} connection(s) removed` });
    },
    [toast]
  );

  const addCryptoModule = (crypto: CryptoData) => {
    const result = moduleManager.addCryptoModule(crypto);
    toast({
      title: result.success ? "Module added" : "Already added",
      description: result.message,
    });
  };

  const addSatelliteModule = (satellite: SatelliteData) => {
    const result = moduleManager.addSatelliteModule(satellite);
    toast({
      title: result.success ? "Satellite added" : "Already added",
      description: result.message,
    });
  };

  const togglePlay = (mixerId: string) => {
    const mixerNode = nodes.find((n) => n.id === mixerId);
    if (!mixerNode) return;

    const mixerModule = audioGraphManager.getModule(mixerId) as MixerModule;
    if (!mixerModule) return;

    const mixerIsPlaying = mixerNode.data.isPlaying;

    if (mixerIsPlaying) {
      mixerModule.stop();
      audioRouter.stopModuleChain(mixerId, nodes, edges);
      
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === mixerId) return { ...n, data: { ...n.data, isPlaying: false } };
          const allSources = audioRouter.getUpstreamSources(mixerId, nodes, edges);
          if (allSources.find((s) => s?.id === n.id)) {
            return { ...n, data: { ...n.data, isPlaying: false } };
          }
          return n;
        })
      );

      const anyMixerPlaying = nodes.some(
        (n) => n.id !== mixerId && (typeof n.data.type === "string" && n.data.type.startsWith("mixer-")) && n.data.isPlaying
      );

      if (!anyMixerPlaying) {
        audioContextManager.suspend();
        setIsPlaying(false);
      }
    } else {
      audioContextManager.resume();
      mixerModule.start();
      audioRouter.startModuleChain(mixerId, nodes, edges);

      setIsPlaying(true);
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === mixerId) return { ...n, data: { ...n.data, isPlaying: true } };
          const allSources = audioRouter.getUpstreamSources(mixerId, nodes, edges);
          if (allSources.find((s) => s?.id === n.id)) {
            return { ...n, data: { ...n.data, isPlaying: true } };
          }
          return n;
        })
      );

      toast({ title: "Playing", description: "Mixer is now active" });
    }
  };

  return (
    <div className="w-full h-screen bg-background relative">
      <div className="relative z-30 w-full h-full">
        <ModuleToolbar
          onAddCrypto={addCryptoModule}
          onAddSatellite={addSatelliteModule}
          onAddPlugin={(type: ModuleType) => moduleManager.addPluginModule(type)}
          livePricesEnabled={livePricesEnabled}
          onToggleLivePrices={() => {
            setLivePricesEnabled(!livePricesEnabled);
            toast({
              title: !livePricesEnabled ? "Live Prices Enabled" : "Live Prices Disabled",
              description: !livePricesEnabled ? "Crypto prices will update every 30 seconds" : "Price tracking stopped",
            });
          }}
        />

        <ReactFlow
          nodes={nodes.map((node) => ({
            ...node,
            data:
              node.data.type === "crypto"
                ? {
                    ...node.data,
                    onRemove: moduleManager.removeModule,
                    onVolumeChange: (id: string, vol: number) => moduleManager.updateParameter(id, "volume", vol),
                    onWaveformChange: (id: string, wf: OscillatorType) => moduleManager.updateParameter(id, "waveform", wf),
                    onToggleCollapse: moduleManager.toggleCollapse,
                    onScaleChange: (id: string, scale: string) => moduleManager.updateParameter(id, "scale", scale),
                    onRootNoteChange: (id: string, note: string) => moduleManager.updateParameter(id, "rootNote", note),
                    onOctaveChange: (id: string, octave: number) => moduleManager.updateParameter(id, "octave", octave),
                    onPitchChange: (id: string, pitch: number) => moduleManager.updateParameter(id, "pitch", pitch),
                    onPlay: moduleManager.startModule,
                    onStop: moduleManager.stopModule,
                  }
                : node.data.type === "satellite"
                ? {
                    ...node.data,
                    onUpdate: (updates: any) => {
                      setNodes((nds) =>
                        nds.map((n) =>
                          n.id === node.id ? { ...n, data: { ...n.data, ...updates } } : n
                        )
                      );
                      Object.entries(updates).forEach(([key, value]) => {
                        if (key === "waveform" || key === "volume") {
                          moduleManager.updateParameter(node.id, key, value);
                        }
                      });
                    },
                    onTogglePlay: () => {
                      const module = audioGraphManager.getModule(node.id) as SatelliteModule;
                      if (module) {
                        if (node.data.isPlaying) {
                          module.stop();
                        } else {
                          audioContextManager.resume();
                          module.start();
                        }
                        setNodes((nds) =>
                          nds.map((n) =>
                            n.id === node.id ? { ...n, data: { ...n.data, isPlaying: !n.data.isPlaying } } : n
                          )
                        );
                      }
                    },
                    onRemove: () => moduleManager.removeModule(node.id),
                  }
                : typeof node.data.type === "string" && node.data.type.startsWith("mixer-")
                ? {
                    ...node.data,
                    onTogglePlay: () => togglePlay(node.id),
                    onMasterVolumeChange: (vol: number) => moduleManager.updateParameter(node.id, "masterVolume", vol),
                    onToggleCollapse: moduleManager.toggleCollapse,
                    onChannelVolumeChange: (ch: number, vol: number) => moduleManager.updateMixerChannel(node.id, ch, "volume", vol),
                    onChannelPanChange: (ch: number, pan: number) => moduleManager.updateMixerChannel(node.id, ch, "pan", pan),
                    onChannelMuteToggle: (ch: number) => {
                      const currentlyMuted = node.data.channels[ch]?.muted || false;
                      moduleManager.updateMixerChannel(node.id, ch, "muted", !currentlyMuted);
                    },
                    onRemove: moduleManager.removeModule,
                  }
                : node.data.type === "sequencer"
                ? {
                    ...node.data,
                    onParameterChange: moduleManager.updateParameter,
                    onToggleCollapse: moduleManager.toggleCollapse,
                    onRemove: moduleManager.removeModule,
                  }
                : node.data.type === "drums"
                ? {
                    ...node.data,
                    onParameterChange: moduleManager.updateParameter,
                    onToggleCollapse: moduleManager.toggleCollapse,
                    onRemove: moduleManager.removeModule,
                    onTrigger: moduleManager.triggerDrum,
                  }
                : EFFECT_TYPES.includes(node.data.type)
                ? {
                    ...node.data,
                    onIntensityChange: (intensity: number) => moduleManager.updateParameter(node.id, "intensity", intensity),
                    onMixChange: (mix: number) => moduleManager.updateParameter(node.id, "mix", mix),
                    onToggleActive: () => moduleManager.updateParameter(node.id, "isActive", !node.data.isActive),
                    onParameterChange: (param: string, value: number) => moduleManager.updateParameter(node.id, param, value),
                    onToggleCollapse: moduleManager.toggleCollapse,
                    onRemove: moduleManager.removeModule,
                  }
                : node.data.type === "output-speakers" || node.data.type === "output-headphones"
                ? {
                    ...node.data,
                    onVolumeChange: (vol: number) => moduleManager.updateParameter(node.id, "volume", vol),
                    onRemove: moduleManager.removeModule,
                  }
                : node.data.type === "sampler"
                ? {
                    ...node.data,
                    onTriggerPad: moduleManager.triggerSamplerPad,
                    onStopPad: moduleManager.stopSamplerPad,
                    onLoadSample: async (id: string, padIndex: number, file: File) => {
                      await moduleManager.loadSamplerSample(id, padIndex, file);
                      toast({ title: "Sample Loaded", description: `Loaded to pad ${padIndex + 1}` });
                    },
                    onRecordToPad: async (id: string, padIndex: number) => {
                      toast({ title: "Recording", description: "Recording started (10s max)" });
                      await moduleManager.recordSamplerPad(id, padIndex);
                      toast({ title: "Recording Complete", description: `Saved to pad ${padIndex + 1}` });
                    },
                    onPadVolumeChange: (id: string, padIndex: number, vol: number) => 
                      moduleManager.updateParameter(id, `pad_${padIndex}_volume`, vol),
                    onPadPitchChange: (id: string, padIndex: number, pitch: number) => 
                      moduleManager.updateParameter(id, `pad_${padIndex}_pitch`, pitch),
                    onPadLoopChange: (id: string, padIndex: number, loop: boolean) => 
                      moduleManager.updateParameter(id, `pad_${padIndex}_loop`, loop),
                    onPadLoopStartChange: (id: string, padIndex: number, time: number) => 
                      moduleManager.updateParameter(id, `pad_${padIndex}_loopStart`, time),
                    onPadLoopEndChange: (id: string, padIndex: number, time: number) => 
                      moduleManager.updateParameter(id, `pad_${padIndex}_loopEnd`, time),
                    onVolumeChange: (id: string, vol: number) => moduleManager.updateParameter(id, "volume", vol),
                    onFilterFreqChange: (id: string, freq: number) => moduleManager.updateParameter(id, "filterFreq", freq),
                    onFilterResChange: (id: string, res: number) => moduleManager.updateParameter(id, "filterRes", res),
                    onSelectPad: moduleManager.selectSamplerPad,
                    onToggleCollapse: moduleManager.toggleCollapse,
                    onRemove: moduleManager.removeModule,
                  }
                : node.data,
          }))}
          edges={edges.map((edge) => ({
            ...edge,
            type: edge.type || "custom",
            data: { ...edge.data, onDelete: deleteEdge },
            style: {
              stroke: edge.selected ? "hsl(268, 85%, 66%)" : "hsl(188, 95%, 58%)",
              strokeWidth: edge.selected ? 3 : 2,
            },
            animated: true,
          }))}
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
      </div>
    </div>
  );
};

export default Index;
