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
import { Textarea } from '@/components/ui/textarea';
import { useCreateDeal, useLeads, CreateDealDto, Deal, DealStage, Lead } from '@/lib/hooks/use-crm';
import { useToast } from '@/components/ui/use-toast';

const DEAL_STAGES = [
  { value: 'NEW', label: 'New' },
  { value: 'MEETING_SCHEDULED', label: 'Meeting Scheduled' },
  { value: 'PROPOSAL_SENT', label: 'Proposal Sent' },
  { value: 'NEGOTIATION', label: 'Negotiation' },
] as const;

const OPEN_STAGES: DealStage[] = DEAL_STAGES.map((stage) => stage.value);

// Decimal(19, 4) as the API checks it: the amount stays a string end to end.
const DECIMAL_PATTERN = /^\d{1,15}(\.\d{1,4})?$/;

const dealSchema = z.object({
  dealName: z.string().min(1, 'Deal name is required'),
  leadId: z.string().optional(),
  expectedAmount: z
    .string()
    .trim()
    .regex(DECIMAL_PATTERN, 'Enter an amount of 0 or more, with up to 4 decimals'),
  probability: z.number().int().min(0).max(100).default(50),
  expectedCloseDate: z.string().optional(),
  stage: z.enum(['NEW', 'MEETING_SCHEDULED', 'PROPOSAL_SENT', 'NEGOTIATION']).default('NEW'),
  notes: z.string().optional(),
});

type DealFormData = z.infer<typeof dealSchema>;

export function toDealPayload(data: DealFormData): CreateDealDto {
  return {
    dealName: data.dealName,
    leadId: data.leadId || undefined,
    expectedAmount: data.expectedAmount.trim(),
    probability: data.probability,
    expectedCloseDate: data.expectedCloseDate || undefined,
    stage: data.stage || 'NEW',
    notes: data.notes || undefined,
  };
}

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
  const leads: Lead[] = leadsData?.data || [];

  const form = useForm<DealFormData>({
    resolver: zodResolver(dealSchema),
    defaultValues: deal
      ? {
          dealName: deal.dealName,
          leadId: deal.leadId || '',
          expectedAmount: String(deal.expectedAmount ?? '0'),
          probability: deal.probability,
          expectedCloseDate: deal.expectedCloseDate?.split('T')[0] || '',
          stage: (OPEN_STAGES.includes(deal.stage) ? deal.stage : 'NEW') as DealFormData['stage'],
          notes: deal.notes || '',
        }
      : {
          dealName: '',
          leadId: preselectedLeadId,
          expectedAmount: '0',
          probability: 50,
          expectedCloseDate: '',
          stage: 'NEW',
          notes: '',
        },
  });

  const handleSubmit = async (data: DealFormData) => {
    try {
      const result = await createDeal.mutateAsync(toDealPayload(data));
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
                <p className="text-sm text-destructive">{form.formState.errors.dealName.message}</p>
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
                inputMode="decimal"
                placeholder="0.00"
                {...form.register('expectedAmount')}
              />
              {form.formState.errors.expectedAmount && (
                <p className="text-sm text-destructive">
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
                step="1"
                {...form.register('probability', { valueAsNumber: true })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expectedCloseDate">Expected Close Date</Label>
              <Input id="expectedCloseDate" type="date" {...form.register('expectedCloseDate')} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Stage</Label>
              <Select
                value={form.watch('stage') || 'NEW'}
                onValueChange={(value) => {
                  // Radix emits '' for a value missing from its options; keep the current stage.
                  if (value) form.setValue('stage', value as DealFormData['stage']);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {DEAL_STAGES.map((stage) => (
                    <SelectItem key={stage.value} value={stage.value}>
                      {stage.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Add any notes about this deal..."
              rows={3}
              {...form.register('notes')}
            />
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
