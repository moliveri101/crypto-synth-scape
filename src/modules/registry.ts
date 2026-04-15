import { ModuleDescriptor, ModuleCategory } from "./base/types";

const registry = new Map<string, ModuleDescriptor>();

/** Register a module descriptor. Call once per module type at import time. */
export function registerModule(descriptor: ModuleDescriptor): void {
  if (registry.has(descriptor.type)) {
    console.warn(`Module "${descriptor.type}" is already registered — overwriting.`);
  }
  registry.set(descriptor.type, descriptor);
}

/** Look up a single descriptor by its type key. */
export function getDescriptor(type: string): ModuleDescriptor | undefined {
  return registry.get(type);
}

/** Return all registered descriptors. */
export function getAllDescriptors(): ModuleDescriptor[] {
  return [...registry.values()];
}

/** Return descriptors filtered by category. */
export function getByCategory(category: ModuleCategory): ModuleDescriptor[] {
  return getAllDescriptors().filter((d) => d.category === category);
}

/** Check whether a type string is registered. */
export function isRegistered(type: string): boolean {
  return registry.has(type);
}

/** Build the ReactFlow nodeTypes map dynamically from the registry. */
export function buildNodeTypes(): Record<string, React.ComponentType<any>> {
  const types: Record<string, React.ComponentType<any>> = {};
  for (const desc of registry.values()) {
    types[desc.type] = desc.component;
  }
  return types;
}
