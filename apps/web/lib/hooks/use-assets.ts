import api from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// ============ Types ============

export type AssetType =
  | 'ELECTRONICS'
  | 'FURNITURE'
  | 'VEHICLES'
  | 'MACHINERY'
  | 'BUILDINGS'
  | 'OTHER';
export type DepreciationMethod = 'STRAIGHT_LINE' | 'DECLINING_BALANCE';
export type AssetStatus = 'ACTIVE' | 'DISPOSED' | 'FULLY_DEPRECIATED';

export interface Asset {
  id: string;
  assetNumber: string;
  name: string;
  description?: string;
  assetType: AssetType;
  purchaseDate: string;
  purchasePrice: number;
  salvageValue: number;
  usefulLifeYears: number;
  depreciationMethod: DepreciationMethod;
  monthlyDepreciation: number;
  accumulatedDepreciation: number;
  currentBookValue: number;
  status: AssetStatus;
  disposalDate?: string;
  disposalAmount?: number;
  disposalGainLoss?: number;
  assetAccountId: string;
  depreciationAccountId: string;
  accumulatedDeprAccountId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DepreciationScheduleItem {
  id: string;
  assetId: string;
  month: number;
  year: number;
  amount: number;
  accumulatedTotal: number;
  bookValue: number;
  journalId?: string;
  executedAt?: string;
}

export interface CreateAssetDto {
  name: string;
  description?: string;
  assetType: AssetType;
  purchaseDate: string;
  purchasePrice: number;
  salvageValue: number;
  usefulLifeYears: number;
  depreciationMethod?: DepreciationMethod;
  assetAccountId: string;
  depreciationAccountId: string;
  accumulatedDeprAccountId: string;
}

export interface UpdateAssetDto {
  name?: string;
  description?: string;
  assetType?: AssetType;
  salvageValue?: number;
  usefulLifeYears?: number;
}

export interface DisposeAssetDto {
  disposalDate: string;
  disposalAmount: number;
}

export interface AssetSummary {
  totalAssets: number;
  totalValue: number;
  totalAccumulatedDepreciation: number;
  totalBookValue: number;
  byType: Record<AssetType, { count: number; value: number }>;
  byStatus: Record<AssetStatus, number>;
}

// ============ API Functions ============

const assetsApi = {
  getAll: async (params?: {
    status?: AssetStatus;
    assetType?: AssetType;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get('/assets', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/assets/${id}`);
    return response.data;
  },
  create: async (data: CreateAssetDto) => {
    const response = await api.post('/assets', data);
    return response.data;
  },
  update: async (id: string, data: UpdateAssetDto) => {
    const response = await api.put(`/assets/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/assets/${id}`);
    return response.data;
  },
  dispose: async (id: string, data: DisposeAssetDto) => {
    const response = await api.post(`/assets/${id}/dispose`, data);
    return response.data;
  },
  getDepreciationSchedule: async (id: string) => {
    const response = await api.get(`/assets/${id}/schedule`);
    return response.data;
  },
  runMonthlyDepreciation: async () => {
    const response = await api.post('/assets/run-depreciation');
    return response.data;
  },
  getSummary: async () => {
    const response = await api.get('/assets/summary');
    return response.data;
  },
  recalculateSchedule: async (id: string) => {
    const response = await api.post(`/assets/${id}/recalculate-schedule`);
    return response.data;
  },
};

// ============ Hooks ============

export function useAssets(params?: {
  status?: AssetStatus;
  assetType?: AssetType;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['assets', params],
    queryFn: () => assetsApi.getAll(params),
  });
}

export function useInfiniteAssets(params?: Record<string, unknown>) {
  return useInfiniteTableData<Asset, Record<string, unknown>>({
    queryKey: ['assets'],
    fetchFn: async (p) => {
      const response = await api.get('/assets/cursor', { params: p });
      return response.data;
    },
    params: params || {},
  });
}

export function useAsset(id: string) {
  return useQuery({
    queryKey: ['assets', id],
    queryFn: () => assetsApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: assetsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['asset-summary'] });
    },
  });
}

export function useUpdateAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAssetDto }) => assetsApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['assets', id] });
      queryClient.invalidateQueries({ queryKey: ['asset-summary'] });
    },
  });
}

export function useDeleteAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: assetsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['asset-summary'] });
    },
  });
}

export function useDisposeAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DisposeAssetDto }) =>
      assetsApi.dispose(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['assets', id] });
      queryClient.invalidateQueries({ queryKey: ['asset-summary'] });
      queryClient.invalidateQueries({ queryKey: ['journals'] });
    },
  });
}

export function useDepreciationSchedule(assetId: string) {
  return useQuery({
    queryKey: ['asset-depreciation-schedule', assetId],
    queryFn: () => assetsApi.getDepreciationSchedule(assetId),
    enabled: !!assetId,
  });
}

export function useRunMonthlyDepreciation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: assetsApi.runMonthlyDepreciation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['asset-depreciation-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['asset-summary'] });
      queryClient.invalidateQueries({ queryKey: ['journals'] });
    },
  });
}

export function useAssetSummary() {
  return useQuery({
    queryKey: ['asset-summary'],
    queryFn: () => assetsApi.getSummary(),
  });
}

export function useRecalculateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: assetsApi.recalculateSchedule,
    onSuccess: (_, assetId) => {
      queryClient.invalidateQueries({ queryKey: ['asset-depreciation-schedule', assetId] });
    },
  });
}

// ============ Helper Functions ============

export function getAssetTypeLabel(type: AssetType): string {
  const labels: Record<AssetType, string> = {
    ELECTRONICS: 'Electronics',
    FURNITURE: 'Furniture & Fixtures',
    VEHICLES: 'Vehicles',
    MACHINERY: 'Machinery & Equipment',
    BUILDINGS: 'Buildings',
    OTHER: 'Other',
  };
  return labels[type] || type;
}

export function getAssetTypeIcon(type: AssetType): string {
  const icons: Record<AssetType, string> = {
    ELECTRONICS: '💻',
    FURNITURE: '🪑',
    VEHICLES: '🚗',
    MACHINERY: '⚙️',
    BUILDINGS: '🏢',
    OTHER: '📦',
  };
  return icons[type] || '📦';
}

export function getAssetStatusColor(status: AssetStatus): string {
  const colors: Record<AssetStatus, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    DISPOSED: 'bg-gray-100 text-gray-800',
    FULLY_DEPRECIATED: 'bg-yellow-100 text-yellow-800',
  };
  return colors[status] || '';
}

export function getAssetStatusLabel(status: AssetStatus): string {
  const labels: Record<AssetStatus, string> = {
    ACTIVE: 'Active',
    DISPOSED: 'Disposed',
    FULLY_DEPRECIATED: 'Fully Depreciated',
  };
  return labels[status] || status;
}

export function getDepreciationMethodLabel(method: DepreciationMethod): string {
  const labels: Record<DepreciationMethod, string> = {
    STRAIGHT_LINE: 'Straight Line',
    DECLINING_BALANCE: 'Declining Balance',
  };
  return labels[method] || method;
}

export function calculateRemainingLife(asset: Asset): number {
  const purchaseDate = new Date(asset.purchaseDate);
  const endDate = new Date(purchaseDate);
  endDate.setFullYear(endDate.getFullYear() + asset.usefulLifeYears);

  const today = new Date();
  const remainingMonths = Math.max(
    0,
    (endDate.getFullYear() - today.getFullYear()) * 12 + (endDate.getMonth() - today.getMonth()),
  );

  return remainingMonths;
}

export function formatCurrency(amount: number | string | undefined): string {
  if (amount === undefined || amount === null) return '$0.00';
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(numAmount);
}
