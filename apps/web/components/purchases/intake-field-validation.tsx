'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, CircleHelp, FileSearch, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type {
  ExtractionValidation,
  FieldValidationStatus,
} from '@/lib/hooks/use-ai-document-intake';

const ORDER = [
  'invoiceNumber',
  'date',
  'currency',
  'subtotal',
  'tax',
  'total',
  'vendorTaxId',
  'vendor',
];

const STATUS_STYLE: Record<FieldValidationStatus, string> = {
  valid: 'text-green-600',
  warning: 'text-yellow-600',
  invalid: 'text-destructive',
  missing: 'text-muted-foreground',
};

function StatusIcon({ status }: { status: FieldValidationStatus }): JSX.Element {
  const cls = cn('h-4 w-4 shrink-0', STATUS_STYLE[status]);
  if (status === 'valid') return <CheckCircle2 className={cls} aria-hidden />;
  if (status === 'warning') return <AlertTriangle className={cls} aria-hidden />;
  if (status === 'invalid') return <XCircle className={cls} aria-hidden />;
  return <CircleHelp className={cls} aria-hidden />;
}

export function IntakeFieldValidation({
  validation,
}: {
  validation: ExtractionValidation;
}): JSX.Element {
  const t = useTranslations('ai.intake.validation');
  const keys = [
    ...ORDER.filter((k) => validation.fields[k]),
    ...Object.keys(validation.fields).filter((k) => !ORDER.includes(k)),
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {keys.map((key) => {
            const field = validation.fields[key];
            return (
              <li
                key={key}
                data-testid={`field-check-${key}`}
                data-status={field.status}
                className={cn(
                  'flex items-start gap-3 rounded-md border p-2 text-sm',
                  field.status === 'invalid' && 'border-destructive bg-destructive/5',
                )}
              >
                <StatusIcon status={field.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t(`fields.${key}`)}</span>
                    <span className="sr-only">{t(`status.${field.status}`)}</span>
                    <span className="text-muted-foreground" dir="auto">
                      {field.value ?? t('emptyValue')}
                    </span>
                  </div>
                  {field.reasons.length > 0 && (
                    <ul className={cn('mt-1 space-y-0.5', STATUS_STYLE[field.status])}>
                      {field.reasons.map((code) => (
                        <li key={code}>{t(`reasons.${code}`)}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <Popover>
                  <PopoverTrigger
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
                    aria-label={`${t('evidence')}: ${t(`fields.${key}`)}`}
                  >
                    <FileSearch className="h-4 w-4" aria-hidden />
                  </PopoverTrigger>
                  <PopoverContent className="w-72 text-sm">
                    <p className="mb-1 font-medium">{t('evidence')}</p>
                    {field.evidence ? (
                      <p dir="auto" className="whitespace-pre-wrap break-words font-mono text-xs">
                        {field.evidence.text}
                      </p>
                    ) : (
                      <p className="text-muted-foreground">{t('noEvidence')}</p>
                    )}
                  </PopoverContent>
                </Popover>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
