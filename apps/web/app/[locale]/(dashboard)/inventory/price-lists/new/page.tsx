'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useForm } from 'react-hook-form';
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
import { useCreatePriceList } from '@/lib/hooks/use-price-lists';

export default function NewPriceListPage() {
  const router = useRouter();
  const createPriceList = useCreatePriceList();
  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: { name: '', description: '', type: 'SALES' },
  });

  const onSubmit = async (data: any) => {
    try {
      await createPriceList.mutateAsync(data);
      router.push('/inventory/price-lists');
    } catch {
      // Error handled by hook
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/inventory/price-lists">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Price List</h1>
          <p className="text-muted-foreground">Create a new pricing tier</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Price List Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input id="name" {...register('name')} placeholder="e.g., Wholesale Pricing" />
              </div>
              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={watch('type')} onValueChange={(v) => setValue('type', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SALES">Sales</SelectItem>
                    <SelectItem value="PURCHASE">Purchase</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" {...register('description')} rows={2} />
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" disabled={createPriceList.isPending}>
            {createPriceList.isPending ? 'Creating...' : 'Create Price List'}
          </Button>
        </div>
      </form>
    </div>
  );
}
