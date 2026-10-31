'use client';

import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** A reference from the client's authorized ETA issuer, independent of amounts and posting. */
export function ExternalEInvoiceReference({
  id,
  kind,
  reference,
  canEdit,
}: {
  id: string;
  kind: 'invoices' | 'credit-notes';
  reference?: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations('sales.externalEInvoice');
  const inputId = useId();
  const [value, setValue] = useState(reference || '');
  const client = useQueryClient();
  useEffect(() => {
    setValue(reference || '');
  }, [reference]);
  const save = useMutation({
    mutationFn: () =>
      api.patch(`/${kind}/${id}/external-einvoice-reference`, {
        externalEInvoiceNumber: value.trim() || null,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: [kind] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t('help')}</p>
        {canEdit ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <Label htmlFor={inputId}>{t('label')}</Label>
            <Input
              id={inputId}
              value={value}
              maxLength={100}
              dir="auto"
              disabled={save.isPending}
              onChange={(event) => {
                setValue(event.target.value);
                save.reset();
              }}
            />
            {save.isError && (
              <p role="alert" className="text-sm text-destructive">
                {t('error')}
              </p>
            )}
            {save.isSuccess && (
              <p role="status" className="text-sm">
                {t('saved')}
              </p>
            )}
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? t('saving') : t('save')}
            </Button>
          </form>
        ) : (
          <p className="break-all" dir="auto">
            {reference || t('empty')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
