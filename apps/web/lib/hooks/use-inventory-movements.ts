'use client';

import { inventoryMovementsApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';

export type MovementType = 'IN' | 'OUT';
export type MovementSource =
  | 'SALE'
  | 'PURCHASE'
  | 'ADJUSTMENT'
  | 'TRANSFER'
  | 'ASSEMBLY'
  | 'RETURN'
  | 'MANUAL';

export interface InventoryMovement {
  id: string;
  itemId: string;
  warehouseId: string;
  type: MovementType;
  source: MovementSource;
  quantity: string;
  costPerUnit: string;
  referenceId: string | null;
  referenceType: string | null;
  notes: string | null;
  createdAt: string;
  item?: {
    id: string;
    name: string;
    sku: string;
  };
  warehouse?: {
    id: string;
    name: string;
    code: string;
  };
}

export function useInfiniteInventoryMovements(params?: Record<string, unknown>) {
  return useInfiniteTableData<InventoryMovement, Record<string, unknown>>({
    queryKey: ['inventory-movements'],
    fetchFn: async (p) => {
      const response = await inventoryMovementsApi.getAllCursor(p);
      return response.data;
    },
    params: params || {},
  });
}
