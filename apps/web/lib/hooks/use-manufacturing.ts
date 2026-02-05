import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export type BOMStatus = 'ACTIVE' | 'INACTIVE';
export type WorkOrderStatus = 'DRAFT' | 'IN_PROCESS' | 'COMPLETED' | 'CANCELLED';

export interface BOMComponent {
  id: string;
  itemId: string;
  itemName?: string;
  itemCode?: string;
  quantity: number;
  unit?: string;
  bomId?: string; // For nested BOMs (sub-assemblies)
}

export interface BOM {
  id: string;
  name: string;
  outputItemId: string;
  outputItem?: {
    id: string;
    name: string;
    code: string;
  };
  outputQuantity: number;
  components: BOMComponent[];
  operationsCost: number | string;
  isActive: boolean;
  status: BOMStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialRequirement {
  itemId: string;
  itemName: string;
  itemCode: string;
  required: number;
  available: number;
  shortage: number;
  unit: string;
}

export interface WorkOrder {
  id: string;
  workOrderNumber: string;
  bomId: string;
  bom?: BOM;
  outputItemId: string;
  outputItem?: {
    id: string;
    name: string;
    code: string;
  };
  quantity: number;
  startDate: string;
  dueDate?: string;
  completedQuantity?: number;
  completedAt?: string;
  status: WorkOrderStatus;
  materialRequirements?: MaterialRequirement[];
  stockAlerts?: MaterialRequirement[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ============ API Functions ============

const bomApi = {
  list: async (params?: { status?: string; search?: string }) => {
    const response = await api.get('/manufacturing/bom', { params });
    return response.data;
  },
  get: async (id: string) => {
    const response = await api.get(`/manufacturing/bom/${id}`);
    return response.data;
  },
  create: async (data: Partial<BOM>) => {
    const response = await api.post('/manufacturing/bom', data);
    return response.data;
  },
  update: async ({ id, data }: { id: string; data: Partial<BOM> }) => {
    const response = await api.patch(`/manufacturing/bom/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/manufacturing/bom/${id}`);
    return response.data;
  },
  calculateRequirements: async (id: string, quantity: number) => {
    const response = await api.get(`/manufacturing/bom/${id}/requirements`, {
      params: { quantity },
    });
    return response.data;
  },
};

const workOrderApi = {
  list: async (params?: { status?: string; search?: string }) => {
    const response = await api.get('/manufacturing/work-orders', { params });
    return response.data;
  },
  get: async (id: string) => {
    const response = await api.get(`/manufacturing/work-orders/${id}`);
    return response.data;
  },
  create: async (data: Partial<WorkOrder>) => {
    const response = await api.post('/manufacturing/work-orders', data);
    return response.data;
  },
  update: async ({ id, data }: { id: string; data: Partial<WorkOrder> }) => {
    const response = await api.patch(`/manufacturing/work-orders/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/manufacturing/work-orders/${id}`);
    return response.data;
  },
  start: async (id: string) => {
    const response = await api.post(`/manufacturing/work-orders/${id}/start`);
    return response.data;
  },
  complete: async (id: string, producedQuantity: number) => {
    const response = await api.post(`/manufacturing/work-orders/${id}/complete`, {
      producedQuantity,
    });
    return response.data;
  },
  cancel: async (id: string) => {
    const response = await api.post(`/manufacturing/work-orders/${id}/cancel`);
    return response.data;
  },
};

// ============ Hooks - BOMs ============

export function useBOMs(params?: { status?: string; search?: string }) {
  return useQuery({
    queryKey: ['boms', params],
    queryFn: () => bomApi.list(params),
  });
}

export function useBOM(id: string) {
  return useQuery({
    queryKey: ['boms', id],
    queryFn: () => bomApi.get(id),
    enabled: !!id,
  });
}

export function useCreateBOM() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: bomApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boms'] });
    },
  });
}

export function useUpdateBOM() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: bomApi.update,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['boms'] });
      queryClient.invalidateQueries({ queryKey: ['boms', variables.id] });
    },
  });
}

export function useDeleteBOM() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: bomApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boms'] });
    },
  });
}

export function useBOMRequirements(id: string, quantity: number) {
  return useQuery({
    queryKey: ['boms', id, 'requirements', quantity],
    queryFn: () => bomApi.calculateRequirements(id, quantity),
    enabled: !!id && quantity > 0,
  });
}

// ============ Hooks - Work Orders ============

export function useWorkOrders(params?: { status?: string; search?: string }) {
  return useQuery({
    queryKey: ['work-orders', params],
    queryFn: () => workOrderApi.list(params),
  });
}

export function useWorkOrder(id: string) {
  return useQuery({
    queryKey: ['work-orders', id],
    queryFn: () => workOrderApi.get(id),
    enabled: !!id,
  });
}

export function useCreateWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workOrderApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    },
  });
}

export function useUpdateWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workOrderApi.update,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders', variables.id] });
    },
  });
}

export function useDeleteWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workOrderApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    },
  });
}

export function useStartWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workOrderApi.start,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders', id] });
    },
  });
}

export function useCompleteWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, producedQuantity }: { id: string; producedQuantity: number }) =>
      workOrderApi.complete(id, producedQuantity),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useCancelWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workOrderApi.cancel,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders', id] });
    },
  });
}

// ============ Helper Functions ============

export function getBOMStatusLabel(status: BOMStatus): string {
  const labels: Record<BOMStatus, string> = {
    ACTIVE: 'Active',
    INACTIVE: 'Inactive',
  };
  return labels[status] || status;
}

export function getBOMStatusColor(status: BOMStatus): string {
  const colors: Record<BOMStatus, string> = {
    ACTIVE: 'bg-green-100 text-green-800 border-green-200',
    INACTIVE: 'bg-gray-100 text-gray-800 border-gray-200',
  };
  return colors[status] || '';
}

export function getWorkOrderStatusLabel(status: WorkOrderStatus): string {
  const labels: Record<WorkOrderStatus, string> = {
    DRAFT: 'Draft',
    IN_PROCESS: 'In Process',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  };
  return labels[status] || status;
}

export function getWorkOrderStatusColor(status: WorkOrderStatus): string {
  const colors: Record<WorkOrderStatus, string> = {
    DRAFT: 'bg-gray-100 text-gray-800 border-gray-200',
    IN_PROCESS: 'bg-blue-100 text-blue-800 border-blue-200',
    COMPLETED: 'bg-green-100 text-green-800 border-green-200',
    CANCELLED: 'bg-red-100 text-red-800 border-red-200',
  };
  return colors[status] || '';
}

export function formatCurrency(amount: number | string | undefined): string {
  if (amount === undefined || amount === null) return '$0.00';
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(numAmount);
}
