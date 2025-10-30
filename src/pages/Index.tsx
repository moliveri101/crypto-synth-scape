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
  Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { CryptoData } from "@/types/crypto";
import { ModuleData, CryptoModuleData, MixerModuleData, VisualizerModuleData } from "@/types/modules";
import { audioEngine } from "@/utils/audioEngine";
import CryptoModuleNode from "@/components/modules/CryptoModuleNode";
import MixerModuleNode from "@/components/modules/MixerModuleNode";
import VisualizerModuleNode from "@/components/modules/VisualizerModuleNode";
import SamplerModuleNode from "@/components/modules/SamplerModuleNode";
import ToneSelectorModuleNode from "@/components/modules/ToneSelectorModuleNode";
import EffectModuleNode from "@/components/modules/EffectModuleNode";
import ModuleToolbar from "@/components/ModuleToolbar";
import { useToast } from "@/hooks/use-toast";
import { ModuleType } from "@/types/modules";
import CustomEdge from "@/components/modules/CustomEdge";
import InteractiveEdge from "@/components/modules/InteractiveEdge";

const nodeTypes = {
  crypto: CryptoModuleNode,
  mixer: MixerModuleNode,
  visualizer: VisualizerModuleNode,
  sampler: SamplerModuleNode,
  "tone-selector": ToneSelectorModuleNode,
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

const Index = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [masterVolume, setMasterVolume] = useState(0.5);
  const { toast } = useToast();

  // Initialize audio engine and default modules
  useEffect(() => {
    audioEngine.initialize();

    // Add default mixer module
    const mixerNode: any = {
      id: "mixer",
      type: "mixer",
      position: { x: 600, y: 250 },
      data: {
        type: "mixer",
        masterVolume: 0.5,
        isPlaying: false,
        inputCount: 0,
        collapsed: false,
      },
    };

    // Add default visualizer module
    const visualizerNode: any = {
      id: "visualizer",
      type: "visualizer",
      position: { x: 1000, y: 250 },
      data: {
        type: "visualizer",
        isActive: false,
        collapsed: false,
      },
    };

    // Connect mixer to visualizer
    const defaultEdge: Edge = {
      id: "e-mixer-visualizer",
      source: "mixer",
      target: "visualizer",
      type: "custom",
      animated: true,
      style: { stroke: "hsl(188, 95%, 58%)", strokeWidth: 2 },
      data: {},
    };

    setNodes([mixerNode, visualizerNode]);
    setEdges([defaultEdge]);

    return () => {
      audioEngine.close();
    };
  }, []);

  // Update master volume
  useEffect(() => {
    audioEngine.setMasterVolume(masterVolume);
  }, [masterVolume]);

  // Update mixer input count
  useEffect(() => {
    const cryptoCount = nodes.filter((n) => n.type === "crypto").length;
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === "mixer" && node.data.type === "mixer") {
          return {
            ...node,
            data: { ...node.data, inputCount: cryptoCount },
          };
        }
        return node;
      })
    );
  }, [nodes.length]);

  const EFFECT_TYPES = [
    "reverb", "delay", "chorus", "flanger", "phaser", "pingpong-delay",
    "compressor", "limiter", "gate", "de-esser", 
    "eq", "lpf", "hpf", "bandpass", "resonant-filter",
    "overdrive", "distortion", "fuzz", "bitcrusher", "tape-saturation",
    "vibrato", "tremolo", "ring-mod", "pitch-shifter", "octaver",
    "granular", "vocoder", "auto-pan", "stereo-widener"
  ];

  const isValidConnection = useCallback(
    (connection: Connection) => {
      // Prevent self-connections
      if (connection.source === connection.target) {
        console.log("Invalid: self-connection");
        return false;
      }

      // Get source and target nodes
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);

      if (!sourceNode || !targetNode) {
        console.log("Invalid: node not found", { source: connection.source, target: connection.target });
        return false;
      }

      const sourceType = sourceNode.data.type;
      const targetType = targetNode.data.type;

      console.log("Validating connection:", { sourceType, targetType });

      // Crypto can connect to: mixer, effects, sampler
      if (sourceType === "crypto") {
        const valid = targetType === "mixer" || targetType === "sampler" || EFFECT_TYPES.includes(targetType);
        console.log("Crypto connection valid:", valid);
        return valid;
      }

      // Sampler can connect to: mixer, effects
      if (sourceType === "sampler") {
        const valid = targetType === "mixer" || EFFECT_TYPES.includes(targetType);
        console.log("Sampler connection valid:", valid);
        return valid;
      }

      // Tone selector can connect to: crypto, mixer, effects
      if (sourceType === "tone-selector") {
        const valid = targetType === "crypto" || targetType === "mixer" || EFFECT_TYPES.includes(targetType);
        console.log("Tone selector connection valid:", valid);
        return valid;
      }

      // Effects can connect to: mixer, other effects, visualizer
      if (EFFECT_TYPES.includes(sourceType)) {
        const valid = targetType === "mixer" || targetType === "visualizer" || EFFECT_TYPES.includes(targetType);
        console.log("Effect connection valid:", valid);
        return valid;
      }

      // Mixer can connect to: visualizer, effects
      if (sourceType === "mixer") {
        const valid = targetType === "visualizer" || EFFECT_TYPES.includes(targetType);
        console.log("Mixer connection valid:", valid);
        return valid;
      }

      console.log("Invalid: no matching rule");
      return false;
    },
    [nodes, EFFECT_TYPES]
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
      
      setEdges((eds) => {
        console.log("Adding edge:", newEdge);
        return addEdge(newEdge, eds);
      });
      
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

    // Check if already exists
    if (nodes.find((n) => n.id === id)) {
      toast({
        title: "Already added",
        description: `${crypto.name} module is already on the canvas`,
      });
      return;
    }

    // Create new crypto module
    const newNode: any = {
      id,
      type: "crypto",
      position: { x: 100 + nodes.length * 50, y: 100 + nodes.length * 50 },
      data: {
        type: "crypto",
        crypto,
        volume: 0.7,
        waveform: "sine",
        oscillator: null,
        gainNode: null,
        isPlaying: false,
        collapsed: false,
      },
    };

    setNodes((nds) => [...nds, newNode]);

    // Start sound if playing
    if (isPlaying) {
      setTimeout(() => startSound(id), 100);
    }
  };

  const removeCryptoModule = (id: string) => {
    // Stop sound
    const node = nodes.find((n) => n.id === id);
    if (node && node.data.type === "crypto") {
      const data = node.data;
      if (data.oscillator) {
        data.oscillator.stop();
        data.oscillator.disconnect();
      }
    }

    // Remove node and connected edges
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  };

  const startSound = (nodeId: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId && node.data.type === "crypto") {
          const data = node.data;
          if (data.oscillator) return node;

          const audioNodes = audioEngine.createOscillator(data.crypto, data.waveform);
          if (audioNodes) {
            const { oscillator, gainNode } = audioNodes;
            gainNode.gain.value *= data.volume;
            oscillator.start();

            return {
              ...node,
              data: {
                ...data,
                oscillator,
                gainNode,
                isPlaying: true,
              },
            };
          }
        }
        return node;
      })
    );
  };

  const stopSound = (nodeId: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId && node.data.type === "crypto") {
          const data = node.data;
          if (data.oscillator) {
            data.oscillator.stop();
            data.oscillator.disconnect();
          }

          return {
            ...node,
            data: {
              ...data,
              oscillator: null,
              gainNode: null,
              isPlaying: false,
            },
          };
        }
        return node;
      })
    );
  };

  const togglePlay = () => {
    if (isPlaying) {
      nodes.forEach((node) => {
        if (node.data.type === "crypto") {
          stopSound(node.id);
        }
      });
      audioEngine.suspend();
      setIsPlaying(false);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === "mixer" && n.data.type === "mixer"
            ? { ...n, data: { ...n.data, isPlaying: false } }
            : n
        )
      );
    } else {
      audioEngine.resume();
      nodes.forEach((node) => {
        if (node.data.type === "crypto") {
          startSound(node.id);
        }
      });
      setIsPlaying(true);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === "mixer" && n.data.type === "mixer"
            ? { ...n, data: { ...n.data, isPlaying: true } }
            : n
        )
      );
      toast({
        title: "Playing",
        description: "Your crypto symphony is now playing",
      });
    }
  };

  const updateVolume = (nodeId: string, volume: number) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId && node.data.type === "crypto") {
          const data = node.data;
          if (data.gainNode) {
            data.gainNode.gain.value = volume * 0.5;
          }
          return {
            ...node,
            data: { ...data, volume },
          };
        }
        return node;
      })
    );
  };

  const updateWaveform = (nodeId: string, waveform: OscillatorType) => {
    const node = nodes.find((n) => n.id === nodeId);
    const wasPlaying = node && node.data.type === "crypto" ? node.data.isPlaying : false;

    if (wasPlaying) {
      stopSound(nodeId);
    }

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId && node.data.type === "crypto") {
          return {
            ...node,
            data: { ...node.data, waveform },
          };
        }
        return node;
      })
    );

    if (wasPlaying) {
      setTimeout(() => startSound(nodeId), 50);
    }
  };

  const handleMasterVolumeChange = (volume: number) => {
    setMasterVolume(volume);
    setNodes((nds) =>
      nds.map((n) =>
        n.id === "mixer" && n.data.type === "mixer"
          ? { ...n, data: { ...n.data, masterVolume: volume } }
          : n
      )
    );
  };

  const addPluginModule = (type: ModuleType) => {
    const id = `${type}-${Date.now()}`;
    
    let newNode: any;
    
    if (type === "sampler") {
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
          audioNode: null,
          collapsed: false,
        },
      };
    } else if (type === "tone-selector") {
      newNode = {
        id,
        type,
        position: { x: 100 + nodes.length * 50, y: 100 + nodes.length * 50 },
        data: {
          type,
          scale: "major",
          rootNote: "C",
          octave: 4,
          isActive: true,
          collapsed: false,
        },
      };
    } else {
      // Effect modules
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
          audioNode: null,
          collapsed: false,
        },
      };
    }
    
    setNodes((nds) => [...nds, newNode]);
  };

  const updatePluginParameter = (nodeId: string, param: string, value: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          if (node.data.type === "sampler") {
            return { ...node, data: { ...node.data, [param]: value } };
          } else if (node.data.type === "tone-selector") {
            return { ...node, data: { ...node.data, [param]: value } };
          } else {
            // Effect modules
            if (param === "intensity" || param === "mix" || param === "isActive") {
              return { ...node, data: { ...node.data, [param]: value } };
            } else {
              return {
                ...node,
                data: {
                  ...node.data,
                  parameters: { ...node.data.parameters, [param]: value },
                },
              };
            }
          }
        }
        return node;
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

  const cryptoCount = nodes.filter((n) => n.data.type === "crypto").length;

  return (
    <div className="w-full h-screen bg-background">
      <ModuleToolbar onAddCrypto={addCryptoModule} onAddPlugin={addPluginModule} />

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
                }
              : node.data.type === "mixer"
              ? {
                  ...node.data,
                  onTogglePlay: togglePlay,
                  onMasterVolumeChange: handleMasterVolumeChange,
                  onToggleCollapse: toggleCollapse,
                }
              : node.data.type === "visualizer"
              ? { ...node.data, isPlaying, activeCryptos: cryptoCount, onToggleCollapse: toggleCollapse }
              : node.data.type === "sampler"
              ? {
                  ...node.data,
                  onSampleChange: (sample: string) => updatePluginParameter(node.id, "sample", sample),
                  onPitchChange: (pitch: number) => updatePluginParameter(node.id, "pitch", pitch),
                  onDecayChange: (decay: number) => updatePluginParameter(node.id, "decay", decay),
                  onToggleCollapse: toggleCollapse,
                }
              : node.data.type === "tone-selector"
              ? {
                  ...node.data,
                  onScaleChange: (scale: string) => updatePluginParameter(node.id, "scale", scale),
                  onRootNoteChange: (note: string) => updatePluginParameter(node.id, "rootNote", note),
                  onOctaveChange: (octave: number) => updatePluginParameter(node.id, "octave", octave),
                  onToggleCollapse: toggleCollapse,
                }
              : node.data.type && ["reverb", "delay", "chorus", "flanger", "phaser", "pingpong-delay", 
                  "compressor", "limiter", "gate", "de-esser", "eq", "lpf", "hpf", "bandpass", 
                  "resonant-filter", "overdrive", "distortion", "fuzz", "bitcrusher", "tape-saturation",
                  "vibrato", "tremolo", "ring-mod", "pitch-shifter", "octaver", "granular", "vocoder",
                  "auto-pan", "stereo-widener"].includes(node.data.type)
              ? {
                  ...node.data,
                  onIntensityChange: (intensity: number) => updatePluginParameter(node.id, "intensity", intensity),
                  onMixChange: (mix: number) => updatePluginParameter(node.id, "mix", mix),
                  onToggleActive: () => updatePluginParameter(node.id, "isActive", !node.data.isActive),
                  onParameterChange: (param: string, value: number) => updatePluginParameter(node.id, param, value),
                  onToggleCollapse: toggleCollapse,
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
        fitView
        deleteKeyCode={["Delete", "Backspace"]}
        multiSelectionKeyCode="Control"
        connectionLineStyle={{ stroke: "hsl(188, 95%, 58%)", strokeWidth: 3 }}
        defaultEdgeOptions={{
          animated: true,
          type: "custom",
          style: { stroke: "hsl(188, 95%, 58%)", strokeWidth: 2 },
        }}
        snapToGrid={true}
        snapGrid={[15, 15]}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="hsl(188, 95%, 58%, 0.2)"
        />
        <Controls className="!bg-card !border-border !shadow-card" />
        <MiniMap
          className="!bg-card !border-border"
          nodeColor={(node: any) => {
            if (node.data?.type === "mixer") return "hsl(188, 95%, 58%)";
            if (node.data?.type === "visualizer") return "hsl(268, 85%, 66%)";
            return "hsl(220, 20%, 12%)";
          }}
        />
      </ReactFlow>
    </div>
  );
};

export default Index;
