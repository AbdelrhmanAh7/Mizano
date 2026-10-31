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
import { Bill, useBillAccountOptions } from '@/lib/hooks/use-bills';
import { useVendors, Vendor } from '@/lib/hooks/use-vendors';
import { zodResolver } from '@hookform/resolvers/zod';
import { addDays, format } from 'date-fns';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFieldArray, useForm, type Resolver } from 'react-hook-form';
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

const CURRENCY_CODES = ['USD', 'EUR', 'EGP', 'GBP', 'AED', 'SAR'] as const;

// Messages are keys under purchases.bills.validation.
const lineSchema = z.object({
  itemId: z.string().optional(),
  // The API refuses to approve a bill with any line lacking an account.
  accountId: z.string().min(1, 'accountRequired'),
  description: z.string().min(1, 'descriptionRequired'),
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
  vendorId: z.string().min(1, 'vendorRequired'),
  date: z.string().min(1, 'dateRequired'),
  dueDate: z.string().min(1, 'dueDateRequired'),
  reference: z.string().optional(),
  currencyCode: z.string().optional(),
  notes: z.string().optional(),
  projectId: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'lineItemRequired'),
});

type BillFormData = z.infer<typeof billSchema>;

/**
 * A line account must be one the API accepts (GET /bills/account-options). A draft saved earlier
 * may reference an account that was since deactivated or made a control account.
 */
function createBillSchema(eligibleAccountIds: ReadonlySet<string> | null) {
  if (!eligibleAccountIds) return billSchema;
  return billSchema.superRefine((data, ctx) => {
    data.lines.forEach((line, index) => {
      if (line.accountId && !eligibleAccountIds.has(line.accountId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'accountInvalidType',
          path: ['lines', index, 'accountId'],
        });
      }
    });
  });
}

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
    accountId?: string;
  }>;
}

export interface BillFormItemOption {
  id: string;
  name: string;
  sku: string;
  costPrice: string;
  /** The item's purchase (expense) account, used as the line's default account. */
  purchaseAccountId?: string | null;
}

interface BillFormProps {
  bill?: Bill | null;
  items?: BillFormItemOption[];
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

const emptyLine = (accountId = '') => ({
  accountId,
  description: '',
  quantity: '1',
  rate: '',
  taxRate: '0',
});

export function BillForm({
  bill,
  items = [],
  projects = [],
  onSubmit,
  onCancel,
  isSubmitting,
  defaultVendorId,
  scanDefaults,
  extractedTotals,
}: BillFormProps) {
  const isEditing = !!bill;
  const tForm = useTranslations('purchases.bills.form');
  const tValidation = useTranslations('purchases.bills.validation');
  const tIntake = useTranslations('ai.intake');
  const { data: vendorsData } = useVendors({ limit: 100 });
  const vendors = useMemo(() => vendorsData?.data || [], [vendorsData?.data]);

  const translateError = useCallback(
    (message?: string) =>
      message ? (tValidation.has(message) ? tValidation(message) : message) : undefined,
    [tValidation],
  );

  // Resolved through a ref so the account check always uses the latest loaded options.
  const schemaRef = useRef<ReturnType<typeof createBillSchema>>(billSchema);
  const form = useForm<BillFormData>({
    resolver: ((values, context, options) =>
      zodResolver(schemaRef.current)(values, context, options)) as Resolver<BillFormData>,
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
            accountId: l.accountId ?? '',
            description: l.description,
            quantity: l.quantity,
            rate: l.rate,
            // Scan review leaves an unresolved tax rate empty; do not default it to 0.
            taxRate: l.taxRate ?? '0',
          }))
        : [emptyLine()],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  // Update due date when vendor changes
  const watchVendorId = form.watch('vendorId');
  const watchDate = form.watch('date');

  // Expense/asset accounts the API accepts on a line, plus this vendor's last-used one.
  const accountOptionsQuery = useBillAccountOptions(watchVendorId || undefined);
  const accountOptions = useMemo(
    () => accountOptionsQuery.data?.data ?? [],
    [accountOptionsQuery.data?.data],
  );
  const accountsReady = accountOptionsQuery.isSuccess;
  const accountsFailed = accountOptionsQuery.isError && !accountOptionsQuery.data;
  const vendorDefaultAccountId = accountOptionsQuery.isPlaceholderData
    ? null
    : (accountOptionsQuery.data?.vendorDefaultAccountId ?? null);
  const eligibleAccountIds = useMemo(
    () => (accountsReady ? new Set(accountOptions.map((a) => a.id)) : null),
    [accountsReady, accountOptions],
  );
  const schema = useMemo(() => createBillSchema(eligibleAccountIds), [eligibleAccountIds]);
  schemaRef.current = schema;

  useEffect(() => {
    if (bill) {
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
        })) || [emptyLine()],
      });
    }
  }, [bill, form]);

  // Lines without an account (and without an item that brings one) take the vendor's last-used
  // account once it is known; a choice already made is never overwritten.
  useEffect(() => {
    if (!vendorDefaultAccountId) return;
    form.getValues('lines').forEach((line, index) => {
      if (!line.accountId && !line.itemId) {
        form.setValue(`lines.${index}.accountId`, vendorDefaultAccountId, {
          shouldValidate: form.formState.isSubmitted,
        });
      }
    });
  }, [vendorDefaultAccountId, form]);

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
    // Never submit while the account options are unknown: the line accounts can't be checked.
    if (!accountsReady) return;
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
  // Field-level line errors (account/quantity/rate/tax) shown under the table.
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
              .map((m) =>
                tValidation('line', {
                  line: index + 1,
                  message: translateError(m) ?? m,
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

  const handleItemSelect = (index: number, itemId: string) => {
    // An account that came from the previous item follows it out; one picked by hand stays.
    const previousItem = items.find((i) => i.id === form.getValues(`lines.${index}.itemId`));
    const currentAccountId = form.getValues(`lines.${index}.accountId`);
    const fromPreviousItem =
      !!previousItem?.purchaseAccountId && currentAccountId === previousItem.purchaseAccountId;
    const fallbackAccountId =
      fromPreviousItem || !currentAccountId ? (vendorDefaultAccountId ?? '') : currentAccountId;
    const setAccount = (accountId: string) =>
      form.setValue(`lines.${index}.accountId`, accountId, {
        shouldValidate: form.formState.isSubmitted,
      });

    if (itemId === 'none') {
      form.setValue(`lines.${index}.itemId`, '');
      setAccount(fallbackAccountId);
      return;
    }
    const item = items.find((i) => i.id === itemId);
    if (item) {
      form.setValue(`lines.${index}.itemId`, item.id);
      form.setValue(`lines.${index}.description`, item.name);
      form.setValue(`lines.${index}.rate`, item.costPrice);
      setAccount(
        item.purchaseAccountId && eligibleAccountIds?.has(item.purchaseAccountId)
          ? item.purchaseAccountId
          : fallbackAccountId,
      );
    }
  };

  const required = <span className="text-destructive">*</span>;

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Bill Info */}
      <Card>
        <CardHeader>
          <CardTitle>{tForm('billInformation')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Vendor */}
            <div className="space-y-2">
              <Label htmlFor="vendorId">
                {tForm('vendor')} {required}
              </Label>
              <Select
                value={form.watch('vendorId')}
                onValueChange={(value) => form.setValue('vendorId', value)}
              >
                <SelectTrigger id="vendorId">
                  <SelectValue placeholder={tForm('vendorPlaceholder')} />
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
                <p className="text-sm text-red-500">
                  {translateError(form.formState.errors.vendorId.message)}
                </p>
              )}
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="date">
                {tForm('date')} {required}
              </Label>
              <Input id="date" type="date" {...form.register('date')} />
              {form.formState.errors.date && (
                <p className="text-sm text-red-500">
                  {translateError(form.formState.errors.date.message)}
                </p>
              )}
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <Label htmlFor="dueDate">
                {tForm('dueDate')} {required}
              </Label>
              <Input id="dueDate" type="date" {...form.register('dueDate')} />
              {form.formState.errors.dueDate && (
                <p className="text-sm text-red-500">
                  {translateError(form.formState.errors.dueDate.message)}
                </p>
              )}
            </div>
          </div>

          {/* Reference, Currency, Project */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Reference */}
            <div className="space-y-2">
              <Label htmlFor="reference">{tForm('referenceLabel')}</Label>
              <Input
                id="reference"
                {...form.register('reference')}
                placeholder={tForm('referencePlaceholder')}
              />
            </div>

            {/* Currency */}
            <div className="space-y-2">
              <Label htmlFor="currencyCode">{tForm('currency')}</Label>
              <Select
                value={form.watch('currencyCode') || ''}
                onValueChange={(value) =>
                  form.setValue('currencyCode', value === 'default' ? '' : value)
                }
              >
                <SelectTrigger id="currencyCode">
                  <SelectValue placeholder={tForm('currencyPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{tForm('defaultCurrency')}</SelectItem>
                  {CURRENCY_CODES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {tForm(`currencies.${code}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Project */}
            {projects.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="projectId">{tForm('projectOptional')}</Label>
                <Select
                  value={form.watch('projectId') || ''}
                  onValueChange={(value) =>
                    form.setValue('projectId', value === 'none' ? '' : value)
                  }
                >
                  <SelectTrigger id="projectId">
                    <SelectValue placeholder={tForm('projectPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tForm('noProject')}</SelectItem>
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
          <CardTitle>{tForm('lineItems')}</CardTitle>
        </CardHeader>
        <CardContent>
          {accountsFailed && (
            <div
              role="alert"
              data-testid="account-options-error"
              className="mb-4 flex items-center justify-between gap-3 rounded-md border border-destructive p-3 text-sm text-destructive"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {tForm('accountsLoadFailed')}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void accountOptionsQuery.refetch()}
              >
                {tForm('retry')}
              </Button>
            </div>
          )}
          {accountsReady && accountOptions.length === 0 && (
            <p
              role="alert"
              data-testid="account-options-empty"
              className="mb-4 rounded-md border border-yellow-500 p-3 text-sm"
            >
              {tForm('accountsEmpty')}
            </p>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">{tForm('item')}</TableHead>
                <TableHead className="w-[200px]">{tForm('expenseAccount')}</TableHead>
                <TableHead>{tForm('description')}</TableHead>
                <TableHead className="w-[80px]">{tForm('qty')}</TableHead>
                <TableHead className="w-[110px]">{tForm('unitPrice')}</TableHead>
                <TableHead className="w-[110px] text-end">{tForm('amount')}</TableHead>
                <TableHead className="w-[100px]">{tForm('taxPercent')}</TableHead>
                <TableHead className="w-[110px] text-end">{tForm('total')}</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => {
                const lineTotals = totals.lines[index] ?? { net: '0.00', total: '0.00' };
                const accountError = form.formState.errors.lines?.[index]?.accountId;

                return (
                  <TableRow key={field.id}>
                    <TableCell data-testid={`line-${index}-item`}>
                      <Select
                        value={form.watch(`lines.${index}.itemId`) || 'none'}
                        onValueChange={(value) => handleItemSelect(index, value)}
                      >
                        <SelectTrigger className="h-8" aria-label={tForm('item')}>
                          <SelectValue placeholder={tForm('itemPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{tForm('manualEntry')}</SelectItem>
                          {items.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell data-testid={`line-${index}-account`}>
                      <Select
                        value={form.watch(`lines.${index}.accountId`) || ''}
                        onValueChange={(value) =>
                          form.setValue(`lines.${index}.accountId`, value, {
                            shouldValidate: form.formState.isSubmitted,
                          })
                        }
                        disabled={!accountsReady}
                      >
                        <SelectTrigger
                          className="h-8"
                          aria-label={tForm('expenseAccount')}
                          aria-invalid={!!accountError}
                        >
                          <SelectValue
                            placeholder={
                              accountsReady
                                ? tForm('expenseAccountPlaceholder')
                                : tForm('accountsLoading')
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {accountOptions.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.code} · {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                    <TableCell className="text-end font-mono">{lineTotals.net}</TableCell>
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
                    <TableCell className="text-end font-mono font-semibold">
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
            onClick={() => append(emptyLine(vendorDefaultAccountId ?? ''))}
          >
            <Plus className="me-2 h-4 w-4" />
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
          <CardTitle>{tForm('notes')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            {...form.register('notes')}
            placeholder={tForm('notesPlaceholder')}
            aria-label={tForm('notes')}
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          {tForm('cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting || !accountsReady}>
          {isSubmitting ? tForm('saving') : isEditing ? tForm('updateBill') : tForm('createBill')}
        </Button>
      </div>
    </form>
  );
}
