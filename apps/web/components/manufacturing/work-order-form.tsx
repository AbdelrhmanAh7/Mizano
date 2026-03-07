'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useCreateWorkOrder,
  useBOMs,
  useBOMRequirements,
  WorkOrder,
  BOM,
} from '@/lib/hooks/use-manufacturing';

interface MaterialRequirement {
  itemId: string;
  itemCode: string;
  itemName: string;
  required: number;
  available: number;
  shortage: number;
}
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const workOrderSchema = z.object({
  bomId: z.string().min(1, 'BOM is required'),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  startDate: z.string().min(1, 'Start date is required'),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

type WorkOrderFormData = z.infer<typeof workOrderSchema>;

interface WorkOrderFormProps {
  workOrder?: WorkOrder;
}

export function WorkOrderForm({ workOrder }: WorkOrderFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const preselectedBomId = searchParams.get('bomId') || '';

  const createWorkOrder = useCreateWorkOrder();
  const { data: bomsData, isLoading: bomsLoading } = useBOMs({ status: 'ACTIVE' });
  const boms: BOM[] = bomsData?.data || [];

  const form = useForm<WorkOrderFormData>({
    resolver: zodResolver(workOrderSchema),
    defaultValues: workOrder
      ? {
          bomId: workOrder.bomId,
          quantity: workOrder.quantity,
          startDate: workOrder.startDate?.split('T')[0] || '',
          dueDate: workOrder.dueDate?.split('T')[0] || '',
          notes: workOrder.notes || '',
        }
      : {
          bomId: preselectedBomId,
          quantity: 1,
          startDate: new Date().toISOString().split('T')[0],
          dueDate: '',
          notes: '',
        },
  });

  const selectedBomId = form.watch('bomId');
  const selectedQuantity = form.watch('quantity');

  const { data: requirementsData } = useBOMRequirements(selectedBomId, selectedQuantity || 1);
  const requirements: MaterialRequirement[] = requirementsData?.data || [];

  const handleSubmit = async (data: WorkOrderFormData) => {
    try {
      const result = await createWorkOrder.mutateAsync({
        bomId: data.bomId,
        quantity: data.quantity,
        startDate: data.startDate,
        dueDate: data.dueDate || undefined,
        notes: data.notes || undefined,
      });
      toast({ title: 'Work order created successfully' });
      router.push(
        `/manufacturing/work-orders/${(result as { id?: string; data?: { id?: string } }).id || (result as { id?: string; data?: { id?: string } }).data?.id}`,
      );
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast({
        title: 'Error',
        description: err.response?.data?.message || 'Failed to create work order',
        variant: 'destructive',
      });
    }
  };

  const hasShortages = requirements.some((r) => r.shortage > 0);

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Work Order Details</CardTitle>
          <CardDescription>Select a BOM and specify production quantity</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Bill of Materials *</Label>
              <Select
                value={form.watch('bomId') || ''}
                onValueChange={(value) => form.setValue('bomId', value)}
                disabled={bomsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a BOM" />
                </SelectTrigger>
                <SelectContent>
                  {boms.map((bom) => (
                    <SelectItem key={bom.id} value={bom.id}>
                      {bom.name} ({bom.outputItem?.name || 'Unknown'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.bomId && (
                <p className="text-sm text-red-500">{form.formState.errors.bomId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Production Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                step="1"
                {...form.register('quantity', { valueAsNumber: true })}
              />
              {form.formState.errors.quantity && (
                <p className="text-sm text-red-500">{form.formState.errors.quantity.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date *</Label>
              <Input id="startDate" type="date" {...form.register('startDate')} />
              {form.formState.errors.startDate && (
                <p className="text-sm text-red-500">{form.formState.errors.startDate.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input id="dueDate" type="date" {...form.register('dueDate')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Optional notes for this work order..."
              rows={3}
              {...form.register('notes')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Material Requirements Preview */}
      {selectedBomId && requirements.length > 0 && (
        <Card className={cn(hasShortages && 'border-orange-200')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Material Requirements Preview
              {hasShortages && (
                <span className="flex items-center gap-1 text-sm text-orange-600 font-normal">
                  <AlertTriangle className="h-4 w-4" />
                  Shortages detected
                </span>
              )}
            </CardTitle>
            <CardDescription>Materials needed based on BOM and production quantity</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Required</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Shortage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requirements.map((req) => (
                  <TableRow key={req.itemId}>
                    <TableCell className="font-medium">
                      <span className="text-xs text-muted-foreground">{req.itemCode}</span>{' '}
                      {req.itemName}
                    </TableCell>
                    <TableCell className="text-right font-mono">{req.required}</TableCell>
                    <TableCell className="text-right font-mono">{req.available}</TableCell>
                    <TableCell className="text-right font-mono">
                      <span className={cn(req.shortage > 0 && 'text-red-600 font-semibold')}>
                        {req.shortage > 0 ? `-${req.shortage}` : '0'}
                      </span>
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
        <Button type="submit" disabled={createWorkOrder.isPending}>
          {createWorkOrder.isPending ? 'Creating...' : 'Create Work Order'}
        </Button>
      </div>
    </form>
  );
}
