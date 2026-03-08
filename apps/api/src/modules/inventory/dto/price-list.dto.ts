export interface PriceListItemDto {
  itemId: string;
  customPrice: string | number;
}

export interface CreatePriceListDto {
  name: string;
  description?: string;
  type: string;
  adjustment: string | number;
  items?: PriceListItemDto[];
}

export interface UpdatePriceListDto {
  name?: string;
  description?: string;
  type?: string;
  adjustment?: string | number;
  isActive?: boolean;
}
