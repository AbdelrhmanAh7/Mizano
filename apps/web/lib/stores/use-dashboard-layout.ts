'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/lib/api';

export interface DashboardWidget {
  id: string;
  label: string;
  visible: boolean;
  order: number;
}

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'ai-pulse', label: 'AI Business Pulse', visible: true, order: 0 },
  {
    id: 'kpi-row-1',
    label: 'KPI Row 1 (Revenue, Expenses, Profit, Balance)',
    visible: true,
    order: 1,
  },
  {
    id: 'kpi-row-2',
    label: 'KPI Row 2 (Receivables, Payables, Overdue, Projects)',
    visible: true,
    order: 2,
  },
  { id: 'ai-forecast', label: 'AI Forecast Charts', visible: true, order: 3 },
  { id: 'cash-flow-revenue', label: 'Cash Flow & Revenue', visible: true, order: 4 },
  { id: 'ar-ap-expenses', label: 'AR/AP & Expenses', visible: true, order: 5 },
  { id: 'profit-customers', label: 'Profit Margin & Top Customers', visible: true, order: 6 },
  { id: 'bank-inventory', label: 'Bank Balance & Inventory Value', visible: true, order: 7 },
  {
    id: 'insights-transactions',
    label: 'AI Insights & Recent Transactions',
    visible: true,
    order: 8,
  },
  {
    id: 'projects-bank-accounts',
    label: 'Projects & Bank Accounts',
    visible: true,
    order: 9,
  },
];

interface DashboardLayoutState {
  widgets: DashboardWidget[];
  isEditing: boolean;
  activeTab: string;
  setWidgets: (widgets: DashboardWidget[]) => void;
  toggleWidget: (id: string) => void;
  moveWidget: (id: string, direction: 'up' | 'down') => void;
  resetLayout: () => void;
  setEditing: (editing: boolean) => void;
  setActiveTab: (tab: string) => void;
  saveToServer: () => Promise<void>;
  loadFromServer: () => Promise<void>;
}

export const useDashboardLayout = create<DashboardLayoutState>()(
  persist(
    (set, get) => ({
      widgets: DEFAULT_WIDGETS,
      isEditing: false,
      activeTab: 'overview',
      setWidgets: (widgets) => set({ widgets }),
      toggleWidget: (id) =>
        set((state) => ({
          widgets: state.widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)),
        })),
      moveWidget: (id, direction) =>
        set((state) => {
          const widgets = [...state.widgets].sort((a, b) => a.order - b.order);
          const index = widgets.findIndex((w) => w.id === id);
          if (index === -1) return state;
          const newIndex = direction === 'up' ? index - 1 : index + 1;
          if (newIndex < 0 || newIndex >= widgets.length) return state;
          // Swap orders
          const temp = widgets[index].order;
          widgets[index] = { ...widgets[index], order: widgets[newIndex].order };
          widgets[newIndex] = { ...widgets[newIndex], order: temp };
          return { widgets };
        }),
      resetLayout: () => set({ widgets: DEFAULT_WIDGETS }),
      setEditing: (editing) => set({ isEditing: editing }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      saveToServer: async () => {
        const { widgets } = get();
        try {
          await api.put('/user/preferences/dashboard-layout', {
            widgets: widgets.map(({ id, visible, order }) => ({ id, visible, order })),
          });
        } catch {
          // Silently fail — localStorage is the primary store
        }
      },
      loadFromServer: async () => {
        try {
          const res = await api.get('/user/preferences/dashboard-layout');
          if (res.data?.widgets?.length) {
            const serverWidgets = res.data.widgets;
            // Merge server data with local labels
            const merged = DEFAULT_WIDGETS.map((dw) => {
              const sw = serverWidgets.find(
                (s: { id: string; visible: boolean; order: number }) => s.id === dw.id,
              );
              return sw ? { ...dw, visible: sw.visible, order: sw.order } : dw;
            });
            set({ widgets: merged });
          }
        } catch {
          // Use local defaults
        }
      },
    }),
    {
      name: 'mizano-dashboard-layout',
      partialize: (state) => ({ widgets: state.widgets }),
    },
  ),
);
