'use client';

import { format } from 'date-fns';
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
import { Switch } from '@/components/ui/switch';
import { Account } from '@/lib/hooks/use-accounts';
import { calculateJournalTotals } from '@/lib/hooks/use-journals';
import { RecurringFrequency, RecurringProfile } from '@/lib/hooks/use-recurring-profiles';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  JournalLinesEditor,
  emptyJournalLine,
  journalLineSchema,
  toJournalLineValues,
} from './journal-lines-editor';

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().optional(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
  startDate: z.string().min(1, 'Start date is required'),
  autoPost: z.boolean().default(false),
  lines: z.array(journalLineSchema).min(2, 'At least 2 lines are required'),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface RecurringProfileFormProps {
  profile?: RecurringProfile | null;
  accounts: Account[];
  onSubmit: (data: ProfileFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function RecurringProfileForm({
  profile,
  accounts,
  onSubmit,
  onCancel,
  isSubmitting,
}: RecurringProfileFormProps) {
  const isEditing = !!profile;

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      description: '',
      frequency: 'MONTHLY',
      startDate: format(new Date(), 'yyyy-MM-dd'),
      autoPost: false,
      lines: [emptyJournalLine(), emptyJournalLine()],
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        name: profile.name,
        description: profile.description || '',
        frequency: profile.frequency,
        startDate: profile.nextRunDate.split('T')[0],
        autoPost: profile.autoPost,
        lines: toJournalLineValues(profile.lines),
      });
    }
  }, [profile, form]);

  // Calculate totals
  const lines = form.watch('lines');
  const { isBalanced } = calculateJournalTotals(lines);

  const handleSubmit = (data: ProfileFormData) => {
    if (!isBalanced) {
      form.setError('lines', {
        type: 'manual',
        message: 'Journal template must be balanced (total debits must equal total credits)',
      });
      return;
    }
    onSubmit(data);
  };

  const frequencies: { value: RecurringFrequency; label: string }[] = [
    { value: 'DAILY', label: 'Daily' },
    { value: 'WEEKLY', label: 'Weekly' },
    { value: 'MONTHLY', label: 'Monthly' },
    { value: 'YEARLY', label: 'Yearly' },
  ];

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Profile Details */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Profile Name *</Label>
              <Input id="name" placeholder="e.g., Monthly Rent" {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="frequency">Frequency *</Label>
              <Select
                value={form.watch('frequency')}
                onValueChange={(value) => form.setValue('frequency', value as RecurringFrequency)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  {frequencies.map((freq) => (
                    <SelectItem key={freq.value} value={freq.value}>
                      {freq.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Optional description"
                {...form.register('description')}
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="autoPost"
              checked={form.watch('autoPost')}
              onCheckedChange={(checked) => form.setValue('autoPost', checked)}
            />
            <Label htmlFor="autoPost" className="text-sm font-normal">
              Auto-post journals when created (otherwise saved as draft)
            </Label>
          </div>
        </CardContent>
      </Card>

      <JournalLinesEditor form={form} accounts={accounts} title="Journal Template" />

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !isBalanced}>
          {isSubmitting ? 'Saving...' : isEditing ? 'Update Profile' : 'Create Profile'}
        </Button>
      </div>
    </form>
  );
}
