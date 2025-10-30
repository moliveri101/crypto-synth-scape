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
  ConnectionMode,
} from "reactflow";
import "reactflow/dist/style.css";
import { CryptoData } from "@/types/crypto";
import { ModuleData, CryptoModuleData, MixerModuleData, VisualizerModuleData } from "@/types/modules";
import { audioEngine } from "@/utils/audioEngine";
import CryptoModuleNode from "@/components/modules/CryptoModuleNode";
import MixerModuleNode from "@/components/modules/MixerModuleNode";
import MultiTrackMixerNode from "@/components/modules/MultiTrackMixerNode";
import VisualizerModuleNode from "@/components/modules/VisualizerModuleNode";
import SequencerModuleNode from "@/components/modules/SequencerModuleNode";
import SamplerModuleNode from "@/components/modules/SamplerModuleNode";
import EffectModuleNode from "@/components/modules/EffectModuleNode";
import OutputModuleNode from "@/components/modules/OutputModuleNode";
import ModuleToolbar from "@/components/ModuleToolbar";
import { useToast } from "@/hooks/use-toast";
import { ModuleType } from "@/types/modules";
import CustomEdge from "@/components/modules/CustomEdge";
import InteractiveEdge from "@/components/modules/InteractiveEdge";

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

  // Initialize audio engine (no default modules)
  useEffect(() => {
    audioEngine.initialize();

    return () => {
      // Clean up all sequencer intervals
      nodes.forEach((node) => {
        if (node.data.type === "sequencer" && node.data.intervalId) {
          clearInterval(node.data.intervalId);
        }
      });
      audioEngine.close();
    };
  }, []);

  // Build audio routing based on edges
  useEffect(() => {
    if (!isPlaying) return;

    // Update input counts and active status
    const mixerInputCounts: { [key: string]: number } = {};
    const outputActiveStatus: { [key: string]: boolean } = {};
    
    edges.forEach(edge => {
      const targetNode = nodes.find(n => n.id === edge.target);
      if (targetNode) {
        if (targetNode.data.type && targetNode.data.type.startsWith("mixer-")) {
          mixerInputCounts[edge.target] = (mixerInputCounts[edge.target] || 0) + 1;
        } else if (targetNode.data.type === "output-speakers" || targetNode.data.type === "output-headphones") {
          outputActiveStatus[edge.target] = true;
        }
      }
    });
    
    // Update node data with input counts and active status
    setNodes((nds) =>
      nds.map((node) => {
        if (node.data.type && node.data.type.startsWith("mixer-")) {
          const inputCount = mixerInputCounts[node.id] || 0;
          if (node.data.inputCount !== inputCount) {
            return { ...node, data: { ...node.data, inputCount } };
          }
        } else if (node.data.type === "output-speakers" || node.data.type === "output-headphones") {
          const isActive = outputActiveStatus[node.id] || false;
          if (node.data.isActive !== isActive) {
            return { ...node, data: { ...node.data, isActive } };
          }
        }
        return node;
      })
    );

    // Rebuild all audio connections
    nodes.forEach(node => {
      const { data } = node;
      
      // Initialize effect nodes if needed
      if (data.type && EFFECT_TYPES.includes(data.type) && !data.inputNode) {
        const effectAudio = audioEngine.createEffect(data.type);
        if (effectAudio) {
          data.inputNode = effectAudio.inputNode;
          data.outputNode = effectAudio.outputNode;
          data.wetNode = effectAudio.wetNode;
          data.dryNode = effectAudio.dryNode;
          data.audioNode = effectAudio.effectNode;
        }
      }
    });

    // Build connections based on edges
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);

      if (!sourceNode || !targetNode) return;

      const sourceData = sourceNode.data;
      const targetData = targetNode.data;

      // Get source audio node
      let sourceAudioNode: AudioNode | null = null;
      if (sourceData.type === "crypto" && sourceData.gainNode) {
        sourceAudioNode = sourceData.gainNode;
      } else if (sourceData.outputNode) {
        sourceAudioNode = sourceData.outputNode;
      } else if (sourceData.type && sourceData.type.startsWith("mixer-") && sourceData.mergerNode) {
        // Mixer outputs from its merger node
        sourceAudioNode = sourceData.mergerNode;
      }

      // Get target audio node
      let targetAudioNode: AudioNode | null = null;
      if (targetData.inputNode) {
        targetAudioNode = targetData.inputNode;
      } else if (targetData.type && targetData.type.startsWith("mixer-")) {
        // Connect to specific mixer channel based on targetHandle
        const channelIndex = edge.targetHandle ? parseInt(edge.targetHandle.split("-")[1]) : 0;
        if (targetData.channelGains && targetData.channelGains[channelIndex]) {
          targetAudioNode = targetData.channelGains[channelIndex];
        }
      } else if (targetData.type === "output-speakers" || targetData.type === "output-headphones") {
        // Create output gain node if it doesn't exist
        if (!targetData.outputGain && audioEngine.getContext()) {
          const ctx = audioEngine.getContext()!;
          targetData.outputGain = ctx.createGain();
          targetData.outputGain.gain.value = targetData.volume || 1.0;
          targetData.outputGain.connect(ctx.destination);
        }
        
        if (targetData.outputGain) {
          targetAudioNode = targetData.outputGain;
          targetData.isActive = true;
        }
      }

      // Connect
      if (sourceAudioNode && targetAudioNode) {
        try {
          audioEngine.connectNodes(sourceAudioNode, targetAudioNode);
          console.log(`Connected ${edge.source} to ${edge.target}`);
        } catch (error) {
          console.error("Connection error:", error);
        }
      }
    });
  }, [edges, nodes, isPlaying]);

  // Keep mixer inputCount in sync with current connections so play button enables
  useEffect(() => {
    const counts: Record<string, number> = {};
    edges.forEach((e) => {
      counts[e.target] = (counts[e.target] || 0) + 1;
    });

    setNodes((nds) =>
      nds.map((node) => {
        const t = node.data.type;
        if (t === "mixer" || (typeof t === "string" && t.startsWith("mixer-"))) {
          const inputCount = counts[node.id] || 0;
          if (node.data.inputCount !== inputCount) {
            return { ...node, data: { ...node.data, inputCount } };
          }
        }
        return node;
      })
    );
  }, [edges]);

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

      // Crypto can connect to: mixers, effects, sampler
      if (sourceType === "crypto") {
        const isMixer = targetType === "mixer" || (typeof targetType === "string" && targetType.startsWith("mixer-"));
        const valid = isMixer || targetType === "sampler" || EFFECT_TYPES.includes(targetType);
        console.log("Crypto connection valid:", valid);
        return valid;
      }

      // Sampler can connect to: mixers, effects
      if (sourceType === "sampler") {
        const isMixer = targetType === "mixer" || (typeof targetType === "string" && targetType.startsWith("mixer-"));
        const valid = isMixer || EFFECT_TYPES.includes(targetType);
        console.log("Sampler connection valid:", valid);
        return valid;
      }

      // Sequencer can connect to: crypto, sampler (to trigger them)
      if (sourceType === "sequencer") {
        const valid = targetType === "crypto" || targetType === "sampler";
        console.log("Sequencer connection valid:", valid);
        return valid;
      }

      // Effects can connect to: mixers, other effects, visualizer
      if (EFFECT_TYPES.includes(sourceType)) {
        const isMixer = targetType === "mixer" || (typeof targetType === "string" && targetType.startsWith("mixer-"));
        const valid = isMixer || targetType === "visualizer" || EFFECT_TYPES.includes(targetType);
        console.log("Effect connection valid:", valid);
        return valid;
      }

      // Mixers can connect to: visualizer, effects, outputs
      if (sourceType === "mixer" || (typeof sourceType === "string" && sourceType.startsWith("mixer-"))) {
        const isOutput = targetType === "output-speakers" || targetType === "output-headphones";
        const valid = targetType === "visualizer" || EFFECT_TYPES.includes(targetType) || isOutput;
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
        connectedTo: null,
        scale: "major",
        rootNote: "C",
        octave: 4,
      },
    };

    setNodes((nds) => [...nds, newNode]);

    toast({
      title: "Module added",
      description: `${crypto.name} added to canvas. Connect it to hear sound.`,
    });
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

  // Generic remove for any module
  const removeNode = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    // Stop crypto oscillators if needed
    if (node && node.data.type === "crypto") {
      const data = node.data;
      if (data.oscillator) {
        data.oscillator.stop();
        data.oscillator.disconnect();
      }
    }

    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  };
  const startSound = (nodeId: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId && node.data.type === "crypto") {
          const data = node.data;
          if (data.oscillator) return node;

          const audioNodes = audioEngine.createOscillator(
            data.crypto, 
            data.waveform,
            data.scale,
            data.rootNote,
            data.octave
          );
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

  const togglePlay = (mixerId: string) => {
    const mixerNode = nodes.find((n) => n.id === mixerId);
    if (!mixerNode) return;

    const mixerIsPlaying = mixerNode.data.isPlaying;

    if (mixerIsPlaying) {
      // Stop this mixer
      setNodes((nds) =>
        nds.map((n) =>
          n.id === mixerId
            ? { ...n, data: { ...n.data, isPlaying: false } }
            : n
        )
      );
      
      // Check if any other mixers are still playing
      const anyMixerPlaying = nodes.some(
        (n) => n.id !== mixerId && 
        (n.data.type === "mixer" || (typeof n.data.type === "string" && n.data.type.startsWith("mixer-"))) && 
        n.data.isPlaying
      );
      
      if (!anyMixerPlaying) {
        // Stop all crypto sources and suspend audio context
        nodes.forEach((node) => {
          if (node.data.type === "crypto") {
            stopSound(node.id);
          }
        });
        audioEngine.suspend();
        setIsPlaying(false);
      }
    } else {
      // Start this mixer
      audioEngine.resume();
      
      // Start all crypto sources if not already playing
      nodes.forEach((node) => {
        if (node.data.type === "crypto" && !node.data.isPlaying) {
          startSound(node.id);
        }
      });
      
      setIsPlaying(true);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === mixerId
            ? { ...n, data: { ...n.data, isPlaying: true } }
            : n
        )
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
    } else if (type === "sequencer") {
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
          intervalId: null,
        },
      };
    } else if (type.startsWith("mixer-")) {
      const trackCount = parseInt(type.split("-")[1]);
      const ctx = audioEngine.getContext();
      
      // Create Web Audio nodes for mixer
      let channelGains: GainNode[] = [];
      let channelPanners: StereoPannerNode[] = [];
      let mergerNode: AudioNode | null = null;
      let mixGain: GainNode | null = null;
      
      if (ctx) {
        // Create gain and pan nodes for each channel
        channelGains = Array.from({ length: trackCount }, () => {
          const gain = ctx.createGain();
          gain.gain.value = 0.8;
          return gain;
        });
        
        channelPanners = Array.from({ length: trackCount }, () => {
          const panner = ctx.createStereoPanner();
          panner.pan.value = 0;
          return panner;
        });
        
        // Create a summing bus for stereo mix
        mixGain = ctx.createGain();
        mixGain.gain.value = 1;
        
        // Connect each channel: gain -> panner -> mix bus
        channelGains.forEach((gain, i) => {
          if (channelPanners[i]) {
            gain.connect(channelPanners[i]);
            channelPanners[i].connect(mixGain!);
          }
        });
        
        // Use mixGain as the mixer output node
        mergerNode = mixGain;
      }
      
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
          channels: Array.from({ length: trackCount }, () => ({ volume: 0.8, pan: 0, muted: false })),
          channelGains,
          channelPanners,
          mergerNode,
        },
      };
    } else if (type === "output-speakers" || type === "output-headphones") {
      // Output modules will create their gain node when first connected
      newNode = {
        id,
        type,
        position: { x: 100 + nodes.length * 50, y: 100 + nodes.length * 50 },
        data: {
          type,
          volume: 1.0,
          isActive: false,
          outputGain: null, // Will be created on first connection
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
    // If changing tone parameters on a crypto module, restart oscillator
    const node = nodes.find((n) => n.id === nodeId);
    const isCryptoToneChange = node && node.data.type === "crypto" && 
      (param === "scale" || param === "rootNote" || param === "octave");
    const wasPlaying = isCryptoToneChange && node.data.isPlaying;

    if (wasPlaying) {
      stopSound(nodeId);
    }

    // Handle sequencer play/stop
    if (node?.data.type === "sequencer" && param === "isPlaying") {
      if (value) {
        // Start sequencer
        const intervalTime = (60000 / node.data.bpm) / 4; // 16th note timing
        const intervalId = window.setInterval(() => {
          setNodes((nds) => {
            const sequencerNode = nds.find((n) => n.id === nodeId && n.data.type === "sequencer");
            if (!sequencerNode) return nds;
            
            const currentStep = sequencerNode.data.currentStep;
            const nextStep = (currentStep + 1) % sequencerNode.data.steps.length;
            
            // Trigger connected modules if current step is active
            if (sequencerNode.data.steps[currentStep]) {
              setEdges((edges) => {
                // Find all edges from this sequencer
                const connectedEdges = edges.filter((e) => e.source === nodeId);
                connectedEdges.forEach((edge) => {
                  const targetNode = nds.find((n) => n.id === edge.target);
                  if (targetNode?.data.type === "crypto" && !targetNode.data.isPlaying) {
                    startSound(edge.target);
                    // Auto-stop after a short time
                    setTimeout(() => stopSound(edge.target), intervalTime * 0.9);
                  }
                });
                return edges;
              });
            }
            
            return nds.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, currentStep: nextStep } } : n
            );
          });
        }, intervalTime);
        
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, isPlaying: true, intervalId, currentStep: 0 } }
              : n
          )
        );
      } else {
        // Stop sequencer
        if (node.data.intervalId) {
          clearInterval(node.data.intervalId);
        }
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, isPlaying: false, intervalId: null, currentStep: 0 } }
              : n
          )
        );
      }
      return;
    }
    
    // Handle sequencer BPM change - restart if playing
    if (node?.data.type === "sequencer" && param === "bpm" && node.data.isPlaying) {
      if (node.data.intervalId) {
        clearInterval(node.data.intervalId);
      }
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, bpm: value, intervalId: null } } : n
        )
      );
      // Restart with new BPM
      setTimeout(() => updatePluginParameter(nodeId, "isPlaying", true), 10);
      return;
    }

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          // If updating output volume, also update the output gain node
          if ((node.data.type === "output-speakers" || node.data.type === "output-headphones") && param === "volume" && node.data.outputGain) {
            node.data.outputGain.gain.value = value;
          }
          
          if (node.data.type === "crypto") {
            return { ...node, data: { ...node.data, [param]: value } };
          } else if (node.data.type === "sampler") {
            return { ...node, data: { ...node.data, [param]: value } };
          } else if (node.data.type === "sequencer") {
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

    if (wasPlaying) {
      setTimeout(() => startSound(nodeId), 50);
    }
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
                  onScaleChange: (id: string, scale: string) => updatePluginParameter(id, "scale", scale),
                  onRootNoteChange: (id: string, note: string) => updatePluginParameter(id, "rootNote", note),
                  onOctaveChange: (id: string, octave: number) => updatePluginParameter(id, "octave", octave),
                }
              : node.data.type === "mixer"
              ? {
                  ...node.data,
                  onTogglePlay: () => togglePlay(node.id),
                  onMasterVolumeChange: handleMasterVolumeChange,
                  onToggleCollapse: toggleCollapse,
                  onRemove: removeNode,
                }
              : (typeof node.data.type === "string" && node.data.type.startsWith("mixer-"))
              ? {
                  ...node.data,
                  onTogglePlay: () => togglePlay(node.id),
                  onMasterVolumeChange: (volume: number) => {
                    setNodes((nds) =>
                      nds.map((n) => {
                        if (n.id === node.id) {
                          // Update state
                          const updated = { ...n, data: { ...n.data, masterVolume: volume } };
                          // Also apply to the mix output gain if available
                          const out = (updated.data.mergerNode as any);
                          if (out && typeof out.gain?.value === "number") {
                            out.gain.value = volume;
                          }
                          return updated;
                        }
                        return n;
                      })
                    );
                  },
                  onToggleCollapse: toggleCollapse,
                  onChannelVolumeChange: (channel: number, volume: number) => {
                    setNodes((nds) =>
                      nds.map((n) => {
                        if (n.id === node.id && n.data.channelGains && n.data.channelGains[channel]) {
                          const newChannels = [...n.data.channels];
                          newChannels[channel] = { ...newChannels[channel], volume };
                          n.data.channelGains[channel].gain.value = volume;
                          return { ...n, data: { ...n.data, channels: newChannels } };
                        }
                        return n;
                      })
                    );
                  },
                  onChannelPanChange: (channel: number, pan: number) => {
                    setNodes((nds) =>
                      nds.map((n) => {
                        if (n.id === node.id && n.data.channelPanners && n.data.channelPanners[channel]) {
                          const newChannels = [...n.data.channels];
                          newChannels[channel] = { ...newChannels[channel], pan };
                          n.data.channelPanners[channel].pan.value = pan;
                          return { ...n, data: { ...n.data, channels: newChannels } };
                        }
                        return n;
                      })
                    );
                  },
                  onChannelMuteToggle: (channel: number) => {
                    setNodes((nds) =>
                      nds.map((n) => {
                        if (n.id === node.id && n.data.channelGains && n.data.channelGains[channel]) {
                          const newChannels = [...n.data.channels];
                          const wasMuted = newChannels[channel].muted;
                          newChannels[channel] = { ...newChannels[channel], muted: !wasMuted };
                          n.data.channelGains[channel].gain.value = wasMuted ? newChannels[channel].volume : 0;
                          return { ...n, data: { ...n.data, channels: newChannels } };
                        }
                        return n;
                      })
                    );
                  },
                  onRemove: removeNode,
                }
              : node.data.type === "visualizer"
              ? { ...node.data, isPlaying, activeCryptos: cryptoCount, onToggleCollapse: toggleCollapse, onRemove: removeNode }
              : node.data.type === "sampler"
              ? {
                  ...node.data,
                  onSampleChange: (sample: string) => updatePluginParameter(node.id, "sample", sample),
                  onPitchChange: (pitch: number) => updatePluginParameter(node.id, "pitch", pitch),
                  onDecayChange: (decay: number) => updatePluginParameter(node.id, "decay", decay),
                  onToggleCollapse: toggleCollapse,
                  onRemove: removeNode,
                }
              : node.data.type === "sequencer"
              ? {
                  ...node.data,
                  onParameterChange: updatePluginParameter,
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
                  onRemove: removeNode,
                }
              : (node.data.type === "output-speakers" || node.data.type === "output-headphones")
              ? {
                  ...node.data,
                  onVolumeChange: (volume: number) => updatePluginParameter(node.id, "volume", volume),
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
