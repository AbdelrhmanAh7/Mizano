'use client';

import { format } from 'date-fns';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useCustomers } from '@/lib/hooks/use-customers';
import { useItems } from '@/lib/hooks/use-items';
import {
  useCreateDeliveryChallan,
  type ChallanType,
  type CreateDeliveryChallanDto,
} from '@/lib/hooks/use-delivery-challans';

interface ChallanLine {
  itemId: string;
  quantity: string;
  description: string;
  warehouseId?: string;
}

const CHALLAN_TYPES: ChallanType[] = ['SUPPLY', 'JOB_WORK', 'SAMPLE'];

const CHALLAN_TYPE_KEYS: Record<ChallanType, 'supply' | 'jobWork' | 'sample'> = {
  SUPPLY: 'supply',
  JOB_WORK: 'jobWork',
  SAMPLE: 'sample',
};

export default function NewDeliveryChallanPage() {
  const router = useRouter();
  const t = useTranslations('sales');
  const tCommon = useTranslations('common');
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const createChallan = useCreateDeliveryChallan();
  const { data: customersData } = useCustomers();
  const { data: itemsData } = useItems();

  const customers: Array<{ id: string; name: string }> = customersData?.data ?? [];
  const items: Array<{ id: string; name: string; sku?: string | null }> = itemsData?.data ?? [];

  const [customerId, setCustomerId] = useState(searchParams.get('customerId') ?? '');
  const [challanType, setChallanType] = useState<ChallanType>('SUPPLY');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<ChallanLine[]>([
    { itemId: '', quantity: '1', description: '' },
  ]);

  const addLine = () => {
    setLines((prev) => [...prev, { itemId: '', quantity: '1', description: '' }]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, field: keyof ChallanLine, value: string) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerId) {
      toast({
        title: t('deliveryChallans.toast.validationError'),
        description: t('deliveryChallans.toast.customerRequired'),
        variant: 'destructive',
      });
      return;
    }

    const validLines = lines.filter((l) => l.itemId && Number(l.quantity) > 0);
    if (validLines.length === 0) {
      toast({
        title: t('deliveryChallans.toast.validationError'),
        description: t('deliveryChallans.toast.linesRequired'),
        variant: 'destructive',
      });
      return;
    }

    const dto: CreateDeliveryChallanDto = {
      customerId,
      challanType,
      date,
      notes: notes || undefined,
      lines: validLines.map((l) => ({
        itemId: l.itemId,
        quantity: Number(l.quantity),
        description: l.description || undefined,
        warehouseId: l.warehouseId || undefined,
      })),
    };

    try {
      await createChallan.mutateAsync(dto);
      toast({
        title: t('deliveryChallans.newChallan'),
        description: t('deliveryChallans.toast.created'),
      });
      router.push('/sales/delivery-challans');
    } catch (error: unknown) {
      const msg =
        (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
        t('deliveryChallans.toast.createError');
      toast({ title: t('toast.error'), description: msg, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/sales/delivery-challans">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('deliveryChallans.newChallan')}</h1>
          <p className="text-muted-foreground">{t('deliveryChallans.description')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('deliveryChallans.newChallan')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="customer">{t('deliveryChallans.customer')}</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger id="customer">
                    <SelectValue placeholder={t('deliveryChallans.selectCustomer')} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="challanType">{t('deliveryChallans.type')}</Label>
                <Select value={challanType} onValueChange={(v) => setChallanType(v as ChallanType)}>
                  <SelectTrigger id="challanType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHALLAN_TYPES.map((ct) => (
                      <SelectItem key={ct} value={ct}>
                        {t(`deliveryChallans.types.${CHALLAN_TYPE_KEYS[ct]}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">{t('deliveryChallans.date')}</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="notes">{t('deliveryChallans.notes')}</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('deliveryChallans.lineItems')}</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="mr-2 h-4 w-4" />
                {t('deliveryChallans.addLine')}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {lines.map((line, index) => (
                <div key={index} className="flex items-end gap-3">
                  <div className="flex-1 space-y-2">
                    <Label>{t('lineItems.item')}</Label>
                    <Select
                      value={line.itemId}
                      onValueChange={(v) => updateLine(index, 'itemId', v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('deliveryChallans.selectItem')} />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} {item.sku ? `(${item.sku})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24 space-y-2">
                    <Label>{t('lineItems.quantity')}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) => updateLine(index, 'quantity', e.target.value)}
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label>{t('lineItems.description')}</Label>
                    <Input
                      value={line.description}
                      onChange={(e) => updateLine(index, 'description', e.target.value)}
                      placeholder={t('deliveryChallans.optional')}
                    />
                  </div>
                  {lines.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" asChild>
              <Link href="/sales/delivery-challans">{t('deliveryChallans.backToChallans')}</Link>
            </Button>
            <Button type="submit" disabled={createChallan.isPending}>
              {createChallan.isPending
                ? tCommon('loading.creating')
                : t('deliveryChallans.newChallan')}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
