'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { ArrowLeft, CalendarIcon, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useBOMs, useBOM, useCreateWorkOrder } from '@/lib/hooks/use-manufacturing';

const workOrderSchema = z.object({
  bomId: z.string().min(1, 'BOM is required'),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  startDate: z.date({ required_error: 'Start date is required' }),
  dueDate: z.date().optional(),
  notes: z.string().optional(),
});

type WorkOrderFormData = z.infer<typeof workOrderSchema>;

export default function NewWorkOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialBomId = searchParams.get('bomId') || '';

  const [selectedBomId, setSelectedBomId] = useState(initialBomId);

  const { data: bomsData, isLoading: bomsLoading } = useBOMs({ status: 'ACTIVE' });
  const { data: selectedBom } = useBOM(selectedBomId);
  const createWorkOrder = useCreateWorkOrder();

  const boms = bomsData?.data || [];

  const form = useForm<WorkOrderFormData>({
    resolver: zodResolver(workOrderSchema),
    defaultValues: {
      bomId: initialBomId,
      quantity: 1,
      startDate: new Date(),
      notes: '',
    },
  });

  const quantity = form.watch('quantity') || 1;

  const handleSubmit = async (data: WorkOrderFormData) => {
    try {
      const payload = {
        ...data,
        startDate: format(data.startDate, 'yyyy-MM-dd'),
        dueDate: data.dueDate ? format(data.dueDate, 'yyyy-MM-dd') : undefined,
      };
      await createWorkOrder.mutateAsync(payload);
      router.push('/manufacturing/work-orders');
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleBomChange = (bomId: string) => {
    setSelectedBomId(bomId);
    form.setValue('bomId', bomId);
  };

  // Calculate material requirements
  const components = selectedBom?.components || [];
  const requirements = components.map((c: any) => ({
    itemId: c.itemId,
    itemName: c.itemName || c.item?.name,
    itemCode: c.itemCode || c.item?.code,
    required: c.quantity * quantity,
    available: c.item?.stockLevel || 0,
    shortage: Math.max(0, (c.quantity * quantity) - (c.item?.stockLevel || 0)),
    unit: c.unit || c.item?.unit || 'pc',
  }));

  const hasShortage = requirements.some((r: any) => r.shortage > 0);

  if (bomsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/manufacturing/work-orders">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Work Order</h1>
          <p className="text-muted-foreground">
            Start a new production order from a BOM
          </p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Work Order Details */}
        <Card>
          <CardHeader>
            <CardTitle>Work Order Details</CardTitle>
            <CardDescription>
              Select a BOM and specify the quantity to produce
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bill of Materials *</Label>
                <Select
                  value={form.watch('bomId') || ''}
                  onValueChange={handleBomChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select BOM" />
                  </SelectTrigger>
                  <SelectContent>
                    {boms.map((bom: any) => (
                      <SelectItem key={bom.id} value={bom.id}>
                        {bom.name} ({bom.outputItem?.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.bomId && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.bomId.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity to Produce *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="1"
                  {...form.register('quantity', { valueAsNumber: true })}
                />
                {selectedBom && (
                  <p className="text-xs text-muted-foreground">
                    BOM produces {selectedBom.outputQuantity} per batch
                  </p>
                )}
                {form.formState.errors.quantity && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.quantity.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !form.watch('startDate') && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.watch('startDate')
                        ? format(form.watch('startDate'), 'PPP')
                        : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.watch('startDate')}
                      onSelect={(date) => date && form.setValue('startDate', date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Due Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !form.watch('dueDate') && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.watch('dueDate')
                        ? format(form.watch('dueDate'), 'PPP')
                        : 'Pick a date (optional)'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.watch('dueDate')}
                      onSelect={(date) => form.setValue('dueDate', date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes..."
                {...form.register('notes')}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Material Requirements */}
        {selectedBom && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Material Requirements</CardTitle>
                  <CardDescription>
                    Required materials for producing {quantity} unit{quantity > 1 ? 's' : ''}
                  </CardDescription>
                </div>
                {hasShortage ? (
                  <Badge variant="outline" className="bg-red-100 text-red-800">
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    Material Shortage
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-green-100 text-green-800">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Stock Available
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead className="text-right">Required</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Shortage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requirements.map((req: any, index: number) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono">{req.itemCode}</TableCell>
                      <TableCell>{req.itemName}</TableCell>
                      <TableCell className="text-right font-mono">
                        {req.required} {req.unit}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {req.available} {req.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        {req.shortage > 0 ? (
                          <span className="text-red-600 font-mono">
                            -{req.shortage} {req.unit}
                          </span>
                        ) : (
                          <span className="text-green-600">OK</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={createWorkOrder.isPending || !selectedBomId}>
            {createWorkOrder.isPending ? 'Creating...' : 'Create Work Order'}
          </Button>
        </div>
      </form>
    </div>
  );
}
