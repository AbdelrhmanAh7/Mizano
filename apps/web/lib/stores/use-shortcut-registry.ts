import { create } from 'zustand';

export interface ShortcutDef {
  id: string;
  keys: string[]; // e.g. ['g', 'd'] for G then D, or ['meta+k'] for Cmd+K
  description: string;
  category: 'navigation' | 'actions' | 'general';
  handler: () => void;
  /** If true, the shortcut is a sequence (e.g. G then D), not simultaneous */
  isSequence?: boolean;
}

interface ShortcutRegistryState {
  shortcuts: Map<string, ShortcutDef>;
  register: (def: ShortcutDef) => void;
  unregister: (id: string) => void;
  getAll: () => ShortcutDef[];
  getByCategory: (category: ShortcutDef['category']) => ShortcutDef[];
}

export const isMac =
  typeof navigator !== 'undefined' ? /Mac|iPod|iPhone|iPad/.test(navigator.userAgent) : true;

export const modifierSymbol = isMac ? '⌘' : 'Ctrl';

export const useShortcutRegistry = create<ShortcutRegistryState>((set, get) => ({
  shortcuts: new Map(),

  register: (def) =>
    set((state) => {
      const next = new Map(state.shortcuts);
      next.set(def.id, def);
      return { shortcuts: next };
    }),

  unregister: (id) =>
    set((state) => {
      const next = new Map(state.shortcuts);
      next.delete(id);
      return { shortcuts: next };
    }),

  getAll: () => Array.from(get().shortcuts.values()),

  getByCategory: (category) =>
    Array.from(get().shortcuts.values()).filter((s) => s.category === category),
}));
