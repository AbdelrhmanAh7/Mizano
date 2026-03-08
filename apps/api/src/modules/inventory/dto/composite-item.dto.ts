export interface CompositeItemComponentDto {
  itemId: string;
  quantity: number;
}

export interface CreateCompositeItemDto {
  name: string;
  sku?: string;
  description?: string;
  sellingPrice?: string | number;
  components?: CompositeItemComponentDto[];
}

export interface UpdateCompositeItemDto {
  name?: string;
  sku?: string;
  description?: string;
  sellingPrice?: string | number;
  components?: CompositeItemComponentDto[];
}
