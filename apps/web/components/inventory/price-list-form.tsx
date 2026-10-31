'use client';

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
  CreatePriceListData,
  PRICE_LIST_TYPES,
  PriceListType,
  usePriceListTypeLabel,
} from '@/lib/hooks/use-price-lists';

const priceListSchema = z.object({
  name: z.string().trim().min(1, 'nameRequired').max(200, 'nameTooLong'),
  description: z.string().max(500),
  type: z.enum(PRICE_LIST_TYPES),
  // Decimal(10, 4): a markup (10) or markdown (-10), never a float.
  adjustment: z
    .string()
    .trim()
    .regex(/^-?\d{1,6}(\.\d{1,4})?$/, 'adjustmentInvalid'),
});

type PriceListFormData = z.infer<typeof priceListSchema>;

/** The one body POST /price-lists accepts: an empty description is left out. */
export function toPriceListPayload(data: PriceListFormData): CreatePriceListData {
  return {
    name: data.name.trim(),
    description: data.description.trim() || undefined,
    type: data.type,
    adjustment: data.adjustment.trim(),
  };
}

interface PriceListFormProps {
  onSubmit: (data: CreatePriceListData) => void;
  isSubmitting?: boolean;
}

export function PriceListForm({ onSubmit, isSubmitting }: PriceListFormProps): JSX.Element {
  const t = useTranslations('inventory');
  const tForm = useTranslations('inventory.priceLists.form');
  const typeLabel = usePriceListTypeLabel();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PriceListFormData>({
    resolver: zodResolver(priceListSchema),
    defaultValues: { name: '', description: '', type: 'PERCENTAGE', adjustment: '0' },
  });
  const errorText = (message?: string): JSX.Element | null =>
    message ? <p className="text-sm text-destructive">{tForm(`errors.${message}`)}</p> : null;

  return (
    <form
      onSubmit={handleSubmit((data) => onSubmit(toPriceListPayload(data)))}
      className="space-y-6"
    >
      <Card>
        <CardHeader>
          <CardTitle>{t('priceLists.priceListDetails')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{tForm('name')} *</Label>
              <Input id="name" {...register('name')} placeholder={tForm('namePlaceholder')} />
              {errorText(errors.name?.message)}
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">{tForm('type')} *</Label>
              <Select
                value={watch('type')}
                onValueChange={(v) => v && setValue('type', v as PriceListType)}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRICE_LIST_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {typeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjustment">{tForm('adjustment')} *</Label>
              <Input id="adjustment" inputMode="decimal" dir="ltr" {...register('adjustment')} />
              <p className="text-xs text-muted-foreground">{tForm('adjustmentHint')}</p>
              {errorText(errors.adjustment?.message)}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">{tForm('description')}</Label>
            <Textarea id="description" {...register('description')} rows={2} />
          </div>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? tForm('creating') : t('priceLists.newPriceList')}
        </Button>
      </div>
    </form>
  );
}
