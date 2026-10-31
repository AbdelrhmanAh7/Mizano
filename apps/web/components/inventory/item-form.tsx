'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CreateItemData,
  Item,
  ItemType,
  ITEM_TYPES,
  UNIT_CODES,
  useItemTypeLabel,
} from '@/lib/hooks/use-items';

/** Decimal(19, 4) money as typed: digits, an optional point and at most 4 decimals. */
const PRICE_RE = /^\d{1,15}(\.\d{1,4})?$/;

const itemSchema = z.object({
  name: z.string().trim().min(1, 'nameRequired').max(200, 'nameTooLong'),
  sku: z.string().trim().min(1, 'skuRequired').max(50, 'skuTooLong'),
  description: z.string().max(500, 'descriptionTooLong'),
  type: z.enum(ITEM_TYPES),
  unit: z.string(),
  sellingPrice: z.string().trim().regex(PRICE_RE, 'priceInvalid'),
  costPrice: z.string().trim().regex(PRICE_RE, 'priceInvalid'),
  reorderPoint: z
    .string()
    .trim()
    .regex(/^\d{0,9}$/, 'reorderPointInvalid'),
  salesAccountId: z.string(),
  purchaseAccountId: z.string(),
  inventoryAccountId: z.string(),
});

type ItemFormData = z.infer<typeof itemSchema>;

/**
 * The one payload the items API accepts (CreateItemDto / UpdateItemDto): prices travel as decimal
 * strings, a cleared optional field is null (not ''), and fields the API does not store are never
 * sent — its whitelist rejects them.
 */
export function toItemPayload(data: ItemFormData): CreateItemData {
  return {
    name: data.name.trim(),
    sku: data.sku.trim(),
    type: data.type,
    unit: data.unit || undefined,
    description: data.description.trim() || null,
    sellingPrice: data.sellingPrice.trim(),
    costPrice: data.costPrice.trim(),
    reorderPoint: data.type === 'SERVICE' || !data.reorderPoint ? null : Number(data.reorderPoint),
    salesAccountId: data.salesAccountId || null,
    purchaseAccountId: data.purchaseAccountId || null,
    inventoryAccountId: data.type === 'SERVICE' ? null : data.inventoryAccountId || null,
  };
}

function toFormData(item: Item): ItemFormData {
  return {
    name: item.name || '',
    sku: item.sku || '',
    description: item.description || '',
    type: item.type || 'GOODS',
    unit: item.unit || 'pcs',
    sellingPrice: item.sellingPrice ?? '0',
    costPrice: item.costPrice ?? '0',
    reorderPoint: item.reorderPoint == null ? '' : String(item.reorderPoint),
    salesAccountId: item.salesAccountId || '',
    purchaseAccountId: item.purchaseAccountId || '',
    inventoryAccountId: item.inventoryAccountId || '',
  };
}

const EMPTY_FORM: ItemFormData = {
  name: '',
  sku: '',
  description: '',
  type: 'GOODS',
  unit: 'pcs',
  sellingPrice: '0',
  costPrice: '0',
  reorderPoint: '',
  salesAccountId: '',
  purchaseAccountId: '',
  inventoryAccountId: '',
};

type AccountOption = { id: string; name: string; code: string; type: string };

interface ItemFormProps {
  item?: Item | null;
  accounts: AccountOption[];
  onSubmit: (data: CreateItemData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function ItemForm({
  item,
  accounts,
  onSubmit,
  onCancel,
  isSubmitting,
}: ItemFormProps): JSX.Element {
  const t = useTranslations('inventory.items.form');
  const tCommon = useTranslations('inventory.common');
  const typeLabel = useItemTypeLabel();
  const isEditing = !!item;

  const form = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: EMPTY_FORM,
  });
  const { errors } = form.formState;
  const errorText = (message?: string): JSX.Element | null =>
    message ? <p className="text-sm text-destructive">{t(`errors.${message}`)}</p> : null;

  useEffect(() => {
    if (item) form.reset(toFormData(item));
  }, [item, form]);

  const watchType = form.watch('type');
  const isService = watchType === 'SERVICE';

  const incomeAccounts = accounts.filter((a) => a.type === 'INCOME');
  const expenseAccounts = accounts.filter((a) => a.type === 'EXPENSE');
  const assetAccounts = accounts.filter((a) => a.type === 'ASSET');

  const accountSelect = (
    field: 'salesAccountId' | 'purchaseAccountId' | 'inventoryAccountId',
    options: AccountOption[],
  ): JSX.Element => (
    <Select
      value={form.watch(field) || 'none'}
      onValueChange={(value) => value && form.setValue(field, value === 'none' ? '' : value)}
    >
      <SelectTrigger id={field}>
        <SelectValue placeholder={t('selectAccount')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{t('noAccount')}</SelectItem>
        {options.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            {account.code} - {account.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <form
      onSubmit={form.handleSubmit((data) => onSubmit(toItemPayload(data)))}
      className="space-y-6"
    >
      <Card>
        <CardHeader>
          <CardTitle>{t('basicInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('name')} *</Label>
              <Input id="name" placeholder={t('namePlaceholder')} {...form.register('name')} />
              {errorText(errors.name?.message)}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sku">{t('sku')} *</Label>
              <Input
                id="sku"
                dir="ltr"
                placeholder={t('skuPlaceholder')}
                {...form.register('sku')}
              />
              {errorText(errors.sku?.message)}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">{t('type')} *</Label>
              <Select
                value={watchType}
                onValueChange={(value) => value && form.setValue('type', value as ItemType)}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      <div>
                        <div className="font-medium">{typeLabel(type)}</div>
                        <div className="text-xs text-muted-foreground">
                          {t(`typeDescriptions.${type}`)}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">{t('unit')}</Label>
              <Select
                value={form.watch('unit') || 'pcs'}
                onValueChange={(value) => value && form.setValue('unit', value)}
              >
                <SelectTrigger id="unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_CODES.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {t(`units.${unit}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('description')}</Label>
            <Textarea
              id="description"
              placeholder={t('descriptionPlaceholder')}
              {...form.register('description')}
              rows={3}
            />
            {errorText(errors.description?.message)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('pricing')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="sellingPrice">{t('sellingPrice')} *</Label>
            <Input
              id="sellingPrice"
              inputMode="decimal"
              dir="ltr"
              placeholder="0.00"
              {...form.register('sellingPrice')}
            />
            {errorText(errors.sellingPrice?.message)}
          </div>
          <div className="space-y-2">
            <Label htmlFor="costPrice">{t('costPrice')}</Label>
            <Input
              id="costPrice"
              inputMode="decimal"
              dir="ltr"
              placeholder="0.00"
              {...form.register('costPrice')}
            />
            {errorText(errors.costPrice?.message)}
          </div>
        </CardContent>
      </Card>

      {!isService && (
        <Card>
          <CardHeader>
            <CardTitle>{t('inventory')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isEditing && <p className="text-sm text-muted-foreground">{t('openingStockHint')}</p>}
            <div className="space-y-2 md:w-1/3">
              <Label htmlFor="reorderPoint">{t('reorderPoint')}</Label>
              <Input
                id="reorderPoint"
                inputMode="numeric"
                dir="ltr"
                placeholder="10"
                {...form.register('reorderPoint')}
              />
              <p className="text-xs text-muted-foreground">{t('reorderPointHint')}</p>
              {errorText(errors.reorderPoint?.message)}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('accounting')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="salesAccountId">{t('salesAccount')}</Label>
            {accountSelect('salesAccountId', incomeAccounts)}
            <p className="text-xs text-muted-foreground">{t('salesAccountHint')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="purchaseAccountId">{t('purchaseAccount')}</Label>
            {accountSelect('purchaseAccountId', expenseAccounts)}
            <p className="text-xs text-muted-foreground">{t('purchaseAccountHint')}</p>
          </div>
          {!isService && (
            <div className="space-y-2">
              <Label htmlFor="inventoryAccountId">{t('inventoryAccount')}</Label>
              {accountSelect('inventoryAccountId', assetAccounts)}
              <p className="text-xs text-muted-foreground">{t('inventoryAccountHint')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          {tCommon('cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('saving') : isEditing ? t('update') : t('create')}
        </Button>
      </div>
    </form>
  );
}
