'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';

interface UseFormAutoSaveOptions<T> {
  key: string;
  data: T;
  enabled?: boolean;
  debounceMs?: number;
  onRestore?: (data: T) => void;
}

interface UseFormAutoSaveReturn {
  hasDraft: boolean;
  restoreDraft: () => void;
  clearDraft: () => void;
}

function getStorageKey(key: string): string {
  return `mizano-form-draft:${key}`;
}

export function useFormAutoSave<T>({
  key,
  data,
  enabled = true,
  debounceMs = 30000,
  onRestore,
}: UseFormAutoSaveOptions<T>): UseFormAutoSaveReturn {
  const { toast } = useToast();
  const storageKey = getStorageKey(key);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const onRestoreRef = useRef(onRestore);
  const dataRef = useRef(data);

  // Keep refs up to date without triggering effects
  useEffect(() => {
    onRestoreRef.current = onRestore;
  }, [onRestore]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Check for existing draft on mount
  const [hasDraft, setHasDraft] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const saved = localStorage.getItem(storageKey);
      return saved !== null;
    } catch {
      return false;
    }
  });

  // Auto-save with debounce
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(data));
      } catch {
        // localStorage full or unavailable — silently ignore
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, enabled, debounceMs, storageKey]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const restoreDraft = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as T;
        onRestoreRef.current?.(parsed);
        setHasDraft(false);
        toast({
          title: 'Draft restored',
          description: 'Your previously saved form data has been restored.',
        });
      }
    } catch {
      // Corrupted data — clear it
      localStorage.removeItem(storageKey);
      setHasDraft(false);
    }
  }, [storageKey, toast]);

  const clearDraft = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Silently ignore
    }
    setHasDraft(false);
  }, [storageKey]);

  return { hasDraft, restoreDraft, clearDraft };
}
