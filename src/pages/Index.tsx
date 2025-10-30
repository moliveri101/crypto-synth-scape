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
import ModuleToolbar from "@/components/ModuleToolbar";
import { useToast } from "@/hooks/use-toast";

const nodeTypes = {
  crypto: CryptoModuleNode,
  mixer: MixerModuleNode,
  visualizer: VisualizerModuleNode,
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
      },
    };

    // Connect mixer to visualizer
    const defaultEdge: Edge = {
      id: "mixer-visualizer",
      source: "mixer",
      target: "visualizer",
      animated: true,
      style: { stroke: "hsl(188, 95%, 58%)", strokeWidth: 2 },
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

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      const edge = {
        ...params,
        animated: true,
        style: { stroke: "hsl(188, 95%, 58%)", strokeWidth: 2 },
      };
      setEdges((eds) => addEdge(edge, eds));
    },
    [setEdges]
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
      },
    };

    setNodes((nds) => [...nds, newNode]);

    // Auto-connect to mixer
    const newEdge: Edge = {
      id: `${id}-mixer`,
      source: id,
      target: "mixer",
      animated: true,
      style: { stroke: "hsl(188, 95%, 58%)", strokeWidth: 2 },
    };
    setEdges((eds) => [...eds, newEdge]);

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

  const cryptoCount = nodes.filter((n) => n.data.type === "crypto").length;

  return (
    <div className="w-full h-screen bg-background">
      <ModuleToolbar onAddCrypto={addCryptoModule} />

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
                }
              : node.data.type === "mixer"
              ? {
                  ...node.data,
                  onTogglePlay: togglePlay,
                  onMasterVolumeChange: handleMasterVolumeChange,
                }
              : node.data.type === "visualizer"
              ? { ...node.data, isPlaying, activeCryptos: cryptoCount }
              : node.data,
        }))}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
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
