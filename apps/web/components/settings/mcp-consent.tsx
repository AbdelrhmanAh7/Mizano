'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { getApiErrorCode, getLocalizedApiErrorMessage } from '@/lib/api-error';
import { MCP_ACCESS, type McpAccess } from '@/lib/api/mcp';
import { leavePage } from '@/lib/leave-page';
import { useApproveMcpRequest, useDenyMcpRequest, useMcpAuthRequest } from '@/lib/hooks/use-mcp';
import { Building2, Link2, ShieldCheck, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/** Codes that mean the request is gone: the person starts again from their AI app. */
const GONE = new Set(['MCP_REQUEST_NOT_FOUND', 'MCP_REQUEST_EXPIRED']);

/**
 * "<App> wants to connect to Mizano": the signed-in person allows (choosing read only or read
 * and prepare drafts) or cancels. Both answers send the browser back to the AI app.
 */
export function McpConsent({ requestId }: { requestId: string }) {
  const t = useTranslations('settings.mcpConsent');
  const tErrors = useTranslations('settings.mcpErrors');
  const request = useMcpAuthRequest(requestId);
  const approve = useApproveMcpRequest();
  const deny = useDenyMcpRequest();
  const [access, setAccess] = useState<McpAccess>('read');
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<'allow' | 'cancel' | null>(null);

  const requested = request.data?.requestedAccess;
  useEffect(() => {
    if (requested) setAccess(requested);
  }, [requested]);

  const fail = (err: unknown) => {
    setLeaving(null);
    setError(getLocalizedApiErrorMessage(err, t('genericError'), tErrors));
  };
  const leave = ({ redirectUrl }: { redirectUrl: string }) => leavePage(redirectUrl);

  const busy = approve.isPending || deny.isPending || leaving !== null;

  return (
    <main className="flex min-h-screen items-start justify-center bg-muted/30 px-4 py-10 sm:items-center">
      <div className="w-full max-w-lg">{body()}</div>
    </main>
  );

  function body() {
    if (request.isLoading) {
      return (
        <Card aria-busy="true">
          <CardHeader>
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      );
    }

    if (request.isError || !request.data) {
      const gone = GONE.has(getApiErrorCode(request.error) ?? '');
      return (
        <Card>
          <CardHeader>
            <CardTitle>{gone ? t('goneTitle') : t('loadFailed')}</CardTitle>
            <CardDescription>
              {gone
                ? t('goneBody')
                : getLocalizedApiErrorMessage(request.error, t('genericError'), tErrors)}
            </CardDescription>
          </CardHeader>
          {!gone && (
            <CardContent>
              <Button variant="outline" onClick={() => void request.refetch()}>
                {t('retry')}
              </Button>
            </CardContent>
          )}
        </Card>
      );
    }

    const view = request.data;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl leading-snug">
            {t('title', { app: view.clientName })}
          </CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="space-y-3 rounded-lg border p-4 text-sm">
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <dt className="text-muted-foreground">{t('organization')}</dt>
                <dd className="break-words font-medium">{view.organization.name}</dd>
                <dd className="text-xs text-muted-foreground">{t('organizationHint')}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <dt className="text-muted-foreground">{t('signedInAs')}</dt>
                <dd className="break-words font-medium">
                  {view.user.name}{' '}
                  <span className="font-normal text-muted-foreground" dir="ltr">
                    ({view.user.email})
                  </span>
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <dt className="text-muted-foreground">{t('returnsTo')}</dt>
                <dd className="break-all font-medium" dir="ltr">
                  {view.redirectHost}
                </dd>
              </div>
            </div>
          </dl>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t('accessQuestion')}</legend>
            <RadioGroup
              value={access}
              onValueChange={(v) => setAccess(v as McpAccess)}
              disabled={busy}
            >
              {MCP_ACCESS.map((option) => (
                <Label
                  key={option}
                  htmlFor={`mcp-access-${option}`}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-primary"
                >
                  <RadioGroupItem id={`mcp-access-${option}`} value={option} className="mt-0.5" />
                  <span>
                    <span className="block font-medium">{t(`access.${option}`)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t(`access.${option}Description`)}
                    </span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </fieldset>

          <p className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('safety')}</span>
          </p>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setError(null);
                setLeaving('cancel');
                deny.mutate(requestId, { onSuccess: leave, onError: fail });
              }}
            >
              {t('cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setError(null);
                setLeaving('allow');
                approve.mutate({ requestId, access }, { onSuccess: leave, onError: fail });
              }}
            >
              {leaving === 'allow' ? t('allowing') : t('allow')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
}
