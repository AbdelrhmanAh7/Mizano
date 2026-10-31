'use client';

import { AsyncCombobox, type ComboboxPage } from '@/components/shared/async-combobox';
import { customersApi, itemsApi, vendorsApi } from '@/lib/api';
import { useCustomer, type Customer } from '@/lib/hooks/use-customers';
import { useItem, type Item } from '@/lib/hooks/use-items';
import { useVendor, type Vendor } from '@/lib/hooks/use-vendors';

/** Page size of the picker lists; the server searches and pages the whole table. */
export const PICKER_PAGE_SIZE = 20;

interface Paged<T> {
  data?: T[];
  meta?: { totalPages?: number };
}

interface PickerProps<T> {
  value?: string;
  onValueChange: (id: string, record: T | undefined) => void;
  placeholder: string;
  /** Optional first entry that clears the value, e.g. "No vendor". */
  noneLabel?: string;
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
  isInvalid?: boolean;
  className?: string;
}

type ListFn = (params: { search?: string; page: number; limit: number }) => Promise<{
  data: unknown;
}>;

async function searchPage<T>(
  list: ListFn,
  query: string,
  page: number,
  toOption: (record: T) => { label: string; sublabel?: string },
): Promise<ComboboxPage<T>> {
  const res = await list({ search: query || undefined, page, limit: PICKER_PAGE_SIZE });
  const body = res.data as Paged<T & { id: string }>;
  return {
    options: (body.data ?? []).map((record) => ({
      id: record.id,
      data: record,
      ...toOption(record),
    })),
    totalPages: body.meta?.totalPages ?? 1,
  };
}

const partyOption = (p: Customer | Vendor): { label: string; sublabel?: string } => ({
  label: p.displayName || p.name,
  sublabel: p.email ?? undefined,
});

const searchCustomers = (query: string, page: number): Promise<ComboboxPage<Customer>> =>
  searchPage<Customer>(customersApi.getAll as ListFn, query, page, partyOption);
const searchVendors = (query: string, page: number): Promise<ComboboxPage<Vendor>> =>
  searchPage<Vendor>(vendorsApi.getAll as ListFn, query, page, partyOption);

/** Searchable customer picker for documents (audit B11): every customer, not the first 100. */
export function CustomerCombobox({ onValueChange, ...props }: PickerProps<Customer>) {
  const selected = useCustomer(props.value || undefined);
  return (
    <AsyncCombobox<Customer>
      {...props}
      queryKey={['customers', 'combobox']}
      search={searchCustomers}
      selectedLabel={selected.data ? partyOption(selected.data).label : undefined}
      onValueChange={(id, option) => onValueChange(id, option?.data)}
    />
  );
}

/** Searchable vendor picker for bills and expenses (audit B11). */
export function VendorCombobox({ onValueChange, ...props }: PickerProps<Vendor>) {
  const selected = useVendor(props.value || undefined);
  return (
    <AsyncCombobox<Vendor>
      {...props}
      queryKey={['vendors', 'combobox']}
      search={searchVendors}
      selectedLabel={selected.data ? partyOption(selected.data).label : undefined}
      onValueChange={(id, option) => onValueChange(id, option?.data)}
    />
  );
}

interface ItemComboboxProps extends PickerProps<Item> {
  /** First entry that clears the item (a free-text line), e.g. "Custom item". */
  noneLabel: string;
  /** Second line under the item name, e.g. its price in the document currency. */
  describe?: (item: Item) => string | undefined;
}

const searchItems = (query: string, page: number): Promise<ComboboxPage<Item>> =>
  searchPage<Item>(itemsApi.getAll as ListFn, query, page, (item) => ({ label: item.name }));

/** Searchable item picker for document lines (audit B11): searches name and SKU. */
export function ItemCombobox({ onValueChange, describe, ...props }: ItemComboboxProps) {
  const selected = useItem(props.value || undefined);
  return (
    <AsyncCombobox<Item>
      {...props}
      queryKey={['items', 'combobox']}
      search={searchItems}
      selectedLabel={selected.data?.name}
      describe={({ data }) =>
        data ? [data.sku, describe?.(data)].filter(Boolean).join(' · ') || undefined : undefined
      }
      onValueChange={(id, option) => onValueChange(id, option?.data)}
    />
  );
}
