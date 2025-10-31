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
import { audioContextManager } from "@/audio/AudioContextManager";
import { AudioModule } from "@/audio/AudioModule";
import { CryptoModule } from "@/audio/modules/CryptoModule";
import { MixerModule } from "@/audio/modules/MixerModule";
import { EffectModule } from "@/audio/modules/EffectModule";
import { DrumsModule } from "@/audio/modules/DrumsModule";
import { SequencerModule } from "@/audio/modules/SequencerModule";
import { OutputModule } from "@/audio/modules/OutputModule";
import { VisualizerModule } from "@/audio/modules/VisualizerModule";
import CryptoModuleNode from "@/components/modules/CryptoModuleNode";
import MixerModuleNode from "@/components/modules/MixerModuleNode";
import MultiTrackMixerNode from "@/components/modules/MultiTrackMixerNode";
import VisualizerModuleNode from "@/components/modules/VisualizerModuleNode";
import SequencerModuleNode from "@/components/modules/SequencerModuleNode";
import DrumsModuleNode from "@/components/modules/DrumsModuleNode";
import SamplerModuleNode from "@/components/modules/SamplerModuleNode";
import EffectModuleNode from "@/components/modules/EffectModuleNode";
import OutputModuleNode from "@/components/modules/OutputModuleNode";
import ModuleToolbar from "@/components/ModuleToolbar";
import MandelbrotVisualizer from "@/components/MandelbrotVisualizer";
import { useToast } from "@/hooks/use-toast";
import { ModuleType } from "@/types/modules";
import InteractiveEdge from "@/components/modules/InteractiveEdge";
import { useLiveCryptoPrices } from "@/hooks/useLiveCryptoPrices";

const nodeTypes = {
  crypto: CryptoModuleNode,
  mixer: MixerModuleNode,
  "mixer-4": MultiTrackMixerNode,
  "mixer-8": MultiTrackMixerNode,
  "mixer-16": MultiTrackMixerNode,
  "mixer-32": MultiTrackMixerNode,
  "output-speakers": OutputModuleNode,
  "output-headphones": OutputModuleNode,
  visualizer: VisualizerModuleNode,
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
  const [masterVolume, setMasterVolume] = useState(1.0);
  const [livePricesEnabled, setLivePricesEnabled] = useState(false);
  const [activeVisualizer, setActiveVisualizer] = useState<AnalyserNode | null>(null);
  const { toast } = useToast();

  // Map to store AudioModule instances by node ID
  const moduleMap = new Map<string, AudioModule>();

  // Get list of crypto IDs from current nodes
  const activeCryptoIds = nodes
    .filter((n) => n.data.type === "crypto")
    .map((n) => n.data.crypto.id);

  // Handle live price updates
  const handlePriceUpdate = useCallback((updatedCryptos: CryptoData[]) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.data.type === "crypto") {
          const updatedCrypto = updatedCryptos.find(
            (c) => c.id === node.data.crypto.id
          );
          if (updatedCrypto) {
            const module = node.data.audioModule as CryptoModule;
            if (module) {
              module.updateCrypto(updatedCrypto);
            }
            
            // Show toast for significant price changes (>5%)
            const oldChange = node.data.crypto.price_change_percentage_24h;
            const newChange = updatedCrypto.price_change_percentage_24h;
            if (Math.abs(newChange - oldChange) > 5) {
              toast({
                title: `${updatedCrypto.symbol.toUpperCase()} Price Update`,
                description: `24h change: ${newChange.toFixed(2)}%`,
                duration: 2000,
              });
            }

            return {
              ...node,
              data: {
                ...node.data,
                crypto: updatedCrypto,
              },
            };
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
    intervalMs: 120000, // Update every 2 minutes to avoid rate limits
  });

  // Initialize audio context
  useEffect(() => {
    audioContextManager.initialize();

    return () => {
      // Clean up all modules
      nodes.forEach((node) => {
        const module = moduleMap.get(node.id);
        if (module) {
          module.dispose();
          moduleMap.delete(node.id);
        }
      });
      audioContextManager.close();
    };
  }, []);

  // Keep mixer input counts in sync with current connections (enables Play button)
  useEffect(() => {
    const mixerIds = new Set(
      nodes
        .filter((n) => typeof n.data.type === "string" && n.data.type.startsWith("mixer-"))
        .map((n) => n.id)
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

  // Rebuild audio routing when edges change (NOT when node data changes)
  useEffect(() => {
    const ctx = audioContextManager.getContext();
    if (!ctx) return;

    // Get current nodes snapshot
    setNodes(currentNodes => {
      // Track mixer channel inputs
      const mixerChannelInputs: { [key: string]: Set<number> } = {};

      edges.forEach(edge => {
        const targetNode = currentNodes.find(n => n.id === edge.target);
        if (targetNode && targetNode.data.type && targetNode.data.type.startsWith("mixer-")) {
          const channelIndex = edge.targetHandle ? parseInt(edge.targetHandle.split("-")[1]) : 0;
          if (!mixerChannelInputs[edge.target]) {
            mixerChannelInputs[edge.target] = new Set();
          }
          mixerChannelInputs[edge.target].add(channelIndex);
        }
      });

      // Update mixer channel active states
      currentNodes.forEach(node => {
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
      currentNodes.forEach(node => {
        const module = node.data.audioModule as AudioModule;
        if (module) {
          module.disconnect();
        }
      });

      // Track active visualizers
      let newActiveVisualizer: AnalyserNode | null = null;

      // Rebuild connections
      edges.forEach(edge => {
        const sourceNode = currentNodes.find(n => n.id === edge.source);
        const targetNode = currentNodes.find(n => n.id === edge.target);

        if (!sourceNode || !targetNode) return;

        const sourceModule = sourceNode.data.audioModule as AudioModule;
        const targetModule = targetNode.data.audioModule;

        if (!sourceModule || !targetModule) return;

        // Handle visualizer connections
        if (targetNode.data.type === "visualizer") {
          const visualizerModule = targetModule as VisualizerModule;
          sourceModule.connect(visualizerModule);
          // Activate this visualizer's analyser for background
          newActiveVisualizer = visualizerModule.getAnalyser();
          console.log(`Connected ${edge.source} to visualizer ${edge.target}`);
        }
        // Handle mixer channel connections
        else if (targetNode.data.type && targetNode.data.type.startsWith("mixer-")) {
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
      });

      // Update active visualizer
      setActiveVisualizer(newActiveVisualizer);

      // Update visualizer nodes' isActive state
      return currentNodes.map(node => {
        if (node.data.type === "visualizer") {
          const isConnected = edges.some(e => e.target === node.id);
          return {
            ...node,
            data: { ...node.data, isActive: isConnected }
          };
        }
        return node;
      });

    });
  }, [edges]);

  const isValidConnection = useCallback(
    (connection: Connection) => {
      // Only prevent self-connections, allow all other connections
      if (connection.source === connection.target) return false;

      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);

      if (!sourceNode || !targetNode) return false;

      // Allow all connections between different modules
      return true;
    },
    [nodes]
  );

  const deleteEdge = useCallback((edgeId: string) => {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    toast({
      title: "Disconnected",
      description: "Connection removed",
    });
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

      toast({
        title: "Connected",
        description: `Connected ${params.source} to ${params.target}`,
      });
    },
    [setEdges, toast]
  );

  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      toast({
        title: "Disconnected",
        description: `${deletedEdges.length} connection(s) removed`,
      });
    },
    [toast]
  );

  const addCryptoModule = (crypto: CryptoData) => {
    const id = `crypto-${crypto.id}`;

    if (nodes.find((n) => n.id === id)) {
      toast({
        title: "Already added",
        description: `${crypto.name} module is already on the canvas`,
      });
      return;
    }

    const ctx = audioContextManager.getContext();
    if (!ctx) return;

    const cryptoModule = new CryptoModule(ctx, crypto);

    const newNode: any = {
      id,
      type: "crypto",
      position: { x: 100 + nodes.length * 50, y: 100 + nodes.length * 50 },
      data: {
        type: "crypto",
        crypto,
        volume: 0.7,
        waveform: "sine",
        scale: "major",
        rootNote: "C",
        octave: 4,
        pitch: 0,
        isPlaying: false,
        collapsed: false,
        audioModule: cryptoModule,
        // For backward compatibility with UI
        gainNode: cryptoModule.outputNode,
      },
    };

    setNodes((nds) => [...nds, newNode]);

    toast({
      title: "Module added",
      description: `${crypto.name} added to canvas. Connect it to hear sound.`,
    });
  };

  const removeCryptoModule = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (node && node.data.audioModule) {
      const module = node.data.audioModule as AudioModule;
      module.dispose();
    }

    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  };

  const removeNode = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (node && node.data.audioModule) {
      const module = node.data.audioModule as AudioModule;
      module.dispose();
    }

    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  };

  const startSound = (nodeId: string) => {
    audioContextManager.resume();

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId && node.data.type === "crypto") {
          const module = node.data.audioModule as CryptoModule;
          if (module) {
            module.start();
          }
          return {
            ...node,
            data: { ...node.data, isPlaying: true },
          };
        }
        return node;
      })
    );
  };

  const stopSound = (nodeId: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId && node.data.type === "crypto") {
          const module = node.data.audioModule as CryptoModule;
          if (module) {
            module.stop();
          }
          return {
            ...node,
            data: { ...node.data, isPlaying: false },
          };
        }
        return node;
      })
    );
  };

  const getAllUpstreamSources = (nodeId: string, visited = new Set<string>()): any[] => {
    if (visited.has(nodeId)) return [];
    visited.add(nodeId);

    const directSources = edges
      .filter((e) => e.target === nodeId)
      .map((e) => nodes.find((n) => n.id === e.source))
      .filter(Boolean);

    const allSources = [...directSources];
    directSources.forEach((source) => {
      if (source) {
        allSources.push(...getAllUpstreamSources(source.id, visited));
      }
    });

    return allSources;
  };

  const togglePlay = (mixerId: string) => {
    const mixerNode = nodes.find((n) => n.id === mixerId);
    if (!mixerNode) return;

    const mixerModule = mixerNode.data.audioModule as MixerModule;
    if (!mixerModule) return;

    const mixerIsPlaying = mixerNode.data.isPlaying;

    if (mixerIsPlaying) {
      // Stop this mixer
      console.log('Stopping mixer:', mixerId);
      mixerModule.stop();
      
      // Find ALL upstream sources (recursively) and stop them
      const allSources = getAllUpstreamSources(mixerId);
      console.log('Found upstream sources to stop:', allSources.map(s => `${s?.type}-${s?.id}`));

      allSources.forEach((sourceNode) => {
        if (sourceNode?.data.audioModule) {
          const module = sourceNode.data.audioModule as AudioModule;
          console.log('Stopping module:', sourceNode.type, sourceNode.id);
          module.stop();
        }
      });

      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === mixerId) {
            return { ...n, data: { ...n.data, isPlaying: false } };
          }
          // Update all source nodes
          if (allSources.find((s) => s?.id === n.id)) {
            return { ...n, data: { ...n.data, isPlaying: false } };
          }
          return n;
        })
      );

      // Check if any other mixers are still playing
      const anyMixerPlaying = nodes.some(
        (n) => n.id !== mixerId &&
        (n.data.type === "mixer" || (typeof n.data.type === "string" && n.data.type.startsWith("mixer-"))) &&
        n.data.isPlaying
      );

      if (!anyMixerPlaying) {
        audioContextManager.suspend();
        setIsPlaying(false);
      }
    } else {
      // Start this mixer
      console.log('Starting mixer:', mixerId);
      audioContextManager.resume();
      mixerModule.start();

      // Find ALL upstream sources (recursively) and start them
      const allSources = getAllUpstreamSources(mixerId);
      console.log('Found upstream sources to start:', allSources.map(s => `${s?.type}-${s?.id}`));

      allSources.forEach((sourceNode) => {
        if (sourceNode?.data.audioModule) {
          const module = sourceNode.data.audioModule as AudioModule;
          console.log('Starting module:', sourceNode.type, sourceNode.id, 'isActive:', module.getIsActive());
          module.start();
        }
      });

      setIsPlaying(true);
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === mixerId) {
            return { ...n, data: { ...n.data, isPlaying: true } };
          }
          // Update all source nodes
          if (allSources.find((s) => s?.id === n.id)) {
            return { ...n, data: { ...n.data, isPlaying: true } };
          }
          return n;
        })
      );

      toast({
        title: "Playing",
        description: "Mixer is now active",
      });
    }
  };

  const updateVolume = (nodeId: string, volume: number) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId && node.data.type === "crypto") {
          const module = node.data.audioModule as CryptoModule;
          if (module) {
            module.setParameter("volume", volume);
          }
          return {
            ...node,
            data: { ...node.data, volume },
          };
        }
        return node;
      })
    );
  };

  const updateWaveform = (nodeId: string, waveform: OscillatorType) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId && node.data.type === "crypto") {
          const module = node.data.audioModule as CryptoModule;
          if (module) {
            module.setParameter("waveform", waveform);
          }
          return {
            ...node,
            data: { ...node.data, waveform },
          };
        }
        return node;
      })
    );
  };

  const updatePluginParameter = (nodeId: string, param: string, value: any) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const module = node.data.audioModule as AudioModule;
    if (module) {
      module.setParameter(param, value);
    }

    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === nodeId) {
          if (n.data.type === "crypto") {
            return { ...n, data: { ...n.data, [param]: value } };
          } else if (EFFECT_TYPES.includes(n.data.type)) {
            if (param === "intensity" || param === "mix" || param === "isActive") {
              return { ...n, data: { ...n.data, [param]: value } };
            } else {
              return {
                ...n,
                data: {
                  ...n.data,
                  parameters: { ...n.data.parameters, [param]: value },
                },
              };
            }
          } else {
            return { ...n, data: { ...n.data, [param]: value } };
          }
        }
        return n;
      })
    );
  };

  const toggleCollapse = (nodeId: string) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, collapsed: !node.data.collapsed } }
          : node
      )
    );
  };

  const addPluginModule = (type: ModuleType) => {
    const id = `${type}-${Date.now()}`;
    const ctx = audioContextManager.getContext();
    if (!ctx) return;

    let newNode: any;
    let audioModule: AudioModule | null = null;

    if (type === "sampler") {
      // Sampler doesn't use the new module system yet
      newNode = {
        id,
        type,
        position: { x: 100 + nodes.length * 50, y: 100 + nodes.length * 50 },
        data: {
          type,
          sample: "sine",
          pitch: 0,
          decay: 1,
          isActive: true,
          collapsed: false,
        },
      };
    } else if (type === "sequencer") {
      audioModule = new SequencerModule(ctx);
      const sequencerModule = audioModule as SequencerModule;
      
      // Set up step callback to update UI
      sequencerModule.setStepCallback((step: number, isActive: boolean) => {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id
              ? { ...n, data: { ...n.data, currentStep: step } }
              : n
          )
        );
      });
      
      newNode = {
        id,
        type,
        position: { x: 100 + nodes.length * 50, y: 100 + nodes.length * 50 },
        data: {
          type,
          bpm: 120,
          steps: Array(16).fill(false),
          currentStep: 0,
          isPlaying: false,
          collapsed: false,
          volume: 0.8,
          pitch: 0,
          audioModule,
          inputNode: audioModule.inputNode,
          outputNode: audioModule.outputNode,
        },
      };
    } else if (type === "drums") {
      audioModule = new DrumsModule(ctx);
      newNode = {
        id,
        type,
        position: { x: 100 + nodes.length * 50, y: 100 + nodes.length * 50 },
        data: {
          type,
          selectedDrum: "kick" as const,
          volume: 0.8,
          pitch: 0,
          collapsed: false,
          audioModule,
          outputNode: audioModule.outputNode,
        },
      };
    } else if (type.startsWith("mixer-")) {
      const trackCount = parseInt(type.split("-")[1]);
      audioModule = new MixerModule(ctx, trackCount);
      newNode = {
        id,
        type,
        position: { x: 100 + nodes.length * 50, y: 100 + nodes.length * 50 },
        data: {
          type,
          masterVolume: 0.7,
          isPlaying: false,
          inputCount: 0,
          collapsed: false,
          channels: Array.from({ length: trackCount }, (_, i) => (audioModule as MixerModule).getChannelData(i)),
          audioModule,
          mergerNode: audioModule.outputNode,
          channelGains: Array.from({ length: trackCount }, (_, i) => (audioModule as MixerModule).getChannelInput(i)),
        },
      };
    } else if (type === "output-speakers" || type === "output-headphones") {
      audioModule = new OutputModule(ctx);
      newNode = {
        id,
        type,
        position: { x: 100 + nodes.length * 50, y: 100 + nodes.length * 50 },
        data: {
          type,
          volume: 1.0,
          isActive: false,
          collapsed: false,
          audioModule,
          outputGain: audioModule.inputNode,
        },
      };
    } else if (EFFECT_TYPES.includes(type)) {
      audioModule = new EffectModule(ctx, type);
      newNode = {
        id,
        type,
        position: { x: 100 + nodes.length * 50, y: 100 + nodes.length * 50 },
        data: {
          type,
          intensity: 0.5,
          mix: 0.5,
          isActive: true,
          parameters: {},
          collapsed: false,
          audioModule,
          inputNode: audioModule.inputNode,
          outputNode: audioModule.outputNode,
        },
      };
    } else if (type === "visualizer") {
      audioModule = new VisualizerModule(ctx);
      newNode = {
        id,
        type,
        position: { x: 100 + nodes.length * 50, y: 100 + nodes.length * 50 },
        data: {
          type,
          isActive: false,
          collapsed: false,
          audioModule,
          analyserNode: (audioModule as VisualizerModule).getAnalyser(),
          inputNode: audioModule.inputNode,
          outputNode: audioModule.outputNode,
        },
      };
    } else {
      // Default fallback
      newNode = {
        id,
        type,
        position: { x: 100 + nodes.length * 50, y: 100 + nodes.length * 50 },
        data: {
          type,
          collapsed: false,
        },
      };
    }

    setNodes((nds) => [...nds, newNode]);
  };

  const cryptoCount = nodes.filter((n) => n.data.type === "crypto").length;

  return (
    <div className="w-full h-screen bg-background relative">
      <MandelbrotVisualizer analyser={activeVisualizer} isPlaying={isPlaying} />
      <ModuleToolbar
        onAddCrypto={addCryptoModule} 
        onAddPlugin={addPluginModule}
        livePricesEnabled={livePricesEnabled}
        onToggleLivePrices={() => {
          setLivePricesEnabled(!livePricesEnabled);
          toast({
            title: !livePricesEnabled ? "Live Prices Enabled" : "Live Prices Disabled",
            description: !livePricesEnabled 
              ? "Crypto prices will update every 30 seconds"
              : "Price tracking stopped",
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
                  onRemove: removeCryptoModule,
                  onVolumeChange: updateVolume,
                  onWaveformChange: updateWaveform,
                  onToggleCollapse: toggleCollapse,
                  onScaleChange: (id: string, scale: string) => updatePluginParameter(id, "scale", scale),
                  onRootNoteChange: (id: string, note: string) => updatePluginParameter(id, "rootNote", note),
                  onOctaveChange: (id: string, octave: number) => updatePluginParameter(id, "octave", octave),
                  onPitchChange: (id: string, pitch: number) => updatePluginParameter(id, "pitch", pitch),
                }
              : (typeof node.data.type === "string" && node.data.type.startsWith("mixer-"))
              ? {
                  ...node.data,
                  onTogglePlay: () => togglePlay(node.id),
                  onMasterVolumeChange: (volume: number) => updatePluginParameter(node.id, "masterVolume", volume),
                  onToggleCollapse: toggleCollapse,
                  onChannelVolumeChange: (channel: number, volume: number) => {
                    updatePluginParameter(node.id, `channel_${channel}_volume`, volume);
                  },
                  onChannelPanChange: (channel: number, pan: number) => {
                    updatePluginParameter(node.id, `channel_${channel}_pan`, pan);
                  },
                  onChannelMuteToggle: (channel: number) => {
                    const currentlyMuted = node.data.channels[channel]?.muted || false;
                    updatePluginParameter(node.id, `channel_${channel}_muted`, !currentlyMuted);
                  },
                  onRemove: removeNode,
                }
              : node.data.type === "sequencer"
              ? {
                  ...node.data,
                  onParameterChange: updatePluginParameter,
                  onToggleCollapse: toggleCollapse,
                  onRemove: removeNode,
                }
              : node.data.type === "drums"
              ? {
                  ...node.data,
                  onParameterChange: updatePluginParameter,
                  onToggleCollapse: toggleCollapse,
                  onRemove: removeNode,
                  onTrigger: (id: string) => {
                    const drumNode = nodes.find((n) => n.id === id);
                    if (drumNode?.data.audioModule) {
                      audioContextManager.resume();
                      const module = drumNode.data.audioModule as DrumsModule;
                      module.trigger();
                    }
                  },
                }
              : EFFECT_TYPES.includes(node.data.type)
              ? {
                  ...node.data,
                  onIntensityChange: (intensity: number) => updatePluginParameter(node.id, "intensity", intensity),
                  onMixChange: (mix: number) => updatePluginParameter(node.id, "mix", mix),
                  onToggleActive: () => updatePluginParameter(node.id, "isActive", !node.data.isActive),
                  onParameterChange: (param: string, value: number) => updatePluginParameter(node.id, param, value),
                  onToggleCollapse: toggleCollapse,
                  onRemove: removeNode,
                }
              : (node.data.type === "output-speakers" || node.data.type === "output-headphones")
              ? {
                  ...node.data,
                  onVolumeChange: (volume: number) => updatePluginParameter(node.id, "volume", volume),
                  onRemove: removeNode,
                }
              : node.data.type === "visualizer"
              ? {
                  ...node.data,
                  onUpdate: (id: string, updates: any) => {
                    setNodes((nds) =>
                      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...updates } } : n))
                    );
                  },
                  onRemove: removeNode,
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
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
};

export default Index;

