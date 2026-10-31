'use client';

import { format } from 'date-fns';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Account } from '@/lib/hooks/use-accounts';
import { Journal, calculateJournalTotals } from '@/lib/hooks/use-journals';
import {
  JournalLinesEditor,
  emptyJournalLine,
  journalLineSchema,
  toJournalLineValues,
} from './journal-lines-editor';

const journalSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  reference: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(journalLineSchema).min(2, 'At least 2 lines are required'),
});

type JournalFormData = z.infer<typeof journalSchema>;

interface JournalFormProps {
  journal?: Journal | null;
  accounts: Account[];
  onSubmit: (data: JournalFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function JournalForm({
  journal,
  accounts,
  onSubmit,
  onCancel,
  isSubmitting,
}: JournalFormProps) {
  const isEditing = !!journal;

  const form = useForm<JournalFormData>({
    resolver: zodResolver(journalSchema),
    defaultValues: {
      date: format(new Date(), 'yyyy-MM-dd'),
      reference: '',
      notes: '',
      lines: [emptyJournalLine(), emptyJournalLine()],
    },
  });

  useEffect(() => {
    if (journal) {
      form.reset({
        date: journal.date.split('T')[0],
        reference: journal.reference || '',
        notes: journal.notes || '',
        lines: toJournalLineValues(journal.lines),
      });
    }
  }, [journal, form]);

  // Calculate totals
  const lines = form.watch('lines');
  const { isBalanced } = calculateJournalTotals(lines);

  const handleSubmit = (data: JournalFormData) => {
    if (!isBalanced) {
      form.setError('lines', {
        type: 'manual',
        message: 'Journal entry must be balanced (total debits must equal total credits)',
      });
      return;
    }
    onSubmit(data);
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Header Fields */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="date">Date *</Label>
          <Input id="date" type="date" {...form.register('date')} />
          {form.formState.errors.date && (
            <p className="text-sm text-red-500">{form.formState.errors.date.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="reference">Reference</Label>
          <Input id="reference" placeholder="e.g., INV-001" {...form.register('reference')} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Input id="notes" placeholder="Optional notes" {...form.register('notes')} />
        </div>
      </div>

      <JournalLinesEditor form={form} accounts={accounts} title="Journal Lines" />

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !isBalanced}>
          {isSubmitting ? 'Saving...' : isEditing ? 'Update Journal' : 'Create Journal'}
        </Button>
      </div>
    </form>
  );
}
