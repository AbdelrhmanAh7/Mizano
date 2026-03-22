'use client';

import { useShortcutRegistry, type ShortcutDef } from '@/lib/stores/use-shortcut-registry';
import { useEffect, useRef } from 'react';

type ShortcutOptions = Omit<ShortcutDef, 'handler'> & {
  handler: () => void;
  /** Disable the shortcut conditionally */
  disabled?: boolean;
};

/**
 * Hook that registers a keyboard shortcut on mount and cleans up on unmount.
 * Handles input/textarea/contentEditable suppression automatically.
 */
export function useKeyboardShortcut(options: ShortcutOptions) {
  const { id, keys, description, category, handler, isSequence, disabled } = options;
  const register = useShortcutRegistry((s) => s.register);
  const unregister = useShortcutRegistry((s) => s.unregister);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const keysKey = keys.join(',');
  useEffect(() => {
    if (disabled) {
      unregister(id);
      return;
    }
    register({
      id,
      keys,
      description,
      category,
      isSequence,
      handler: () => handlerRef.current(),
    });
    return () => unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, keysKey, description, category, isSequence, disabled, register, unregister]);
}

function isInputElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

/**
 * Global keyboard event listener that processes all registered shortcuts.
 * Should be rendered once at the app shell level.
 */
export function useGlobalShortcutListener() {
  const pendingSequenceRef = useRef<string | null>(null);
  const sequenceTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isInputElement(e.target)) return;

      const shortcuts = useShortcutRegistry.getState().getAll();

      // Check for modifier shortcuts first (e.g. meta+k)
      for (const shortcut of shortcuts) {
        if (shortcut.isSequence) continue;
        if (shortcut.keys.length !== 1) continue;

        const keyDef = shortcut.keys[0];
        if (keyDef.includes('+')) {
          const parts = keyDef.split('+');
          const modifier = parts[0];
          const key = parts[1];

          const modifierPressed =
            (modifier === 'meta' && (e.metaKey || e.ctrlKey)) ||
            (modifier === 'ctrl' && e.ctrlKey) ||
            (modifier === 'shift' && e.shiftKey) ||
            (modifier === 'alt' && e.altKey);

          if (modifierPressed && e.key.toLowerCase() === key.toLowerCase()) {
            e.preventDefault();
            shortcut.handler();
            return;
          }
        }
      }

      // Don't process non-modifier shortcuts if a modifier is held
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Handle sequence shortcuts (e.g. G then D)
      if (pendingSequenceRef.current) {
        const firstKey = pendingSequenceRef.current;
        pendingSequenceRef.current = null;
        clearTimeout(sequenceTimerRef.current);

        for (const shortcut of shortcuts) {
          if (!shortcut.isSequence) continue;
          if (shortcut.keys.length === 2) {
            if (
              shortcut.keys[0].toLowerCase() === firstKey.toLowerCase() &&
              shortcut.keys[1].toLowerCase() === e.key.toLowerCase()
            ) {
              e.preventDefault();
              shortcut.handler();
              return;
            }
          }
        }
        // Sequence didn't match, fall through to single-key
      }

      // Check if this key starts a sequence
      const startsSequence = shortcuts.some(
        (s) =>
          s.isSequence && s.keys.length >= 2 && s.keys[0].toLowerCase() === e.key.toLowerCase(),
      );

      if (startsSequence) {
        pendingSequenceRef.current = e.key;
        sequenceTimerRef.current = setTimeout(() => {
          pendingSequenceRef.current = null;
        }, 800);
        return;
      }

      // Single-key shortcuts (no modifier)
      for (const shortcut of shortcuts) {
        if (shortcut.isSequence) continue;
        if (shortcut.keys.length === 1 && !shortcut.keys[0].includes('+')) {
          if (shortcut.keys[0].toLowerCase() === e.key.toLowerCase()) {
            e.preventDefault();
            shortcut.handler();
            return;
          }
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      clearTimeout(sequenceTimerRef.current);
    };
  }, []);
}
