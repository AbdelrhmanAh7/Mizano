'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useCreateDeal, useLeads, Deal, DealStage, getDealStageLabel } from '@/lib/hooks/use-crm';
import { useToast } from '@/components/ui/use-toast';

const STAGES: DealStage[] = ['NEW', 'MEETING_SCHEDULED', 'PROPOSAL_SENT', 'NEGOTIATION'];

const dealSchema = z.object({
  dealName: z.string().min(1, 'Deal name is required'),
  leadId: z.string().optional(),
  expectedAmount: z.number().min(0, 'Amount must be 0 or higher'),
  probability: z.number().min(0).max(100).default(50),
  expectedCloseDate: z.string().optional(),
});

type DealFormData = z.infer<typeof dealSchema>;

interface DealFormProps {
  deal?: Deal;
}

export function DealForm({ deal }: DealFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const preselectedLeadId = searchParams.get('leadId') || '';

  const createDeal = useCreateDeal();
  const { data: leadsData, isLoading: leadsLoading } = useLeads({ status: 'QUALIFIED' });
  const leads = leadsData?.data || [];

  const form = useForm<DealFormData>({
    resolver: zodResolver(dealSchema),
    defaultValues: deal
      ? {
          dealName: deal.dealName,
          leadId: deal.leadId || '',
          expectedAmount: deal.expectedAmount,
          probability: deal.probability,
          expectedCloseDate: deal.expectedCloseDate?.split('T')[0] || '',
        }
      : {
          dealName: '',
          leadId: preselectedLeadId,
          expectedAmount: 0,
          probability: 50,
          expectedCloseDate: '',
        },
  });

  const handleSubmit = async (data: DealFormData) => {
    try {
      const result = await createDeal.mutateAsync({
        dealName: data.dealName,
        leadId: data.leadId || undefined,
        expectedAmount: data.expectedAmount,
        probability: data.probability,
        expectedCloseDate: data.expectedCloseDate || undefined,
      });
      toast({ title: 'Deal created successfully' });
      router.push(`/crm/deals/${result?.id || result?.data?.id}`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast({
        title: 'Error',
        description: err.response?.data?.message || 'Failed to create deal',
        variant: 'destructive',
      });
    }
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Deal Details</CardTitle>
          <CardDescription>Enter the deal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dealName">Deal Name *</Label>
              <Input
                id="dealName"
                placeholder="Website Redesign Project"
                {...form.register('dealName')}
              />
              {form.formState.errors.dealName && (
                <p className="text-sm text-red-500">{form.formState.errors.dealName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Linked Lead</Label>
              <Select
                value={form.watch('leadId') || ''}
                onValueChange={(value) => form.setValue('leadId', value)}
                disabled={leadsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a lead (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {leads.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.leadName} {lead.companyName ? `(${lead.companyName})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expectedAmount">Expected Amount *</Label>
              <Input
                id="expectedAmount"
                type="number"
                min="0"
                step="0.01"
                {...form.register('expectedAmount', { valueAsNumber: true })}
              />
              {form.formState.errors.expectedAmount && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.expectedAmount.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="probability">Probability (%)</Label>
              <Input
                id="probability"
                type="number"
                min="0"
                max="100"
                {...form.register('probability', { valueAsNumber: true })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expectedCloseDate">Expected Close Date</Label>
              <Input id="expectedCloseDate" type="date" {...form.register('expectedCloseDate')} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={createDeal.isPending}>
          {createDeal.isPending ? 'Creating...' : 'Create Deal'}
        </Button>
      </div>
    </form>
  );
}
