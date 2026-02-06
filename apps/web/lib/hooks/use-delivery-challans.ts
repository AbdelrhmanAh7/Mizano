import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export type ChallanType = 'SUPPLY' | 'JOB_WORK' | 'SAMPLE';
export type ChallanStatus = 'DRAFT' | 'ISSUED' | 'RETURNED';

export interface DeliveryChallanLine {
  id?: string;
  itemId: string;
  item?: {
    id: string;
    name: string;
    sku?: string;
    unit?: string;
  };
  quantity: number;
  description?: string;
  warehouseId?: string;
  warehouse?: {
    id: string;
    name: string;
  };
}

export interface DeliveryChallan {
  id: string;
  challanNumber: string;
  customerId: string;
  customer?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  invoiceId?: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
    date: string;
    grandTotal: number;
  };
  challanType: ChallanType;
  date: string;
  status: ChallanStatus;
  notes?: string;
  lines: DeliveryChallanLine[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeliveryChallanDto {
  customerId: string;
  invoiceId?: string;
  challanType: ChallanType;
  date: string;
  notes?: string;
  lines: Array<{
    itemId: string;
    quantity: number;
    description?: string;
    warehouseId?: string;
  }>;
}

export interface UpdateDeliveryChallanDto {
  customerId?: string;
  challanType?: ChallanType;
  date?: string;
  notes?: string;
  lines?: Array<{
    id?: string;
    itemId: string;
    quantity: number;
    description?: string;
    warehouseId?: string;
  }>;
}

export interface ChallanQueryParams {
  status?: ChallanStatus;
  challanType?: ChallanType;
  customerId?: string;
  invoiceId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ChallanListResponse {
  data: DeliveryChallan[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============ API Functions ============

const challansApi = {
  getAll: async (params?: ChallanQueryParams): Promise<ChallanListResponse> => {
    const response = await api.get('/delivery-challans', { params });
    return response.data;
  },
  getById: async (id: string): Promise<DeliveryChallan> => {
    const response = await api.get(`/delivery-challans/${id}`);
    return response.data;
  },
  create: async (data: CreateDeliveryChallanDto): Promise<DeliveryChallan> => {
    const response = await api.post('/delivery-challans', data);
    return response.data;
  },
  update: async (id: string, data: UpdateDeliveryChallanDto): Promise<DeliveryChallan> => {
    const response = await api.put(`/delivery-challans/${id}`, data);
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/delivery-challans/${id}`);
  },
  issue: async (id: string): Promise<DeliveryChallan> => {
    const response = await api.post(`/delivery-challans/${id}/issue`);
    return response.data;
  },
  markReturned: async (id: string): Promise<DeliveryChallan> => {
    const response = await api.post(`/delivery-challans/${id}/mark-returned`);
    return response.data;
  },
  createFromInvoice: async (invoiceId: string): Promise<DeliveryChallan> => {
    const response = await api.post(`/delivery-challans/from-invoice/${invoiceId}`);
    return response.data;
  },
};

// ============ Hooks ============

export function useDeliveryChallans(params?: ChallanQueryParams) {
  return useQuery({
    queryKey: ['delivery-challans', params],
    queryFn: () => challansApi.getAll(params),
  });
}

export function useDeliveryChallan(id: string) {
  return useQuery({
    queryKey: ['delivery-challans', id],
    queryFn: () => challansApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateDeliveryChallan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: challansApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-challans'] });
    },
  });
}

export function useUpdateDeliveryChallan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDeliveryChallanDto }) =>
      challansApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['delivery-challans'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-challans', id] });
    },
  });
}

export function useDeleteDeliveryChallan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: challansApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-challans'] });
    },
  });
}

export function useIssueChallan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: challansApi.issue,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['delivery-challans'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-challans', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useMarkChallanReturned() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: challansApi.markReturned,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['delivery-challans'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-challans', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useCreateChallanFromInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: challansApi.createFromInvoice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-challans'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

// ============ Helper Functions ============

export function getChallanTypeLabel(type: ChallanType): string {
  const labels: Record<ChallanType, string> = {
    SUPPLY: 'Supply',
    JOB_WORK: 'Job Work',
    SAMPLE: 'Sample',
  };
  return labels[type] || type;
}

export function getChallanTypeDescription(type: ChallanType): string {
  const descriptions: Record<ChallanType, string> = {
    SUPPLY: 'Regular supply of goods to customer',
    JOB_WORK: 'Goods sent for job work processing',
    SAMPLE: 'Sample goods sent for evaluation',
  };
  return descriptions[type] || '';
}

export function getChallanTypeIcon(type: ChallanType): string {
  const icons: Record<ChallanType, string> = {
    SUPPLY: '📦',
    JOB_WORK: '🔧',
    SAMPLE: '🧪',
  };
  return icons[type] || '📋';
}

export function getChallanStatusColor(status: ChallanStatus): string {
  const colors: Record<ChallanStatus, string> = {
    DRAFT: 'bg-gray-100 text-gray-800',
    ISSUED: 'bg-blue-100 text-blue-800',
    RETURNED: 'bg-green-100 text-green-800',
  };
  return colors[status] || '';
}

export function getChallanStatusLabel(status: ChallanStatus): string {
  const labels: Record<ChallanStatus, string> = {
    DRAFT: 'Draft',
    ISSUED: 'Issued',
    RETURNED: 'Returned',
  };
  return labels[status] || status;
}

export function getChallanStatusDescription(status: ChallanStatus): string {
  const descriptions: Record<ChallanStatus, string> = {
    DRAFT: 'Challan created but not yet issued',
    ISSUED: 'Goods have been dispatched',
    RETURNED: 'Goods have been returned',
  };
  return descriptions[status] || '';
}

export function canIssueChallan(challan: DeliveryChallan): boolean {
  return challan.status === 'DRAFT' && challan.lines.length > 0;
}

export function canMarkReturned(challan: DeliveryChallan): boolean {
  return challan.status === 'ISSUED';
}

export function canEditChallan(challan: DeliveryChallan): boolean {
  return challan.status === 'DRAFT';
}

export function canDeleteChallan(challan: DeliveryChallan): boolean {
  return challan.status === 'DRAFT';
}

export function getTotalQuantity(lines: DeliveryChallanLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
