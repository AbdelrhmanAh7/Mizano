// ============================================
// Inventory Types - Items, Warehouses, Adjustments,
// Transfers, Price Lists, Composite Items
// ============================================

import {
  ItemType,
  AdjustmentType,
  AdjustmentReason,
  TransferStatus,
  PriceListType,
} from '../enums';
import { OrgSoftDeleteEntity, OrganizationEntity, PaginationQuery } from './base';

// --- Item ---

export interface Item extends OrgSoftDeleteEntity {
  name: string;
  sku: string;
  type: ItemType;
  unit?: string | null;
  sellingPrice: string;
  salesPrice?: string | null;
  salesAccountId?: string | null;
  costPrice: string;
  purchasePrice?: string | null;
  purchaseAccountId?: string | null;
  inventoryAccountId?: string | null;
  description?: string | null;
  taxRate?: string | null;
  trackInventory: boolean;
  reorderPoint?: number | null;
  reorderLevel?: number | null;
  currentStock: number;
  isActive: boolean;
  incomeAccount?: { id: string; name: string; code: string };
  expenseAccount?: { id: string; name: string; code: string };
  inventoryAccount?: { id: string; name: string; code: string };
  taxRateEntity?: { id: string; name: string; rate: number };
}

export interface CreateItemRequest {
  name: string;
  sku?: string;
  type: ItemType;
  unit?: string;
  sellingPrice?: string;
  salesPrice?: number;
  purchasePrice?: number;
  costPrice?: string;
  salesAccountId?: string;
  purchaseAccountId?: string;
  inventoryAccountId?: string;
  description?: string;
  taxRateId?: string;
  trackInventory?: boolean;
  openingStock?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  incomeAccountId?: string;
  expenseAccountId?: string;
}

export interface UpdateItemRequest extends Partial<CreateItemRequest> {
  isActive?: boolean;
}

export interface ItemQuery extends PaginationQuery {
  type?: ItemType;
  isActive?: boolean;
  lowStock?: boolean;
}

// --- Composite Item ---

export interface CompositeItemComponent {
  id: string;
  compositeItemId: string;
  itemId: string;
  item?: Item;
  quantity: number;
}

export interface CompositeItem extends OrganizationEntity {
  name: string;
  sku: string;
  sellingPrice: string;
  description?: string | null;
  components: CompositeItemComponent[];
}

export interface CreateCompositeItemRequest {
  name: string;
  sku: string;
  sellingPrice: string;
  description?: string;
  components: { itemId: string; quantity: number }[];
}

// --- Warehouse ---

export interface Warehouse extends OrganizationEntity {
  name: string;
  code: string;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  isDefault: boolean;
  isActive: boolean;
  _count?: { stockLevels: number };
}

export interface CreateWarehouseRequest {
  name: string;
  code?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  isDefault?: boolean;
}

export interface UpdateWarehouseRequest extends Partial<CreateWarehouseRequest> {}

export interface WarehouseQuery extends PaginationQuery {
  isActive?: boolean;
}

export interface WarehouseStock {
  itemId: string;
  warehouseId: string;
  quantity: number;
  item: {
    id: string;
    name: string;
    sku: string | null;
    unit: string | null;
  };
}

// --- Inventory Level ---

export interface InventoryLevel extends OrganizationEntity {
  itemId: string;
  warehouseId: string;
  quantity: string;
}

// --- Inventory Movement ---

export interface InventoryMovement {
  id: string;
  itemId: string;
  warehouseId: string;
  quantity: string;
  type: string;
  movementType?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  reference?: string | null;
  costPerUnit: string;
  organizationId: string;
  createdAt: string;
}

// --- Inventory Adjustment ---

export interface AdjustmentLine {
  id: string;
  adjustmentId: string;
  itemId: string;
  warehouseId: string;
  quantityBefore: number;
  quantityAdjusted: number;
  quantityAfter: number;
  item: { id: string; name: string; sku: string | null; unit: string | null };
  warehouse: { id: string; name: string; code: string };
}

export interface Adjustment extends OrganizationEntity {
  adjustmentNumber: string;
  date: string;
  warehouseId: string;
  warehouse?: Warehouse;
  itemId: string;
  item?: Item;
  type: AdjustmentType;
  quantity: number;
  reason: AdjustmentReason;
  accountId: string;
  notes?: string | null;
  lines?: AdjustmentLine[];
}

export interface CreateAdjustmentRequest {
  date: string;
  type: AdjustmentType;
  reason: AdjustmentReason;
  description?: string;
  reference?: string;
  warehouseId?: string;
  itemId?: string;
  accountId?: string;
  notes?: string;
  lines?: {
    itemId: string;
    warehouseId: string;
    quantityAdjusted: number;
  }[];
}

export interface AdjustmentQuery extends PaginationQuery {
  type?: AdjustmentType;
  status?: string;
  reason?: AdjustmentReason;
}

// --- Inventory Transfer ---

export interface TransferLine {
  id: string;
  transferId: string;
  itemId: string;
  quantity: number | string;
  item: {
    id: string;
    name: string;
    sku: string | null;
    unit: string | null;
  };
}

export interface Transfer extends OrganizationEntity {
  transferNumber: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  fromWarehouse: { id: string; name: string; code: string };
  toWarehouse: { id: string; name: string; code: string };
  date: string;
  status: TransferStatus;
  notes: string | null;
  lines?: TransferLine[];
}

export interface CreateTransferRequest {
  fromWarehouseId: string;
  toWarehouseId: string;
  date: string;
  notes?: string;
  lines: { itemId: string; quantity: number }[];
}

export interface TransferQuery extends PaginationQuery {
  status?: TransferStatus;
  fromWarehouseId?: string;
  toWarehouseId?: string;
}

// --- Price List ---

export interface PriceListItem {
  id: string;
  priceListId: string;
  itemId: string;
  item?: { id: string; name: string; sku: string };
  customPrice: string;
  minQuantity?: number;
}

export interface PriceList extends OrganizationEntity {
  name: string;
  description?: string | null;
  type: PriceListType;
  adjustment: string;
  isActive: boolean;
  items: PriceListItem[];
}

export interface CreatePriceListRequest {
  name: string;
  description?: string;
  type: PriceListType | string;
  adjustment: string;
  items?: { itemId: string; customPrice: string }[];
}

// --- Inventory Cost Layer ---

export interface InventoryCostLayer {
  id: string;
  itemId: string;
  warehouseId: string;
  quantity: string;
  originalQty: string;
  costPerUnit: string;
  referenceType?: string | null;
  referenceId?: string | null;
  organizationId: string;
  createdAt: string;
}
