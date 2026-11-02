import api from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// ============ Types ============

// The API's LeadSource / LeadStatus enums: any other value is refused with a 400.
export type LeadSource =
  | 'FACEBOOK_ADS'
  | 'GOOGLE_ADS'
  | 'WEBSITE'
  | 'REFERRAL'
  | 'COLD_CALL'
  | 'OTHER';
export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'JUNK' | 'WON' | 'LOST';
export type DealStage =
  | 'NEW'
  | 'MEETING_SCHEDULED'
  | 'PROPOSAL_SENT'
  | 'NEGOTIATION'
  | 'WON'
  | 'LOST';
export type ActivityType = 'CALL' | 'EMAIL' | 'MEETING' | 'NOTE' | 'TASK';

export interface Lead {
  id: string;
  leadName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  source: LeadSource;
  status: LeadStatus;
  assignedToId?: string;
  assignedTo?: { id: string; name: string; email: string };
  notes?: string;
  customFields?: Record<string, unknown>;
  convertedToCustomerId?: string;
  convertedAt?: string;
  createdAt: string;
  updatedAt: string;
  activities?: ActivityLog[];
  deals?: Deal[];
  score?: {
    totalScore: number;
    tier: 'HOT' | 'WARM' | 'COOL' | 'COLD';
  };
}

export interface Deal {
  id: string;
  dealName: string;
  leadId?: string;
  lead?: Lead;
  customerId?: string;
  customer?: { id: string; name: string };
  stage: DealStage;
  expectedAmount: number;
  probability: number;
  expectedCloseDate?: string;
  actualCloseDate?: string;
  assignedToId?: string;
  assignedTo?: { id: string; name: string; email: string };
  lostReason?: string;
  wonQuoteId?: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  activities?: ActivityLog[];
}

export interface ActivityLog {
  id: string;
  leadId?: string;
  dealId?: string;
  type: ActivityType;
  description: string;
  date: string;
  userId: string;
  user?: { id: string; name: string };
  createdAt: string;
}

export interface CreateLeadDto {
  leadName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  source: LeadSource;
  assignedToId?: string;
  notes?: string;
  customFields?: Record<string, unknown>;
}

/** `null` clears an optional field (an empty string would fail the email check). */
export interface UpdateLeadDto {
  leadName?: string;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: LeadSource;
  status?: LeadStatus;
  assignedToId?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown> | null;
}

export interface CreateDealDto {
  dealName: string;
  leadId?: string;
  customerId?: string;
  /** Decimal string, e.g. "5000.00": money never travels as a JS number. */
  expectedAmount: string;
  /** Whole percentage, 0-100. */
  probability?: number;
  expectedCloseDate?: string;
  assignedToId?: string;
  stage?: DealStage;
  notes?: string;
}

export interface UpdateDealDto {
  dealName?: string;
  expectedAmount?: string;
  probability?: number;
  expectedCloseDate?: string | null;
  assignedToId?: string | null;
}

export interface ConvertLeadOptions {
  createDeal?: boolean;
  dealName?: string;
  /** Decimal string for the deal created with the customer. */
  expectedAmount?: string;
}

export interface CreateActivityDto {
  leadId?: string;
  dealId?: string;
  type: ActivityType;
  description: string;
  date?: string;
}

// ============ API Functions ============

const leadsApi = {
  getAll: async (params?: {
    status?: LeadStatus;
    source?: LeadSource;
    assignedToId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get('/crm/leads', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/crm/leads/${id}`);
    return response.data;
  },
  create: async (data: CreateLeadDto) => {
    const response = await api.post('/crm/leads', data);
    return response.data;
  },
  update: async (id: string, data: UpdateLeadDto) => {
    const response = await api.put(`/crm/leads/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/crm/leads/${id}`);
    return response.data;
  },
  convertToCustomer: async (id: string, options?: ConvertLeadOptions) => {
    const response = await api.post(`/crm/leads/${id}/convert`, options);
    return response.data;
  },
  bulkUpdateStatus: async (ids: string[], status: LeadStatus) => {
    const response = await api.post('/crm/leads/bulk-status', { ids, status });
    return response.data;
  },
  bulkAssign: async (leadIds: string[], assignedToId: string) => {
    const response = await api.post('/crm/leads/bulk-assign', { leadIds, assignedToId });
    return response.data;
  },
};

const dealsApi = {
  getAll: async (params?: {
    stage?: DealStage;
    assignedToId?: string;
    customerId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get('/crm/deals', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/crm/deals/${id}`);
    return response.data;
  },
  getByStage: async () => {
    const response = await api.get('/crm/deals/pipeline');
    return response.data;
  },
  create: async (data: CreateDealDto) => {
    const response = await api.post('/crm/deals', data);
    return response.data;
  },
  update: async (id: string, data: UpdateDealDto) => {
    const response = await api.put(`/crm/deals/${id}`, data);
    return response.data;
  },
  updateStage: async (id: string, stage: DealStage) => {
    const response = await api.post(`/crm/deals/${id}/stage`, { stage });
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/crm/deals/${id}`);
    return response.data;
  },
  markWon: async (id: string, options?: { createQuote?: boolean }) => {
    const response = await api.post(`/crm/deals/${id}/won`, options);
    return response.data;
  },
  markLost: async (id: string, reason: string) => {
    const response = await api.post(`/crm/deals/${id}/lost`, { reason });
    return response.data;
  },
  getPipelineMetrics: async () => {
    const response = await api.get('/crm/deals/pipeline-metrics');
    return response.data;
  },
};

const activitiesApi = {
  getByLead: async (leadId: string, limit?: number) => {
    const response = await api.get(`/crm/leads/${leadId}/activities`, { params: { limit } });
    return response.data;
  },
  getByDeal: async (dealId: string, limit?: number) => {
    const response = await api.get(`/crm/deals/${dealId}/activities`, { params: { limit } });
    return response.data;
  },
  create: async (data: CreateActivityDto) => {
    const response = await api.post('/crm/activities', data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/crm/activities/${id}`);
    return response.data;
  },
};

// ============ Leads Hooks ============

export function useLeads(params?: {
  status?: LeadStatus;
  source?: LeadSource;
  assignedToId?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['leads', params],
    queryFn: () => leadsApi.getAll(params),
  });
}

export function useInfiniteLeads(params?: Record<string, unknown>) {
  return useInfiniteTableData<Lead, Record<string, unknown>>({
    queryKey: ['leads'],
    fetchFn: async (p) => {
      const response = await api.get('/crm/leads/cursor', { params: p });
      return response.data;
    },
    params: params || {},
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: ['leads', id],
    queryFn: () => leadsApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: leadsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLeadDto }) => leadsApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads', id] });
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: leadsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useConvertLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, options }: { id: string; options?: ConvertLeadOptions }) =>
      leadsApi.convertToCustomer(id, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
  });
}

// ============ Deals Hooks ============

export function useDeals(params?: {
  stage?: DealStage;
  assignedToId?: string;
  customerId?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['deals', params],
    queryFn: () => dealsApi.getAll(params),
  });
}

export function useInfiniteDeals(params?: Record<string, unknown>) {
  return useInfiniteTableData<Deal, Record<string, unknown>>({
    queryKey: ['deals'],
    fetchFn: async (p) => {
      const response = await api.get('/crm/deals/cursor', { params: p });
      return response.data;
    },
    params: params || {},
  });
}

export function useDeal(id: string) {
  return useQuery({
    queryKey: ['deals', id],
    queryFn: () => dealsApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: dealsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-metrics'] });
    },
  });
}

export function useUpdateDealStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: DealStage }) =>
      dealsApi.updateStage(id, stage),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deals', id] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-metrics'] });
    },
  });
}

export function useDeleteDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: dealsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-metrics'] });
    },
  });
}

export function useMarkDealWon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, options }: { id: string; options?: { createQuote?: boolean } }) =>
      dealsApi.markWon(id, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

export function useMarkDealLost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => dealsApi.markLost(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-metrics'] });
    },
  });
}

export function usePipelineMetrics() {
  return useQuery({
    queryKey: ['pipeline-metrics'],
    queryFn: () => dealsApi.getPipelineMetrics(),
  });
}

// ============ Activities Hooks ============

export function useLeadActivities(leadId: string, limit?: number) {
  return useQuery({
    queryKey: ['lead-activities', leadId, limit],
    queryFn: () => activitiesApi.getByLead(leadId, limit),
    enabled: !!leadId,
  });
}

export function useDealActivities(dealId: string, limit?: number) {
  return useQuery({
    queryKey: ['deal-activities', dealId, limit],
    queryFn: () => activitiesApi.getByDeal(dealId, limit),
    enabled: !!dealId,
  });
}

export function useCreateActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: activitiesApi.create,
    onSuccess: (_, variables) => {
      if (variables.leadId) {
        queryClient.invalidateQueries({ queryKey: ['lead-activities', variables.leadId] });
        queryClient.invalidateQueries({ queryKey: ['leads', variables.leadId] });
      }
      if (variables.dealId) {
        queryClient.invalidateQueries({ queryKey: ['deal-activities', variables.dealId] });
        queryClient.invalidateQueries({ queryKey: ['deals', variables.dealId] });
      }
    },
  });
}

// ============ Helper Functions ============

export function getLeadSourceLabel(source: LeadSource): string {
  const labels: Record<LeadSource, string> = {
    FACEBOOK_ADS: 'Facebook Ads',
    GOOGLE_ADS: 'Google Ads',
    WEBSITE: 'Website',
    REFERRAL: 'Referral',
    COLD_CALL: 'Cold Call',
    OTHER: 'Other',
  };
  return labels[source] || source;
}

export function getLeadStatusColor(status: LeadStatus): string {
  const colors: Record<LeadStatus, string> = {
    NEW: 'bg-info/10 text-info',
    CONTACTED: 'bg-warning/10 text-warning',
    QUALIFIED: 'bg-success/10 text-success',
    JUNK: 'bg-destructive/10 text-destructive',
    WON: 'bg-success/10 text-success',
    LOST: 'bg-muted text-foreground',
  };
  return colors[status] || '';
}

export function getLeadStatusLabel(status: LeadStatus): string {
  const labels: Record<LeadStatus, string> = {
    NEW: 'New',
    CONTACTED: 'Contacted',
    QUALIFIED: 'Qualified',
    JUNK: 'Junk',
    WON: 'Won',
    LOST: 'Lost',
  };
  return labels[status] || status;
}

export function getDealStageColor(stage: DealStage): string {
  const colors: Record<DealStage, string> = {
    NEW: 'bg-info/10 text-info',
    MEETING_SCHEDULED: 'bg-warning/10 text-warning',
    PROPOSAL_SENT: 'bg-primary/10 text-primary',
    NEGOTIATION: 'bg-warning/10 text-warning',
    WON: 'bg-success/10 text-success',
    LOST: 'bg-destructive/10 text-destructive',
  };
  return colors[stage] || '';
}

export function getDealStageLabel(stage: DealStage): string {
  const labels: Record<DealStage, string> = {
    NEW: 'New',
    MEETING_SCHEDULED: 'Meeting Scheduled',
    PROPOSAL_SENT: 'Proposal Sent',
    NEGOTIATION: 'Negotiation',
    WON: 'Won',
    LOST: 'Lost',
  };
  return labels[stage] || stage;
}

export function getActivityTypeLabel(type: ActivityType): string {
  const labels: Record<ActivityType, string> = {
    CALL: 'Call',
    EMAIL: 'Email',
    MEETING: 'Meeting',
    NOTE: 'Note',
    TASK: 'Task',
  };
  return labels[type] || type;
}

export function calculateWeightedValue(deals: Deal[]): number {
  return deals.reduce((sum, deal) => {
    return sum + (deal.expectedAmount * deal.probability) / 100;
  }, 0);
}
