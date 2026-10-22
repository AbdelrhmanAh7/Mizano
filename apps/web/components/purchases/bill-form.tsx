'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Bill } from '@/lib/hooks/use-bills';
import { useVendors, Vendor } from '@/lib/hooks/use-vendors';
import { SearchableSelect, type SearchableOption } from './searchable-select';
import { accountsApi } from '@/lib/api';
import { zodResolver } from '@hookform/resolvers/zod';
import { addDays, format } from 'date-fns';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useCallback, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import {
  computeTotals,
  findTotalsDiscrepancies,
  toDecimalInput,
  type ExtractedTotalsInput,
} from '@/lib/money';

// Same bounds as the API (`IsDecimalString`): Decimal(19, 4) for money and quantities, a
// percentage with at most 2 decimals for tax, so the preview never shows what the API rejects.
const DECIMAL_INPUT = /^\d{1,15}(\.\d{1,4})?$/;
const OPTIONAL_PERCENT_INPUT = /^(\d{1,3}(\.\d{1,2})?)?$/;

const lineSchema = z.object({
  itemId: z.string().optional(),
  accountId: z.string().min(1, 'accountRequired'),
  description: z.string().min(1, 'Description is required'),
  // Money/quantities must be valid non-negative decimals: never coerce bad input to 0.
  quantity: z
    .string()
    .trim()
    .regex(DECIMAL_INPUT, 'quantityInvalid')
    .refine((v) => /[1-9]/.test(v), 'quantityPositive'),
  rate: z.string().trim().regex(DECIMAL_INPUT, 'rateInvalid'),
  taxRate: z.string().trim().regex(OPTIONAL_PERCENT_INPUT, 'taxInvalid').default('0'),
});

const billSchema = z.object({
  vendorId: z.string().min(1, 'Vendor is required'),
  date: z.string().min(1, 'Date is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  reference: z.string().optional(),
  currencyCode: z.string().optional(),
  notes: z.string().optional(),
  projectId: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'At least one line item is required'),
});

type BillFormData = z.infer<typeof billSchema>;

export interface BillFormDefaultValues {
  vendorId?: string;
  date?: string;
  dueDate?: string;
  reference?: string;
  currencyCode?: string;
  notes?: string;
  projectId?: string;
  lines?: Array<{
    description: string;
    quantity: string;
    rate: string;
    taxRate?: string;
  }>;
}

export interface BillFormAccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

export interface BillFormItemOption {
  id: string;
  name: string;
  sku: string;
  costPrice: string;
  purchaseAccountId?: string | null;
  purchaseAccount?: {
    id: string;
    name: string;
    code: string;
    type?: string;
  } | null;
}

export interface FetchOptionsParams {
  search?: string;
  page?: number;
  limit?: number;
}

export interface FetchOptionsResult<T> {
  data: T[];
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface BillFormProps {
  bill?: Bill | null;
  accounts?: BillFormAccountOption[];
  items?: BillFormItemOption[];
  fetchAccounts?: (
    params: FetchOptionsParams,
  ) => Promise<FetchOptionsResult<BillFormAccountOption> | { data: BillFormAccountOption[] }>;
  fetchItems?: (
    params: FetchOptionsParams,
  ) => Promise<FetchOptionsResult<BillFormItemOption> | { data: BillFormItemOption[] }>;
  fetchAccountById?: (id: string) => Promise<BillFormAccountOption | null>;
  projects?: Array<{ id: string; name: string }>;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  defaultVendorId?: string;
  /** Pre-fill form from AI document scan */
  scanDefaults?: BillFormDefaultValues;
  /** Totals read from the scanned document; compared with the computed totals while reviewing */
  extractedTotals?: ExtractedTotalsInput & { discount?: string | number | null };
}

export function BillForm({
  bill,
  accounts = [],
  items = [],
  fetchAccounts,
  fetchItems,
  fetchAccountById,
  projects = [],
  onSubmit,
  onCancel,
  isSubmitting,
  defaultVendorId,
  scanDefaults,
  extractedTotals,
}: BillFormProps) {
  const isEditing = !!bill;
  const tValidation = useTranslations('purchases.bills.validation');
  const tForm = useTranslations('purchases.bills.form');
  const tIntake = useTranslations('ai.intake');
  const { data: vendorsData } = useVendors({ limit: 100 });
  const vendors = useMemo(() => vendorsData?.data || [], [vendorsData?.data]);

  const [extraAccounts, setExtraAccounts] = useState<BillFormAccountOption[]>([]);
  const [extraItems, setExtraItems] = useState<BillFormItemOption[]>([]);

  const addExtraAccount = useCallback((acc: BillFormAccountOption) => {
    setExtraAccounts((prev) => (prev.some((a) => a.id === acc.id) ? prev : [...prev, acc]));
  }, []);

  const addExtraItem = useCallback((item: BillFormItemOption) => {
    setExtraItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item]));
  }, []);

  const allAccounts = useMemo(() => {
    const map = new Map<string, BillFormAccountOption>();
    accounts.forEach((a) => map.set(a.id, a));
    extraAccounts.forEach((a) => map.set(a.id, a));
    return Array.from(map.values());
  }, [accounts, extraAccounts]);

  const allItems = useMemo(() => {
    const map = new Map<string, BillFormItemOption>();
    items.forEach((i) => map.set(i.id, i));
    extraItems.forEach((i) => map.set(i.id, i));
    return Array.from(map.values());
  }, [items, extraItems]);

  const form = useForm<BillFormData>({
    resolver: zodResolver(billSchema),
    defaultValues: {
      vendorId: scanDefaults?.vendorId || defaultVendorId || '',
      date: scanDefaults?.date || format(new Date(), 'yyyy-MM-dd'),
      dueDate: scanDefaults?.dueDate || format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      reference: scanDefaults?.reference || '',
      currencyCode: scanDefaults?.currencyCode || '',
      notes: scanDefaults?.notes || '',
      projectId: scanDefaults?.projectId || '',
      lines: scanDefaults?.lines?.length
        ? scanDefaults.lines.map((l) => ({
            accountId: '',
            description: l.description,
            quantity: l.quantity,
            rate: l.rate,
            // Scan review leaves an unresolved tax rate empty; do not default it to 0.
            taxRate: l.taxRate ?? '0',
          }))
        : [{ accountId: '', description: '', quantity: '1', rate: '', taxRate: '0' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  useEffect(() => {
    if (bill) {
      // Seed any known accounts from bill lines if present
      bill.lines?.forEach((line) => {
        const rawAccount = (line as unknown as { account?: BillFormAccountOption }).account;
        if (rawAccount) {
          addExtraAccount(rawAccount);
        }
      });

      form.reset({
        vendorId: bill.vendorId,
        date: bill.date.split('T')[0],
        dueDate: bill.dueDate.split('T')[0],
        reference: bill.reference || '',
        currencyCode: bill.currencyCode || '',
        notes: bill.notes || '',
        projectId: bill.projectId || '',
        lines: bill.lines?.map((line) => ({
          itemId: line.itemId || '',
          accountId: line.accountId ?? '',
          description: line.description,
          quantity: String(line.quantity),
          rate: String(line.rate),
          taxRate: String(line.taxRate || 0),
        })) || [{ accountId: '', description: '', quantity: '1', rate: '', taxRate: '0' }],
      });
    }
  }, [bill, form, addExtraAccount]);

  // Update due date when vendor changes
  const watchVendorId = form.watch('vendorId');
  const watchDate = form.watch('date');

  useEffect(() => {
    if (watchVendorId && watchDate) {
      const vendor = vendors.find((v: Vendor) => v.id === watchVendorId);
      if (vendor) {
        const billDate = new Date(watchDate);
        const dueDate = addDays(billDate, vendor.paymentTerms || 30);
        form.setValue('dueDate', format(dueDate, 'yyyy-MM-dd'));
      }
    }
  }, [watchVendorId, watchDate, vendors, form]);

  const handleSubmit = (data: BillFormData) => {
    const lines = data.lines.map((line) => ({
      itemId: line.itemId || null,
      accountId: line.accountId || null,
      description: line.description,
      // Decimal strings: the API rejects JS numbers for money.
      quantity: toDecimalInput(line.quantity),
      rate: toDecimalInput(line.rate),
      // Empty stays empty so scan review cannot silently turn an unresolved rate into 0%.
      taxRate: toDecimalInput(line.taxRate, ''),
    }));

    const submitData = {
      vendorId: data.vendorId,
      date: data.date,
      dueDate: data.dueDate,
      reference: data.reference || null,
      currencyCode: data.currencyCode || null,
      notes: data.notes || null,
      projectId: data.projectId || null,
      lines,
    };
    onSubmit(submitData);
  };

  // Exact preview; tax is a percentage per line (same rules as the API).
  // Field-level line errors (quantity/rate/tax) shown under the table.
  const rawLineErrors: unknown = form.formState.errors.lines;
  const lineErrors: string[] = Array.isArray(rawLineErrors)
    ? rawLineErrors.flatMap((lineError: unknown, index: number) =>
        lineError && typeof lineError === 'object'
          ? Object.values(lineError as Record<string, unknown>)
              .map((e) =>
                e && typeof e === 'object' && 'message' in e
                  ? (e as { message?: unknown }).message
                  : undefined,
              )
              .filter((m): m is string => typeof m === 'string')
              // Line schema messages are i18n keys under purchases.bills.validation.
              .map((m) =>
                tValidation('line', {
                  line: index + 1,
                  message: tValidation.has(m) ? tValidation(m) : m,
                }),
              )
          : [],
      )
    : [];
  const watchLines = form.watch('lines');
  const totals = computeTotals(watchLines);
  const discrepancies = extractedTotals ? findTotalsDiscrepancies(totals, extractedTotals) : [];
  const extractedDiscount =
    extractedTotals?.discount !== null &&
    extractedTotals?.discount !== undefined &&
    Number(extractedTotals.discount) > 0
      ? String(extractedTotals.discount)
      : null;

  const handleItemSelect = async (index: number, itemId: string, itemOption?: SearchableOption) => {
    if (itemId === 'none' || !itemId) {
      const previousItemId = form.getValues(`lines.${index}.itemId`);
      const previousItem = allItems.find((i) => i.id === previousItemId);
      const currentAccountId = form.getValues(`lines.${index}.accountId`);
      form.setValue(`lines.${index}.itemId`, '');
      if (previousItem?.purchaseAccountId && currentAccountId === previousItem.purchaseAccountId) {
        form.setValue(`lines.${index}.accountId`, '', {
          shouldValidate: form.formState.isSubmitted,
        });
      }
      return;
    }
    const item =
      (itemOption?.data as BillFormItemOption) ||
      allItems.find((i) => i.id === itemId) ||
      items.find((i) => i.id === itemId);

    if (item) {
      addExtraItem(item);
      form.setValue(`lines.${index}.itemId`, item.id);
      form.setValue(`lines.${index}.description`, item.name);
      form.setValue(`lines.${index}.rate`, item.costPrice);

      if (item.purchaseAccountId) {
        if (item.purchaseAccount) {
          addExtraAccount(item.purchaseAccount as BillFormAccountOption);
        } else if (!allAccounts.some((a) => a.id === item.purchaseAccountId)) {
          const getAccountFn =
            fetchAccountById ||
            (async (id: string) => {
              const res = await accountsApi.getOne(id);
              return (res.data?.data || res.data) as BillFormAccountOption;
            });
          try {
            const acc = await getAccountFn(item.purchaseAccountId);
            if (acc) addExtraAccount(acc);
          } catch {
            // Keep going if lookup fails
          }
        }
        form.setValue(`lines.${index}.accountId`, item.purchaseAccountId, {
          shouldValidate: form.formState.isSubmitted,
        });
      } else {
        form.setValue(`lines.${index}.accountId`, '', {
          shouldValidate: form.formState.isSubmitted,
        });
      }
    }
  };

  const initialAccountOptions = useMemo(() => {
    const filtered = allAccounts.filter((a) => a.type === 'EXPENSE' || a.type === 'ASSET');
    return filtered.map((a) => ({
      id: a.id,
      label: `${a.code} · ${a.name}`,
      sublabel: a.type,
      data: a,
    }));
  }, [allAccounts]);

  const initialItemOptions = useMemo(() => {
    return [
      { id: 'none', label: tForm('manualEntry') },
      ...allItems.map((i) => ({
        id: i.id,
        label: i.name,
        sublabel: i.sku || undefined,
        data: i,
      })),
    ];
  }, [allItems, tForm]);

  const handleSearchAccounts = useMemo(() => {
    if (!fetchAccounts) return undefined;
    return async (search: string, page: number) => {
      const res = await fetchAccounts({ search, page, limit: 20 });
      const list: BillFormAccountOption[] = 'data' in res ? res.data : [];
      const meta = 'meta' in res ? res.meta : undefined;
      const filtered = list.filter((a) => a.type === 'EXPENSE' || a.type === 'ASSET');
      return {
        options: filtered.map((a) => ({
          id: a.id,
          label: `${a.code} · ${a.name}`,
          sublabel: a.type,
          data: a,
        })),
        totalPages: meta?.totalPages ?? 1,
        total: meta?.total ?? filtered.length,
      };
    };
  }, [fetchAccounts]);

  const handleSearchItems = useMemo(() => {
    if (!fetchItems) return undefined;
    return async (search: string, page: number) => {
      const res = await fetchItems({ search, page, limit: 20 });
      const list: BillFormItemOption[] = 'data' in res ? res.data : [];
      const meta = 'meta' in res ? res.meta : undefined;
      return {
        options: [
          ...(page === 1 ? [{ id: 'none', label: tForm('manualEntry') }] : []),
          ...list.map((i) => ({
            id: i.id,
            label: i.name,
            sublabel: i.sku || undefined,
            data: i,
          })),
        ],
        totalPages: meta?.totalPages ?? 1,
        total: meta?.total ? meta.total + 1 : list.length + 1,
      };
    };
  }, [fetchItems, tForm]);

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Bill Info */}
      <Card>
        <CardHeader>
          <CardTitle>Bill Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Vendor */}
            <div className="space-y-2">
              <Label htmlFor="vendorId">Vendor *</Label>
              <Select
                value={form.watch('vendorId')}
                onValueChange={(value) => form.setValue('vendorId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor: Vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.vendorId && (
                <p className="text-sm text-red-500">{form.formState.errors.vendorId.message}</p>
              )}
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="date">Bill Date *</Label>
              <Input id="date" type="date" {...form.register('date')} />
              {form.formState.errors.date && (
                <p className="text-sm text-red-500">{form.formState.errors.date.message}</p>
              )}
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date *</Label>
              <Input id="dueDate" type="date" {...form.register('dueDate')} />
              {form.formState.errors.dueDate && (
                <p className="text-sm text-red-500">{form.formState.errors.dueDate.message}</p>
              )}
            </div>
          </div>

          {/* Reference, Currency, Project */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Reference */}
            <div className="space-y-2">
              <Label htmlFor="reference">Reference (Vendor Doc #)</Label>
              <Input id="reference" {...form.register('reference')} placeholder="e.g. INV-001" />
            </div>

            {/* Currency */}
            <div className="space-y-2">
              <Label htmlFor="currencyCode">Currency</Label>
              <Select
                value={form.watch('currencyCode') || ''}
                onValueChange={(value) =>
                  form.setValue('currencyCode', value === 'default' ? '' : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="USD">USD — US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR — Euro</SelectItem>
                  <SelectItem value="EGP">EGP — Egyptian Pound</SelectItem>
                  <SelectItem value="GBP">GBP — British Pound</SelectItem>
                  <SelectItem value="AED">AED — UAE Dirham</SelectItem>
                  <SelectItem value="SAR">SAR — Saudi Riyal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Project */}
            {projects.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="projectId">Project (Optional)</Label>
                <Select
                  value={form.watch('projectId') || ''}
                  onValueChange={(value) =>
                    form.setValue('projectId', value === 'none' ? '' : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Project</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">{tForm('item')}</TableHead>
                <TableHead className="w-[180px]">{tForm('expenseAccount')}</TableHead>
                <TableHead>{tForm('description')}</TableHead>
                <TableHead className="w-[80px]">{tForm('qty')}</TableHead>
                <TableHead className="w-[110px]">{tForm('unitPrice')}</TableHead>
                <TableHead className="w-[110px] text-right">{tForm('amount')}</TableHead>
                <TableHead className="w-[100px]">{tForm('taxPercent')}</TableHead>
                <TableHead className="w-[110px] text-right">{tForm('total')}</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => {
                const lineTotals = totals.lines[index] ?? { net: '0.00', total: '0.00' };

                return (
                  <TableRow key={field.id}>
                    <TableCell data-testid={`line-${index}-item`}>
                      <SearchableSelect
                        value={form.watch(`lines.${index}.itemId`) || 'none'}
                        onValueChange={(value, opt) => handleItemSelect(index, value, opt)}
                        options={initialItemOptions}
                        onSearch={handleSearchItems}
                        placeholder={tForm('itemPlaceholder')}
                        searchPlaceholder={tForm('searchPlaceholder')}
                        emptyText={tForm('noResults')}
                        previousPageText={tForm('previousPage')}
                        nextPageText={tForm('nextPage')}
                        pageOfText={(p, tp) => tForm('pageOf', { page: p, totalPages: tp })}
                        ariaLabel={tForm('item')}
                        dataTestId={`line-${index}-item-select`}
                      />
                    </TableCell>
                    <TableCell data-testid={`line-${index}-account`}>
                      <SearchableSelect
                        value={form.watch(`lines.${index}.accountId`) || ''}
                        onValueChange={(value) =>
                          form.setValue(`lines.${index}.accountId`, value, {
                            shouldValidate: form.formState.isSubmitted,
                          })
                        }
                        options={initialAccountOptions}
                        onSearch={handleSearchAccounts}
                        placeholder={tForm('expenseAccountPlaceholder')}
                        searchPlaceholder={tForm('searchPlaceholder')}
                        emptyText={tForm('noResults')}
                        previousPageText={tForm('previousPage')}
                        nextPageText={tForm('nextPage')}
                        pageOfText={(p, tp) => tForm('pageOf', { page: p, totalPages: tp })}
                        ariaLabel={tForm('expenseAccount')}
                        isInvalid={!!form.formState.errors.lines?.[index]?.accountId}
                        dataTestId={`line-${index}-account-select`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        {...form.register(`lines.${index}.description`)}
                        placeholder={tForm('descriptionPlaceholder')}
                        aria-label={tForm('description')}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        {...form.register(`lines.${index}.quantity`)}
                        type="number"
                        step="0.0001"
                        aria-label={tForm('qty')}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        {...form.register(`lines.${index}.rate`)}
                        type="number"
                        step="0.0001"
                        aria-label={tForm('unitPrice')}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono">{lineTotals.net}</TableCell>
                    <TableCell>
                      <Input
                        {...form.register(`lines.${index}.taxRate`)}
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="0.00"
                        aria-label={tForm('taxPercent')}
                        className="h-8 w-24"
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {lineTotals.total}
                    </TableCell>
                    <TableCell>
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => remove(index)}
                          aria-label={tForm('deleteLine')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {lineErrors.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-destructive" role="alert">
              {lineErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            aria-label={tForm('addLine')}
            onClick={() =>
              append({ accountId: '', description: '', quantity: '1', rate: '', taxRate: '0' })
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            {tForm('addLine')}
          </Button>

          {/* Totals */}
          <div className="mt-6 flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between text-sm">
                <span>{tForm('subtotal')}</span>
                <span className="font-mono">{totals.subtotal}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>{tForm('tax')}</span>
                <span className="font-mono">{totals.taxAmount}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>{tForm('total')}</span>
                <span className="font-mono">{totals.grandTotal}</span>
              </div>
            </div>
          </div>

          {(discrepancies.length > 0 || extractedDiscount !== null) && (
            <div
              role="alert"
              data-testid="totals-discrepancy"
              className="mt-4 rounded-md border border-yellow-500 p-3 text-sm"
            >
              {discrepancies.length > 0 && (
                <>
                  <p className="font-medium text-yellow-700">{tIntake('discrepancyTitle')}</p>
                  <p className="text-muted-foreground">{tIntake('discrepancyBody')}</p>
                  <ul className="mt-2 space-y-1 font-mono">
                    {discrepancies.map((d) => (
                      <li key={d.field}>
                        {tIntake('discrepancyRow', {
                          field: tIntake(`discrepancyField.${d.field}`),
                          extracted: d.extracted,
                          computed: d.computed,
                        })}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {extractedDiscount !== null && (
                <p className="mt-2 text-muted-foreground">
                  {tIntake('discrepancyDiscount', { amount: extractedDiscount })}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea {...form.register('notes')} placeholder="Add notes or terms..." rows={3} />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEditing ? 'Update Bill' : 'Create Bill'}
        </Button>
      </div>
    </form>
  );
}
