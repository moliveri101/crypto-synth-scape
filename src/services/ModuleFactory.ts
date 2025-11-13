import { CryptoData } from "@/types/crypto";
import { ModuleType, SatelliteData } from "@/types/modules";
import { CryptoModule } from "@/audio/modules/CryptoModule";
import { MixerModule } from "@/audio/modules/MixerModule";
import { EffectModule } from "@/audio/modules/EffectModule";
import { DrumsModule } from "@/audio/modules/DrumsModule";
import { SequencerModule } from "@/audio/modules/SequencerModule";
import { OutputModule } from "@/audio/modules/OutputModule";
import { SatelliteModule } from "@/audio/modules/SatelliteModule";
import { SamplerModule } from "@/audio/modules/SamplerModule";
import { AudioModule } from "@/audio/AudioModule";

const EFFECT_TYPES = [
  "reverb", "delay", "chorus", "flanger", "phaser", "pingpong-delay",
  "compressor", "limiter", "gate", "de-esser",
  "eq", "lpf", "hpf", "bandpass", "resonant-filter",
  "overdrive", "distortion", "fuzz", "bitcrusher", "tape-saturation",
  "vibrato", "tremolo", "ring-mod", "pitch-shifter", "octaver",
  "granular", "vocoder", "auto-pan", "stereo-widener"
];

/**
 * Factory for creating audio modules with standardized configuration
 */
export class ModuleFactory {
  /**
   * Create a crypto module node
   */
  createCryptoModule(ctx: AudioContext, crypto: CryptoData, nodeCount: number): any {
    const id = `crypto-${crypto.id}`;
    const cryptoModule = new CryptoModule(ctx, crypto);

    return {
      id,
      type: "crypto",
      position: { x: 100 + nodeCount * 50, y: 100 + nodeCount * 50 },
      data: {
        type: "crypto",
        crypto,
        volume: 0.6,
        waveform: "sine",
        scale: "major",
        rootNote: "C",
        octave: 4,
        pitch: 0,
        isPlaying: false,
        collapsed: false,
        audioModule: cryptoModule,
        gainNode: cryptoModule.outputNode,
      },
    };
  }

  /**
   * Create a satellite module node
   */
  createSatelliteModule(ctx: AudioContext, satellite: SatelliteData, nodeCount: number, dataUpdateCallback?: (data: { speed: number; altitude: number; latitude: number; longitude: number }) => void): any {
    const id = `satellite-${satellite.id}`;
    const satelliteModule = new SatelliteModule(ctx);
    satelliteModule.setSatellite(satellite);
    
    if (dataUpdateCallback) {
      satelliteModule.setDataUpdateCallback(dataUpdateCallback);
    }

    return {
      id,
      type: "satellite",
      position: { x: 100 + nodeCount * 50, y: 100 + nodeCount * 50 },
      data: {
        type: "satellite",
        satellite,
        volume: 0.7,
        waveform: "sine" as OscillatorType,
        isPlaying: false,
        collapsed: false,
        speed: 0,
        altitude: satellite.altitude,
        latitude: satellite.latitude,
        longitude: satellite.longitude,
        audioModule: satelliteModule,
        gainNode: satelliteModule.outputNode,
      },
    };
  }

  /**
   * Create a mixer module node
   */
  createMixerModule(ctx: AudioContext, trackCount: number, nodeCount: number): any {
    const id = `mixer-${trackCount}-${Date.now()}`;
    const mixerModule = new MixerModule(ctx, trackCount);

    return {
      id,
      type: `mixer-${trackCount}`,
      position: { x: 100 + nodeCount * 50, y: 100 + nodeCount * 50 },
      data: {
        type: `mixer-${trackCount}`,
        masterVolume: 0.85,
        isPlaying: false,
        inputCount: 0,
        collapsed: false,
        channels: Array.from({ length: trackCount }, (_, i) => mixerModule.getChannelData(i)),
        audioModule: mixerModule,
        mergerNode: mixerModule.outputNode,
        channelGains: Array.from({ length: trackCount }, (_, i) => mixerModule.getChannelInput(i)),
      },
    };
  }

  /**
   * Create an effect module node
   */
  createEffectModule(ctx: AudioContext, type: string, nodeCount: number): any {
    const id = `${type}-${Date.now()}`;
    const effectModule = new EffectModule(ctx, type);

    return {
      id,
      type,
      position: { x: 100 + nodeCount * 50, y: 100 + nodeCount * 50 },
      data: {
        type,
        intensity: 0.5,
        mix: 0.5,
        isActive: true,
        parameters: {},
        collapsed: false,
        audioModule: effectModule,
        inputNode: effectModule.inputNode,
        outputNode: effectModule.outputNode,
      },
    };
  }

  /**
   * Create a sequencer module node
   */
  createSequencerModule(ctx: AudioContext, nodeCount: number, stepCallback?: (step: number, isActive: boolean) => void): any {
    const id = `sequencer-${Date.now()}`;
    const sequencerModule = new SequencerModule(ctx);

    if (stepCallback) {
      sequencerModule.setStepCallback(stepCallback);
    }

    return {
      id,
      type: "sequencer",
      position: { x: 100 + nodeCount * 50, y: 100 + nodeCount * 50 },
      data: {
        type: "sequencer",
        bpm: 120,
        steps: Array(16).fill(false),
        currentStep: 0,
        isPlaying: false,
        collapsed: false,
        volume: 0.8,
        pitch: 0,
        audioModule: sequencerModule,
        inputNode: sequencerModule.inputNode,
        outputNode: sequencerModule.outputNode,
      },
    };
  }

  /**
   * Create a drums module node
   */
  createDrumsModule(ctx: AudioContext, nodeCount: number): any {
    const id = `drums-${Date.now()}`;
    const drumsModule = new DrumsModule(ctx);

    return {
      id,
      type: "drums",
      position: { x: 100 + nodeCount * 50, y: 100 + nodeCount * 50 },
      data: {
        type: "drums",
        selectedDrum: "kick" as const,
        volume: 0.8,
        pitch: 0,
        collapsed: false,
        audioModule: drumsModule,
        outputNode: drumsModule.outputNode,
      },
    };
  }

  /**
   * Create an output module node
   */
  createOutputModule(ctx: AudioContext, type: "output-speakers" | "output-headphones", nodeCount: number): any {
    const id = `${type}-${Date.now()}`;
    const outputModule = new OutputModule(ctx);

    return {
      id,
      type,
      position: { x: 100 + nodeCount * 50, y: 100 + nodeCount * 50 },
      data: {
        type,
        volume: 1.0,
        isActive: false,
        collapsed: false,
        audioModule: outputModule,
        outputGain: outputModule.inputNode,
      },
    };
  }

  /**
   * Create a sampler module node
   */
  createSamplerModule(ctx: AudioContext, nodeCount: number): any {
    const id = `sampler-${Date.now()}`;
    const samplerModule = new SamplerModule(ctx);

    return {
      id,
      type: "sampler",
      position: { x: 100 + nodeCount * 50, y: 100 + nodeCount * 50 },
      data: {
        type: "sampler",
        selectedPad: 0,
        pads: Array.from({ length: 8 }, (_, i) => ({
          hasSample: samplerModule.hasSample(i),
          isPlaying: samplerModule.isPadPlaying(i),
          duration: samplerModule.getPadDuration(i),
          volume: samplerModule.getPadVolume(i),
          pitch: samplerModule.getPadPitch(i),
          loop: samplerModule.getPadLoop(i),
          loopStart: samplerModule.getPadLoopStart(i),
          loopEnd: samplerModule.getPadLoopEnd(i),
        })),
        volume: samplerModule.getVolume(),
        filterFreq: samplerModule.getFilterFrequency(),
        filterRes: samplerModule.getFilterResonance(),
        collapsed: false,
        audioModule: samplerModule,
        outputNode: samplerModule.outputNode,
      },
    };
  }

  /**
   * Factory method to create any module type
   */
  createModule(ctx: AudioContext, type: ModuleType, nodeCount: number, options?: any): any {
    if (type === "sampler") {
      return this.createSamplerModule(ctx, nodeCount);
    } else if (type === "sequencer") {
      return this.createSequencerModule(ctx, nodeCount, options?.stepCallback);
    } else if (type === "drums") {
      return this.createDrumsModule(ctx, nodeCount);
    } else if (type.startsWith("mixer-")) {
      const trackCount = parseInt(type.split("-")[1]);
      return this.createMixerModule(ctx, trackCount, nodeCount);
    } else if (type === "output-speakers" || type === "output-headphones") {
      return this.createOutputModule(ctx, type, nodeCount);
    } else if (EFFECT_TYPES.includes(type)) {
      return this.createEffectModule(ctx, type, nodeCount);
    }

    // Fallback for unknown types
    return {
      id: `${type}-${Date.now()}`,
      type,
      position: { x: 100 + nodeCount * 50, y: 100 + nodeCount * 50 },
      data: {
        type,
        collapsed: false,
      },
    };
  }
}

export const moduleFactory = new ModuleFactory();
