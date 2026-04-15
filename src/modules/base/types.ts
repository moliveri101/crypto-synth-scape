import { ComponentType } from "react";

// ─── Stereo config ──────────────────────────────────────────────────────────
export const STEREO_CHANNELS = 2;
export const CHANNEL_MODE: ChannelCountMode = "explicit";
export const CHANNEL_INTERP: ChannelInterpretation = "speakers";
export const RAMP_TIME = 0.01; // 10ms default ramp for click-free transitions

// ─── Module categories ──────────────────────────────────────────────────────
export type ModuleCategory = "source" | "effect" | "processor" | "output";

// ─── Standardised props every module UI component receives ──────────────────
export interface ModuleNodeProps {
  id: string;
  data: Record<string, any> & {
    type: string;
    collapsed?: boolean;
  };
}

// ─── Callbacks injected by the framework into every module node ─────────────
export interface ModuleCallbacks {
  onRemove: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onUpdateParameter: (id: string, param: string, value: any) => void;
  onAction: (id: string, action: string, payload?: any) => any;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
}

// ─── Module descriptor — the single unit of registration ────────────────────
export interface ModuleDescriptor {
  /** Unique type key, e.g. "crypto", "reverb", "mixer-4" */
  type: string;
  /** Category for toolbar grouping and routing rules */
  category: ModuleCategory;
  /** Human-readable label shown in the UI */
  label: string;
  /** Optional icon name from lucide-react */
  icon?: string;
  /** Accent colour class for the module card border/glow */
  color?: string;

  /** Whether this module type accepts input connections */
  hasInput: boolean;
  /** Whether this module type provides output connections */
  hasOutput: boolean;

  /** Build the default node data for a new instance of this module */
  defaultData: (extra?: Record<string, any>) => Record<string, any>;

  /** Create the audio-engine instance for this module */
  createAudio: (ctx: AudioContext, data: Record<string, any>) => import("./AudioModule").AudioModule;

  /** React component used to render this module node */
  component: ComponentType<any>;

  /** Optional: number of named input handles (for mixers). Default = 1 if hasInput. */
  inputHandles?: (data: Record<string, any>) => Array<{ id: string; label?: string }>;

  /**
   * Optional: per-field output handles (for data sources like Vitals).
   * Each handle id should be of the form `out-<fieldName>` so the AudioRouter
   * can filter `getDataOutput()` to that single field when forwarding data.
   */
  outputHandles?: (data: Record<string, any>) => Array<{ id: string; label?: string }>;
}

// ─── Shared data fields present on every module node ────────────────────────
export interface BaseModuleData {
  type: string;
  collapsed: boolean;
  isPlaying: boolean;
}
