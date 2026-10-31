'use client';

import { Check, Plus, Trash2, X } from 'lucide-react';
import { useFieldArray, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Account, flattenAccountsTree } from '@/lib/hooks/use-accounts';
import { calculateJournalTotals, formatJournalAmount } from '@/lib/hooks/use-journals';
import { cn } from '@/lib/utils';

/** One debit/credit line, shared by manual journals and recurring journal templates. */
export const journalLineSchema = z.object({
  // A key of accounting.journals.form, shown translated by the editor.
  accountId: z.string().min(1, 'accountRequired'),
  debit: z.string().default('0'),
  credit: z.string().default('0'),
  description: z.string().optional(),
});

export type JournalLineValues = z.infer<typeof journalLineSchema>;

export const emptyJournalLine = (): JournalLineValues => ({
  accountId: '',
  debit: '0',
  credit: '0',
  description: '',
});

/** Form values of a stored line (decimal strings stay strings). */
export function toJournalLineValues(
  lines: { accountId: string; debit: string; credit: string; description?: string | null }[],
): JournalLineValues[] {
  return lines.map((line) => ({
    accountId: line.accountId,
    debit: line.debit,
    credit: line.credit,
    description: line.description || '',
  }));
}

interface JournalLinesEditorProps<T extends { lines: JournalLineValues[] }> {
  form: UseFormReturn<T>;
  accounts: Account[];
  title: string;
}

/**
 * The lines card of a journal-shaped form: account, debit, credit and description per line, at
 * least two lines, entering a debit clears the credit (and the reverse), and live totals with a
 * balanced/unbalanced badge. The parent form owns the schema (`lines: z.array(journalLineSchema)`)
 * and decides what an unbalanced submit does.
 */
export function JournalLinesEditor<T extends { lines: JournalLineValues[] }>({
  form: typedForm,
  accounts,
  title,
}: JournalLinesEditorProps<T>) {
  // react-hook-form cannot resolve `lines.${n}` paths on a generic T; every caller's T has them.
  const form = typedForm as unknown as UseFormReturn<{ lines: JournalLineValues[] }>;
  const t = useTranslations('accounting.journals.form');
  const flattenedAccounts = flattenAccountsTree(accounts);
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' });
  const { totalDebit, totalCredit, difference, isBalanced } = calculateJournalTotals(
    form.watch('lines'),
  );

  const removeLine = (index: number) => {
    if (fields.length > 2) remove(index);
  };

  // When a debit is entered, clear the credit and vice versa.
  const setAmount = (index: number, side: 'debit' | 'credit', value: string) => {
    form.setValue(`lines.${index}.${side}`, value);
    if (parseFloat(value) > 0) {
      form.setValue(`lines.${index}.${side === 'debit' ? 'credit' : 'debit'}`, '0');
    }
  };

  const lineErrors = form.formState.errors.lines;
  /** Line and form errors carry accounting.journals.form keys; other text is shown as is. */
  const translateError = (message?: string): string | undefined =>
    message && t.has(message) ? t(message) : message;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append(emptyJournalLine())}
          >
            <Plus className="h-4 w-4 me-1" />
            {t('addLine')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-2 mb-2 text-sm font-medium text-muted-foreground">
          <div className="col-span-4">{t('account')}</div>
          <div className="col-span-2 text-end">{t('debit')}</div>
          <div className="col-span-2 text-end">{t('credit')}</div>
          <div className="col-span-3">{t('description')}</div>
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
                    <SelectValue placeholder={t('accountPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {flattenedAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        <span style={{ paddingInlineStart: `${account.level * 8}px` }}>
                          {account.code} - {account.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(['debit', 'credit'] as const).map((side) => (
                <div key={side} className="col-span-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="text-end"
                    placeholder="0.00"
                    value={form.watch(`lines.${index}.${side}`)}
                    onChange={(e) => setAmount(index, side, e.target.value)}
                  />
                </div>
              ))}

              <div className="col-span-3">
                <Input
                  placeholder={t('description')}
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
                  aria-label={t('removeLine')}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {lineErrors && (
          <p className="text-sm text-red-500 mt-2">
            {translateError(lineErrors.message || lineErrors.root?.message)}
          </p>
        )}

        {/* Totals */}
        <div className="border-t mt-4 pt-4">
          <div className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-4 font-medium">{t('totals')}</div>
            <div className="col-span-2 text-end font-mono font-medium">
              {formatJournalAmount(totalDebit)}
            </div>
            <div className="col-span-2 text-end font-mono font-medium">
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
                  {t('balanced')}
                </>
              ) : (
                <>
                  <X className="h-4 w-4" />
                  {t('unbalanced', { amount: formatJournalAmount(difference) })}
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
