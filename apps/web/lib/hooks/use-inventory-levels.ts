'use client';

import { inventoryLevelsApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

export interface InventoryLevel {
  id: string;
  itemId: string;
  warehouseId: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  item?: {
    id: string;
    name: string;
    sku: string;
    unit: string;
  };
  warehouse?: {
    id: string;
    name: string;
    code: string;
  };
}

interface InventoryLevelFilters {
  itemId?: string;
  warehouseId?: string;
}

export function useInventoryLevels(filters?: InventoryLevelFilters) {
  return useQuery({
    queryKey: ['inventory-levels', filters],
    queryFn: async () => {
      const response = await inventoryLevelsApi.getAll(filters);
      return response.data;
    },
  });
}

export function useInventoryLevelsByItem(itemId: string | undefined) {
  return useQuery({
    queryKey: ['inventory-levels', 'by-item', itemId],
    queryFn: async () => {
      if (!itemId) throw new Error('Item ID is required');
      const response = await inventoryLevelsApi.getByItem(itemId);
      return response.data;
    },
    enabled: !!itemId,
  });
}
