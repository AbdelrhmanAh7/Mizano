// ============================================
// Manufacturing Types - BOMs, Work Orders, Production Entries
// ============================================

import { WorkOrderStatus } from '../enums';
import { OrganizationEntity } from './base';

// --- BOM (Bill of Materials) ---

export interface BOMItem {
  id: string;
  bomId: string;
  itemId: string;
  item?: { id: string; name: string; sku: string };
  quantity: number | string;
  unit?: string;
}

export interface BOM extends OrganizationEntity {
  name: string;
  outputItemId: string;
  outputItem?: { id: string; name: string; sku: string };
  outputQuantity: number;
  operationsCost: string;
  items: BOMItem[];
  isActive: boolean;
}

export interface CreateBOMRequest {
  name: string;
  outputItemId: string;
  outputQuantity: number;
  operationsCost?: string;
  items: { itemId: string; quantity: number }[];
}

export interface UpdateBOMRequest {
  name?: string;
  outputQuantity?: number;
  operationsCost?: string;
  items?: { itemId: string; quantity: number }[];
  isActive?: boolean;
}

// --- Work Order ---

export interface MaterialRequirement {
  itemId: string;
  itemName: string;
  itemCode: string;
  required: number;
  available: number;
  shortage: number;
  unit: string;
}

export interface WorkOrder extends OrganizationEntity {
  workOrderNumber: string;
  bomId: string;
  bom?: BOM;
  quantity: number;
  status: WorkOrderStatus;
  plannedStartDate?: string | null;
  actualStartDate?: string | null;
  completedDate?: string | null;
  notes?: string | null;
  journalId?: string | null;
  materialRequirements?: MaterialRequirement[];
  stockAlerts?: MaterialRequirement[];
}

export interface CreateWorkOrderRequest {
  bomId: string;
  quantity: number;
  plannedStartDate?: string;
  notes?: string;
}

export interface UpdateWorkOrderRequest {
  quantity?: number;
  plannedStartDate?: string;
  notes?: string;
  status?: WorkOrderStatus;
}

// --- Production Entry ---

export interface ProductionEntry extends OrganizationEntity {
  workOrderId: string;
  workOrder?: WorkOrder;
  date: string;
  quantityProduced: number;
  quantityRejected: number;
  wastageQuantity: number;
  notes?: string | null;
  createdById?: string | null;
}

export interface CreateProductionEntryRequest {
  workOrderId: string;
  date: string;
  quantityProduced: number;
  quantityRejected?: number;
  wastageQuantity?: number;
  notes?: string;
}
