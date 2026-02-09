'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  LogEntry,
  LogLevel,
  LogSource,
  LogCategory,
  LogStatus,
  LogFilter,
  LogStats,
} from '@mizano/shared-types';

interface LoggerState {
  logs: LogEntry[];
  stats: LogStats | null;
  filter: LogFilter;
  selectedIds: string[];
  isOpen: boolean;

  // Actions
  addLog: (log: LogEntry) => void;
  setLogs: (logs: LogEntry[]) => void;
  setStats: (stats: LogStats) => void;
  setFilter: (filter: Partial<LogFilter>) => void;
  resetFilter: () => void;
  selectLog: (id: string) => void;
  deselectLog: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  toggleSelection: (id: string) => void;
  removeLogs: (ids: string[]) => void;
  updateLogStatus: (ids: string[], status: LogStatus) => void;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const DEFAULT_FILTER: LogFilter = {};

export const useLoggerStore = create<LoggerState>()(
  persist(
    (set, get) => ({
      logs: [],
      stats: null,
      filter: DEFAULT_FILTER,
      selectedIds: [],
      isOpen: false,

      addLog: (log) =>
        set((state) => {
          const existing = state.logs.findIndex((l) => l.id === log.id);
          if (existing >= 0) {
            const updated = [...state.logs];
            updated[existing] = log;
            return { logs: updated };
          }
          return { logs: [log, ...state.logs].slice(0, 5000) };
        }),

      setLogs: (logs) => set({ logs }),

      setStats: (stats) => set({ stats }),

      setFilter: (filter) =>
        set((state) => ({
          filter: { ...state.filter, ...filter },
        })),

      resetFilter: () => set({ filter: DEFAULT_FILTER }),

      selectLog: (id) =>
        set((state) => ({
          selectedIds: state.selectedIds.includes(id)
            ? state.selectedIds
            : [...state.selectedIds, id],
        })),

      deselectLog: (id) =>
        set((state) => ({
          selectedIds: state.selectedIds.filter((i) => i !== id),
        })),

      selectAll: () =>
        set((state) => ({
          selectedIds: state.logs.map((l) => l.id),
        })),

      deselectAll: () => set({ selectedIds: [] }),

      toggleSelection: (id) =>
        set((state) => ({
          selectedIds: state.selectedIds.includes(id)
            ? state.selectedIds.filter((i) => i !== id)
            : [...state.selectedIds, id],
        })),

      removeLogs: (ids) =>
        set((state) => ({
          logs: state.logs.filter((l) => !ids.includes(l.id)),
          selectedIds: state.selectedIds.filter((id) => !ids.includes(id)),
        })),

      updateLogStatus: (ids, status) =>
        set((state) => ({
          logs: state.logs.map((l) =>
            ids.includes(l.id)
              ? {
                  ...l,
                  status,
                  hasTestCoverage: status === LogStatus.TEST_COVERED ? true : l.hasTestCoverage,
                }
              : l,
          ),
        })),

      setOpen: (open) => set({ isOpen: open }),
      toggle: () => set((state) => ({ isOpen: !state.isOpen })),
    }),
    {
      name: 'mizano-logger',
      partialize: (state) => ({
        filter: state.filter,
        isOpen: state.isOpen,
      }),
    },
  ),
);
