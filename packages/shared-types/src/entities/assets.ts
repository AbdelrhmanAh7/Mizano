// ============================================
// Fixed Assets Types - Assets, Depreciation Schedules
// ============================================

import { AssetType, AssetStatus, DepreciationMethod } from '../enums';
import { OrgSoftDeleteEntity, PaginationQuery } from './base';

// --- Asset ---

export interface Asset extends OrgSoftDeleteEntity {
  assetNumber: string;
  name: string;
  description?: string | null;
  assetType: AssetType;
  purchaseDate: string;
  purchasePrice: string;
  salvageValue: string;
  usefulLifeYears: number;
  depreciationMethod: DepreciationMethod;
  monthlyDepreciation: string;
  accumulatedDepreciation: string;
  currentBookValue: string;
  status: AssetStatus;
  disposalDate?: string | null;
  disposalAmount?: string | null;
  disposalGainLoss?: string | null;
  assetAccountId: string;
  depreciationAccountId: string;
  accumulatedDeprAccountId: string;
}

export interface CreateAssetRequest {
  name: string;
  description?: string;
  assetType: AssetType;
  purchaseDate: string;
  purchasePrice: number | string;
  salvageValue: number | string;
  usefulLifeYears: number;
  depreciationMethod?: DepreciationMethod;
  assetAccountId: string;
  depreciationAccountId: string;
  accumulatedDeprAccountId: string;
}

export interface UpdateAssetRequest {
  name?: string;
  description?: string;
  assetType?: AssetType;
  salvageValue?: number | string;
  usefulLifeYears?: number;
}

export interface DisposeAssetRequest {
  disposalDate: string;
  disposalAmount: number | string;
}

export interface AssetQuery extends PaginationQuery {
  status?: AssetStatus;
  assetType?: AssetType;
}

export interface AssetSummary {
  totalAssets: number;
  totalValue: number;
  totalAccumulatedDepreciation: number;
  totalBookValue: number;
  byType: Record<string, { count: number; value: number }>;
  byStatus: Record<string, number>;
}

// --- Depreciation Schedule ---

export interface DepreciationScheduleItem {
  id: string;
  assetId: string;
  month: number;
  year: number;
  amount: string;
  accumulatedTotal: string;
  bookValue: string;
  journalId?: string | null;
  executedAt?: string | null;
  organizationId: string;
}
