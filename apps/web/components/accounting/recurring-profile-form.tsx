'use client';

import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
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
import {
  RecurringFrequency,
  RecurringProfile,
  useFrequencyLabel,
} from '@/lib/hooks/use-recurring-profiles';
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

// Field messages are keys of accounting.recurring.form; line messages of accounting.journals.form
// (the lines editor translates those).
const profileSchema = z.object({
  name: z.string().min(1, 'nameRequired').max(100, 'nameTooLong'),
  description: z.string().optional(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
  startDate: z.string().min(1, 'startDateRequired'),
  autoPost: z.boolean().default(false),
  lines: z.array(journalLineSchema).min(2, 'minLines'),
});

const FREQUENCIES: RecurringFrequency[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

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
  const t = useTranslations('accounting.recurring.form');
  const frequencyLabel = useFrequencyLabel();
  const errorText = (message?: string): string | undefined =>
    message && t.has(message) ? t(message) : message;

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
        message: 'mustBalance',
      });
      return;
    }
    onSubmit(data);
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Profile Details */}
      <Card>
        <CardHeader>
          <CardTitle>{t('profileDetails')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('name')} *</Label>
              <Input id="name" placeholder={t('nameExample')} {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">
                  {errorText(form.formState.errors.name.message)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="frequency">{t('frequency')} *</Label>
              <Select
                value={form.watch('frequency')}
                onValueChange={(value) => {
                  // Radix emits '' for a value missing from the options; keep the current one.
                  if (value) form.setValue('frequency', value as RecurringFrequency);
                }}
              >
                <SelectTrigger id="frequency">
                  <SelectValue placeholder={t('frequencyPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((freq) => (
                    <SelectItem key={freq} value={freq}>
                      {frequencyLabel(freq)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">{t('startDate')} *</Label>
              <Input id="startDate" type="date" {...form.register('startDate')} />
              {form.formState.errors.startDate && (
                <p className="text-sm text-destructive">
                  {errorText(form.formState.errors.startDate.message)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('description')}</Label>
              <Input
                id="description"
                placeholder={t('descriptionPlaceholder')}
                {...form.register('description')}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="autoPost"
              checked={form.watch('autoPost')}
              onCheckedChange={(checked) => form.setValue('autoPost', checked)}
            />
            <Label htmlFor="autoPost" className="text-sm font-normal">
              {t('autoPostLabel')}
            </Label>
          </div>
        </CardContent>
      </Card>

      <JournalLinesEditor form={form} accounts={accounts} title={t('journalTemplate')} />

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting || !isBalanced}>
          {isSubmitting ? t('saving') : isEditing ? t('update') : t('create')}
        </Button>
      </div>
    </form>
  );
}
