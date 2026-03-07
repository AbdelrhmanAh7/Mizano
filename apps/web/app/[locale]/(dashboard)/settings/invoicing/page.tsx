'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAllOrganizationSettings, useUpdateInvoiceSettings } from '@/lib/hooks/use-all-settings';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, FileText, Save } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const schema = z.object({
  invoicePrefix: z.string().min(1, 'Prefix is required'),
  invoiceNextNumber: z.coerce.number().min(1),
  invoiceDefaultNotes: z.string().nullable().optional(),
  invoiceDefaultTerms: z.string().nullable().optional(),
  invoiceAutoSend: z.boolean(),
  bankDetails: z.string().nullable().optional(),
  quotePrefix: z.string().min(1, 'Prefix is required'),
  quoteNextNumber: z.coerce.number().min(1),
  billPrefix: z.string().min(1, 'Prefix is required'),
  billNextNumber: z.coerce.number().min(1),
});

type FormData = z.infer<typeof schema>;

export default function InvoicingSettingsPage() {
  const t = useTranslations('settings');
  const { data: settings, isLoading } = useAllOrganizationSettings();
  const updateInvoice = useUpdateInvoiceSettings();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      invoicePrefix: 'INV-',
      invoiceNextNumber: 1,
      invoiceDefaultNotes: '',
      invoiceDefaultTerms: '',
      invoiceAutoSend: false,
      bankDetails: '',
      quotePrefix: 'EST-',
      quoteNextNumber: 1,
      billPrefix: 'BILL-',
      billNextNumber: 1,
    },
  });

  useEffect(() => {
    if (settings?.invoice) {
      form.reset({
        invoicePrefix: settings.invoice.invoicePrefix || 'INV-',
        invoiceNextNumber: settings.invoice.invoiceNextNumber || 1,
        invoiceDefaultNotes: settings.invoice.invoiceDefaultNotes || '',
        invoiceDefaultTerms: settings.invoice.invoiceDefaultTerms || '',
        invoiceAutoSend: settings.invoice.invoiceAutoSend ?? false,
        bankDetails: settings.invoice.bankDetails || '',
        quotePrefix: settings.invoice.quotePrefix || 'EST-',
        quoteNextNumber: settings.invoice.quoteNextNumber || 1,
        billPrefix: settings.invoice.billPrefix || 'BILL-',
        billNextNumber: settings.invoice.billNextNumber || 1,
      });
    }
  }, [settings, form]);

  const onSubmit = (data: FormData) => {
    updateInvoice.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-6 space-y-4">
            <Skeleton className="h-6 w-40" />
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild aria-label={t('common.goBack')}>
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('invoicing.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('invoicing.description')}</p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Numbering */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t('invoicing.documentNumbering')}
            </CardTitle>
            <CardDescription>{t('invoicing.documentNumberingDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Invoices */}
            <div>
              <h4 className="text-sm font-medium mb-3">{t('invoicing.invoices')}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="invoicePrefix">{t('invoicing.prefix')}</Label>
                  <Input id="invoicePrefix" {...form.register('invoicePrefix')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoiceNextNumber">{t('invoicing.nextNumber')}</Label>
                  <Input
                    id="invoiceNextNumber"
                    type="number"
                    min={1}
                    {...form.register('invoiceNextNumber')}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('invoicing.preview')} {form.watch('invoicePrefix')}
                {String(form.watch('invoiceNextNumber')).padStart(5, '0')}
              </p>
            </div>

            <Separator />

            {/* Quotes */}
            <div>
              <h4 className="text-sm font-medium mb-3">{t('invoicing.quotesEstimates')}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quotePrefix">{t('invoicing.prefix')}</Label>
                  <Input id="quotePrefix" {...form.register('quotePrefix')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quoteNextNumber">{t('invoicing.nextNumber')}</Label>
                  <Input
                    id="quoteNextNumber"
                    type="number"
                    min={1}
                    {...form.register('quoteNextNumber')}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('invoicing.preview')} {form.watch('quotePrefix')}
                {String(form.watch('quoteNextNumber')).padStart(5, '0')}
              </p>
            </div>

            <Separator />

            {/* Bills */}
            <div>
              <h4 className="text-sm font-medium mb-3">{t('invoicing.bills')}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="billPrefix">{t('invoicing.prefix')}</Label>
                  <Input id="billPrefix" {...form.register('billPrefix')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="billNextNumber">{t('invoicing.nextNumber')}</Label>
                  <Input
                    id="billNextNumber"
                    type="number"
                    min={1}
                    {...form.register('billNextNumber')}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('invoicing.preview')} {form.watch('billPrefix')}
                {String(form.watch('billNextNumber')).padStart(5, '0')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Defaults */}
        <Card>
          <CardHeader>
            <CardTitle>{t('invoicing.invoiceDefaults')}</CardTitle>
            <CardDescription>{t('invoicing.invoiceDefaultsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invoiceDefaultNotes">{t('invoicing.defaultNotes')}</Label>
              <Textarea
                id="invoiceDefaultNotes"
                {...form.register('invoiceDefaultNotes')}
                placeholder="Thank you for your business!"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoiceDefaultTerms">{t('invoicing.defaultTerms')}</Label>
              <Textarea
                id="invoiceDefaultTerms"
                {...form.register('invoiceDefaultTerms')}
                placeholder="Payment is due within the specified terms..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bankDetails">{t('invoicing.bankDetails')}</Label>
              <Textarea
                id="bankDetails"
                {...form.register('bankDetails')}
                placeholder="Bank: Example Bank&#10;Account: 1234567890&#10;Routing: 987654321"
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label>{t('invoicing.autoSend')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('invoicing.autoSendDescription')}
                </p>
              </div>
              <Switch
                checked={form.watch('invoiceAutoSend')}
                onCheckedChange={(v) => form.setValue('invoiceAutoSend', v, { shouldDirty: true })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={updateInvoice.isPending || !form.formState.isDirty}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {updateInvoice.isPending ? t('common.saving') : t('common.saveChanges')}
          </Button>
        </div>
      </form>
    </div>
  );
}
