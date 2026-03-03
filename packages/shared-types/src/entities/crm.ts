// ============================================
// CRM Types - Leads, Deals, Activities
// ============================================

import { LeadStatus, LeadSource, LeadTier, DealStage, ActivityType } from '../enums';
import { OrgSoftDeleteEntity, OrganizationEntity, PaginationQuery } from './base';

// --- Lead ---

export interface Lead extends OrgSoftDeleteEntity {
  leadName: string;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  source: LeadSource;
  status: LeadStatus;
  assignedToId?: string | null;
  assignedTo?: { id: string; name: string; email: string };
  notes?: string | null;
  customFields?: Record<string, unknown> | null;
  convertedToCustomerId?: string | null;
  convertedAt?: string | null;
  activities?: ActivityLog[];
  deals?: Deal[];
  score?: {
    totalScore: number;
    tier: LeadTier;
    demographicScore?: number;
    behavioralScore?: number;
    engagementScore?: number;
    conversionProbability?: string;
  };
}

export interface CreateLeadRequest {
  leadName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  source: LeadSource;
  assignedToId?: string;
  notes?: string;
  customFields?: Record<string, unknown>;
}

export interface UpdateLeadRequest {
  leadName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  source?: LeadSource;
  status?: LeadStatus;
  assignedToId?: string;
  notes?: string;
  customFields?: Record<string, unknown>;
}

export interface LeadQuery extends PaginationQuery {
  status?: LeadStatus;
  source?: LeadSource;
  assignedToId?: string;
}

export interface ConvertLeadResult {
  customerId: string;
  dealId?: string;
}

// --- Deal ---

export interface Deal extends OrgSoftDeleteEntity {
  dealName: string;
  leadId?: string | null;
  lead?: Lead;
  customerId?: string | null;
  customer?: { id: string; name: string };
  stage: DealStage;
  expectedAmount: string;
  probability: number;
  expectedCloseDate?: string | null;
  actualCloseDate?: string | null;
  assignedToId?: string | null;
  assignedTo?: { id: string; name: string; email: string };
  lostReason?: string | null;
  wonQuoteId?: string | null;
  activities?: ActivityLog[];
}

export interface CreateDealRequest {
  dealName: string;
  leadId?: string;
  customerId?: string;
  expectedAmount: number | string;
  probability?: number;
  expectedCloseDate?: string;
  assignedToId?: string;
}

export interface UpdateDealRequest {
  dealName?: string;
  expectedAmount?: number | string;
  probability?: number;
  expectedCloseDate?: string;
  assignedToId?: string;
  stage?: DealStage;
  lostReason?: string;
}

export interface DealQuery extends PaginationQuery {
  stage?: DealStage;
  assignedToId?: string;
  customerId?: string;
}

export interface PipelineMetrics {
  totalDeals: number;
  totalValue: number;
  weightedValue: number;
  avgDealSize: number;
  conversionRate: number;
  avgDaysToClose: number;
  byStage: Record<string, { count: number; value: number }>;
}

// --- Activity Log ---

export interface ActivityLog {
  id: string;
  leadId?: string | null;
  dealId?: string | null;
  type: ActivityType;
  description: string;
  date: string;
  userId: string;
  user?: { id: string; name: string };
  organizationId: string;
  createdAt: string;
}

export interface CreateActivityRequest {
  leadId?: string;
  dealId?: string;
  type: ActivityType;
  description: string;
  date?: string;
}

// --- Lead Score ---

export interface LeadScore {
  id: string;
  leadId: string;
  totalScore: number;
  demographicScore: number;
  behavioralScore: number;
  engagementScore: number;
  tier: LeadTier;
  conversionProbability: string;
  lastActivityAt?: string | null;
  lastScoredAt: string;
  scoreHistory: unknown[];
  organizationId: string;
}
