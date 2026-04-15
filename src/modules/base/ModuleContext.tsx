import { createContext, useContext } from "react";

export interface ModuleActions {
  onRemove: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onUpdateParameter: (id: string, param: string, value: any) => void;
  onAction: (id: string, action: string, payload?: any) => any;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
}

const ModuleContext = createContext<ModuleActions | null>(null);

export const ModuleProvider = ModuleContext.Provider;

export function useModuleActions(): ModuleActions {
  const ctx = useContext(ModuleContext);
  if (!ctx) throw new Error("useModuleActions must be used inside ModuleProvider");
  return ctx;
}
