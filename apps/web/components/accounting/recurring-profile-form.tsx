'use client';

import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { RecurringProfile, RecurringFrequency } from '@/lib/hooks/use-recurring-profiles';
import { calculateJournalTotals, formatJournalAmount } from '@/lib/hooks/use-journals';

const profileLineSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  debit: z.string().default('0'),
  credit: z.string().default('0'),
  description: z.string().optional(),
});

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().optional(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
  startDate: z.string().min(1, 'Start date is required'),
  autoPost: z.boolean().default(false),
  lines: z.array(profileLineSchema).min(2, 'At least 2 lines are required'),
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
  const flattenedAccounts = flattenAccountsTree(accounts);

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      description: '',
      frequency: 'MONTHLY',
      startDate: new Date().toISOString().split('T')[0],
      autoPost: false,
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
    if (profile) {
      form.reset({
        name: profile.name,
        description: profile.description || '',
        frequency: profile.frequency,
        startDate: profile.nextExecutionDate.split('T')[0],
        autoPost: profile.autoPost,
        lines: profile.lines.map((line) => ({
          accountId: line.accountId,
          debit: line.debit,
          credit: line.credit,
          description: line.description || '',
        })),
      });
    }
  }, [profile, form]);

  // Calculate totals
  const lines = form.watch('lines');
  const { totalDebit, totalCredit, isBalanced } = calculateJournalTotals(lines);

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

  const addLine = () => {
    append({ accountId: '', debit: '0', credit: '0', description: '' });
  };

  const removeLine = (index: number) => {
    if (fields.length > 2) {
      remove(index);
    }
  };

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

      {/* Journal Template */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Journal Template</CardTitle>
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
          {isSubmitting ? 'Saving...' : isEditing ? 'Update Profile' : 'Create Profile'}
        </Button>
      </div>
    </form>
  );
}
