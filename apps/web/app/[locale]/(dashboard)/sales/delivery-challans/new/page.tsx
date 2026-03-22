'use client';

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

export default function NewDeliveryChallanPage() {
  const router = useRouter();
  const t = useTranslations('sales');
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const createChallan = useCreateDeliveryChallan();
  const { data: customersData } = useCustomers();
  const { data: itemsData } = useItems();

  const customers = customersData?.data ?? [];
  const items = itemsData?.data ?? [];

  const [customerId, setCustomerId] = useState(searchParams.get('customerId') ?? '');
  const [challanType, setChallanType] = useState<ChallanType>('SUPPLY');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
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
        title: 'Validation Error',
        description: 'Please select a customer.',
        variant: 'destructive',
      });
      return;
    }

    const validLines = lines.filter((l) => l.itemId && Number(l.quantity) > 0);
    if (validLines.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please add at least one line item.',
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
        description: 'Delivery challan created successfully.',
      });
      router.push('/sales/delivery-challans');
    } catch (error: unknown) {
      const msg =
        (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
        'Failed to create delivery challan';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
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
                    <SelectValue placeholder="Select customer" />
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
                        {ct.replace('_', ' ')}
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
                Add Line
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {lines.map((line, index) => (
                <div key={index} className="flex items-end gap-3">
                  <div className="flex-1 space-y-2">
                    <Label>Item</Label>
                    <Select
                      value={line.itemId}
                      onValueChange={(v) => updateLine(index, 'itemId', v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select item" />
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
                    <Label>Qty</Label>
                    <Input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) => updateLine(index, 'quantity', e.target.value)}
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label>Description</Label>
                    <Input
                      value={line.description}
                      onChange={(e) => updateLine(index, 'description', e.target.value)}
                      placeholder="Optional"
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
              {createChallan.isPending ? 'Creating...' : t('deliveryChallans.newChallan')}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
