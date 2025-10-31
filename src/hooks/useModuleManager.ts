import { useCallback } from "react";
import { audioContextManager } from "@/audio/AudioContextManager";
import { AudioModule } from "@/audio/AudioModule";
import { CryptoModule } from "@/audio/modules/CryptoModule";
import { SatelliteModule } from "@/audio/modules/SatelliteModule";
import { DrumsModule } from "@/audio/modules/DrumsModule";
import { MixerModule } from "@/audio/modules/MixerModule";
import { moduleFactory } from "@/services/ModuleFactory";
import { CryptoData } from "@/types/crypto";
import { ModuleType, SatelliteData } from "@/types/modules";

const EFFECT_TYPES = [
  "reverb", "delay", "chorus", "flanger", "phaser", "pingpong-delay",
  "compressor", "limiter", "gate", "de-esser",
  "eq", "lpf", "hpf", "bandpass", "resonant-filter",
  "overdrive", "distortion", "fuzz", "bitcrusher", "tape-saturation",
  "vibrato", "tremolo", "ring-mod", "pitch-shifter", "octaver",
  "granular", "vocoder", "auto-pan", "stereo-widener"
];

/**
 * Hook for managing module state and operations
 */
export const useModuleManager = (
  nodes: any[],
  setNodes: (nodes: any[] | ((nodes: any[]) => any[])) => void,
  setEdges: (edges: any[] | ((edges: any[]) => any[])) => void
) => {
  /**
   * Add a crypto module
   */
  const addCryptoModule = useCallback((crypto: CryptoData) => {
    const id = `crypto-${crypto.id}`;

    if (nodes.find((n) => n.id === id)) {
      return { success: false, message: `${crypto.name} module is already on the canvas` };
    }

    const ctx = audioContextManager.getContext();
    if (!ctx) return { success: false, message: "Audio context not available" };

    const newNode = moduleFactory.createCryptoModule(ctx, crypto, nodes.length);
    setNodes((nds) => [...nds, newNode]);

    return { success: true, message: `${crypto.name} added to canvas` };
  }, [nodes, setNodes]);

  /**
   * Add a satellite module
   */
  const addSatelliteModule = useCallback((satellite: SatelliteData) => {
    const id = `satellite-${satellite.id}`;

    if (nodes.find((n) => n.id === id)) {
      return { success: false, message: `${satellite.name} module is already on the canvas` };
    }

    const ctx = audioContextManager.getContext();
    if (!ctx) return { success: false, message: "Audio context not available" };

    // Create callback to update node data with satellite values
    const dataUpdateCallback = (data: { speed: number; altitude: number; latitude: number; longitude: number }) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? { ...n, data: { ...n.data, ...data } }
            : n
        )
      );
    };

    const newNode = moduleFactory.createSatelliteModule(ctx, satellite, nodes.length, dataUpdateCallback);
    setNodes((nds) => [...nds, newNode]);

    return { success: true, message: `${satellite.name} added to canvas` };
  }, [nodes, setNodes]);

  /**
   * Add a plugin module
   */
  const addPluginModule = useCallback((type: ModuleType) => {
    const ctx = audioContextManager.getContext();
    if (!ctx) return { success: false, message: "Audio context not available" };

    let newNode: any;

    if (type === "sequencer") {
      // Set up step callback for sequencer
      const stepCallback = (step: number, isActive: boolean) => {
        setNodes((nds) =>
          nds.map((n) => {
            if (n.data.audioModule instanceof AudioModule && (n.data.audioModule as any).setStepCallback) {
              return { ...n, data: { ...n.data, currentStep: step } };
            }
            return n;
          })
        );
      };
      newNode = moduleFactory.createModule(ctx, type, nodes.length, { stepCallback });
    } else {
      newNode = moduleFactory.createModule(ctx, type, nodes.length);
    }

    setNodes((nds) => [...nds, newNode]);
    return { success: true, message: `${type} module added` };
  }, [nodes.length, setNodes]);

  /**
   * Remove a module
   */
  const removeModule = useCallback((id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (node && node.data.audioModule) {
      const module = node.data.audioModule as AudioModule;
      module.dispose();
    }

    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  }, [nodes, setNodes, setEdges]);

  /**
   * Start a crypto module
   */
  const startModule = useCallback((nodeId: string) => {
    audioContextManager.resume();

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId && node.data.type === "crypto") {
          const module = node.data.audioModule as CryptoModule;
          if (module) {
            module.start();
          }
          return { ...node, data: { ...node.data, isPlaying: true } };
        }
        return node;
      })
    );
  }, [setNodes]);

  /**
   * Stop a crypto module
   */
  const stopModule = useCallback((nodeId: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId && node.data.type === "crypto") {
          const module = node.data.audioModule as CryptoModule;
          if (module) {
            module.stop();
          }
          return { ...node, data: { ...node.data, isPlaying: false } };
        }
        return node;
      })
    );
  }, [setNodes]);

  /**
   * Update a module parameter
   */
  const updateParameter = useCallback((nodeId: string, param: string, value: any) => {
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
  }, [nodes, setNodes]);

  /**
   * Toggle collapse state
   */
  const toggleCollapse = useCallback((nodeId: string) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, collapsed: !node.data.collapsed } }
          : node
      )
    );
  }, [setNodes]);

  /**
   * Trigger a drum sound
   */
  const triggerDrum = useCallback((nodeId: string) => {
    const drumNode = nodes.find((n) => n.id === nodeId);
    if (drumNode?.data.audioModule) {
      audioContextManager.resume();
      const module = drumNode.data.audioModule as DrumsModule;
      module.trigger();
    }
  }, [nodes]);

  /**
   * Update mixer channel parameter
   */
  const updateMixerChannel = useCallback((mixerId: string, channel: number, param: string, value: any) => {
    updateParameter(mixerId, `channel_${channel}_${param}`, value);
  }, [updateParameter]);

  return {
    addCryptoModule,
    addSatelliteModule,
    addPluginModule,
    removeModule,
    startModule,
    stopModule,
    updateParameter,
    toggleCollapse,
    triggerDrum,
    updateMixerChannel,
  };
};
