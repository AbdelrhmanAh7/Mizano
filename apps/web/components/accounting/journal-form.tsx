'use client';

import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Check, X } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Account, flattenAccountsTree } from '@/lib/hooks/use-accounts';
import { Journal, calculateJournalTotals, formatJournalAmount } from '@/lib/hooks/use-journals';

const journalLineSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  debit: z.string().default('0'),
  credit: z.string().default('0'),
  description: z.string().optional(),
});

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
  const flattenedAccounts = flattenAccountsTree(accounts);

  const form = useForm<JournalFormData>({
    resolver: zodResolver(journalSchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      reference: '',
      notes: '',
      lines: [
        { accountId: '', debit: '0', credit: '0', description: '' },
        { accountId: '', debit: '0', credit: '0', description: '' },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  useEffect(() => {
    if (journal) {
      form.reset({
        date: journal.date.split('T')[0],
        reference: journal.reference || '',
        notes: journal.notes || '',
        lines: journal.lines.map((line) => ({
          accountId: line.accountId,
          debit: line.debit,
          credit: line.credit,
          description: line.description || '',
        })),
      });
    }
  }, [journal, form]);

  // Calculate totals
  const lines = form.watch('lines');
  const { totalDebit, totalCredit, isBalanced } = calculateJournalTotals(lines);

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

  const addLine = () => {
    append({ accountId: '', debit: '0', credit: '0', description: '' });
  };

  const removeLine = (index: number) => {
    if (fields.length > 2) {
      remove(index);
    }
  };

  // When debit is entered, clear credit and vice versa
  const handleDebitChange = (index: number, value: string) => {
    form.setValue(`lines.${index}.debit`, value);
    if (parseFloat(value) > 0) {
      form.setValue(`lines.${index}.credit`, '0');
    }
  };

  const handleCreditChange = (index: number, value: string) => {
    form.setValue(`lines.${index}.credit`, value);
    if (parseFloat(value) > 0) {
      form.setValue(`lines.${index}.debit`, '0');
    }
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

      {/* Journal Lines */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Journal Lines</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-4 w-4 mr-1" />
              Add Line
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-2 mb-2 text-sm font-medium text-muted-foreground">
            <div className="col-span-4">Account</div>
            <div className="col-span-2 text-right">Debit</div>
            <div className="col-span-2 text-right">Credit</div>
            <div className="col-span-3">Description</div>
            <div className="col-span-1"></div>
          </div>

          {/* Lines */}
          <div className="space-y-2">
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-4">
                  <Select
                    value={form.watch(`lines.${index}.accountId`)}
                    onValueChange={(value) => form.setValue(`lines.${index}.accountId`, value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {flattenedAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          <span style={{ paddingLeft: `${account.level * 8}px` }}>
                            {account.code} - {account.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="text-right"
                    placeholder="0.00"
                    value={form.watch(`lines.${index}.debit`)}
                    onChange={(e) => handleDebitChange(index, e.target.value)}
                  />
                </div>

                <div className="col-span-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="text-right"
                    placeholder="0.00"
                    value={form.watch(`lines.${index}.credit`)}
                    onChange={(e) => handleCreditChange(index, e.target.value)}
                  />
                </div>

                <div className="col-span-3">
                  <Input
                    placeholder="Description"
                    {...form.register(`lines.${index}.description`)}
                  />
                </div>

                <div className="col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLine(index)}
                    disabled={fields.length <= 2}
                    className="h-8 w-8"
                    aria-label="Remove journal line"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {form.formState.errors.lines && (
            <p className="text-sm text-red-500 mt-2">
              {form.formState.errors.lines.message || form.formState.errors.lines.root?.message}
            </p>
          )}

          {/* Totals */}
          <div className="border-t mt-4 pt-4">
            <div className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-4 font-medium">Totals</div>
              <div className="col-span-2 text-right font-mono font-medium">
                {formatJournalAmount(totalDebit)}
              </div>
              <div className="col-span-2 text-right font-mono font-medium">
                {formatJournalAmount(totalCredit)}
              </div>
              <div className="col-span-3"></div>
              <div className="col-span-1"></div>
            </div>

            {/* Balance Indicator */}
            <div className="mt-3 flex items-center gap-2">
              <div
                className={cn(
                  'flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium',
                  isBalanced ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800',
                )}
              >
                {isBalanced ? (
                  <>
                    <Check className="h-4 w-4" />
                    Balanced
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4" />
                    Unbalanced (Difference:{' '}
                    {formatJournalAmount(Math.abs(totalDebit - totalCredit))})
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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
