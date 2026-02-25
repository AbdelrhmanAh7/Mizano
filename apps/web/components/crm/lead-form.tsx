'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PhoneInput } from '@/components/ui/phone-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  useCreateLead,
  useUpdateLead,
  Lead,
  LeadSource,
  getLeadSourceLabel,
} from '@/lib/hooks/use-crm';
import { useToast } from '@/components/ui/use-toast';

const LEAD_SOURCES: LeadSource[] = [
  'FACEBOOK_ADS',
  'GOOGLE_ADS',
  'WEBSITE',
  'REFERRAL',
  'COLD_CALL',
  'TRADE_SHOW',
  'OTHER',
];

const leadSchema = z.object({
  leadName: z.string().min(1, 'Name is required'),
  companyName: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  source: z.enum([
    'FACEBOOK_ADS',
    'GOOGLE_ADS',
    'WEBSITE',
    'REFERRAL',
    'COLD_CALL',
    'TRADE_SHOW',
    'OTHER',
  ]),
  notes: z.string().optional(),
});

type LeadFormData = z.infer<typeof leadSchema>;

interface LeadFormProps {
  lead?: Lead;
}

export function LeadForm({ lead }: LeadFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();

  const form = useForm<LeadFormData>({
    resolver: zodResolver(leadSchema),
    defaultValues: lead
      ? {
          leadName: lead.leadName,
          companyName: lead.companyName || '',
          email: lead.email || '',
          phone: lead.phone || '',
          source: lead.source,
          notes: lead.notes || '',
        }
      : {
          leadName: '',
          companyName: '',
          email: '',
          phone: '',
          source: 'WEBSITE' as const,
          notes: '',
        },
  });

  const handleSubmit = async (data: LeadFormData) => {
    try {
      if (lead) {
        await updateLead.mutateAsync({ id: lead.id, data });
        toast({ title: 'Lead updated successfully' });
        router.push(`/crm/leads/${lead.id}`);
      } else {
        const result = await createLead.mutateAsync(data);
        toast({ title: 'Lead created successfully' });
        router.push(`/crm/leads/${result?.id || result?.data?.id}`);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to save lead',
        variant: 'destructive',
      });
    }
  };

  const isPending = createLead.isPending || updateLead.isPending;

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Lead Details</CardTitle>
          <CardDescription>Capture lead contact information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="leadName">Lead Name *</Label>
              <Input id="leadName" placeholder="John Doe" {...form.register('leadName')} />
              {form.formState.errors.leadName && (
                <p className="text-sm text-red-500">{form.formState.errors.leadName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyName">Company</Label>
              <Input id="companyName" placeholder="Acme Corp" {...form.register('companyName')} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
                {...form.register('email')}
              />
              {form.formState.errors.email && (
                <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <PhoneInput
                id="phone"
                value={form.watch('phone') || ''}
                onChange={(val) => form.setValue('phone', val)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Source *</Label>
            <Select
              value={form.watch('source')}
              onValueChange={(value) => form.setValue('source', value as LeadSource)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map((source) => (
                  <SelectItem key={source} value={source}>
                    {getLeadSourceLabel(source)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional notes about this lead..."
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
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving...' : lead ? 'Update Lead' : 'Create Lead'}
        </Button>
      </div>
    </form>
  );
}
