'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { getApiErrorMessage } from '@/lib/api-error';
import { integrationsBaseUrl, type DeliveryStatus } from '@/lib/api/integrations';
import {
  useCreateIntegrationKey,
  useCreateWebhookEndpoint,
  useDeleteWebhookEndpoint,
  useIntegrationCatalog,
  useIntegrationKeys,
  useRedeliverWebhook,
  useRevokeIntegrationKey,
  useTestWebhookEndpoint,
  useUpdateWebhookEndpoint,
  useWebhookDeliveries,
  useWebhookEndpoints,
} from '@/lib/hooks/use-integrations';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { ArrowLeft, Copy, KeyRound, RefreshCw, Send, Trash2, Webhook } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';

const STATUS_VARIANT: Record<DeliveryStatus, 'default' | 'secondary' | 'destructive' | 'outline'> =
  {
    SUCCEEDED: 'default',
    PENDING: 'secondary',
    DELIVERING: 'secondary',
    FAILED: 'destructive',
  };

function ErrorBox({
  message,
  onRetry,
  retryLabel,
}: {
  message: string;
  onRetry: () => void;
  retryLabel: string;
}) {
  return (
    <div className="rounded-md border border-destructive p-4 text-sm">
      <p className="text-destructive">{message}</p>
      <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function CopyField({ value, label }: { value: string; label: string }) {
  const t = useTranslations('settings.flowline');
  const { toast } = useToast();
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          readOnly
          value={value}
          dir="ltr"
          className="font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t('copy')}
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => toast({ title: t('copied') }));
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ScopeOrEventChecklist({
  items,
  selected,
  onChange,
  labelFor,
  idPrefix,
}: {
  items: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  labelFor: (item: string) => string;
  idPrefix: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((item) => {
        const id = `${idPrefix}-${item}`;
        return (
          <label key={item} htmlFor={id} className="flex items-center gap-2 text-sm">
            <Checkbox
              id={id}
              checked={selected.includes(item)}
              onCheckedChange={(checked) =>
                onChange(checked ? [...selected, item] : selected.filter((s) => s !== item))
              }
            />
            <span>{labelFor(item)}</span>
            <code className="text-xs text-muted-foreground" dir="ltr">
              {item}
            </code>
          </label>
        );
      })}
    </div>
  );
}

/** One screen: API address + key for FlowLine, FlowLine webhook for events, delivery log. */
export function FlowlineConnect() {
  const t = useTranslations('settings.flowline');
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('settings.edit');

  const catalog = useIntegrationCatalog();
  const keys = useIntegrationKeys();
  const webhooks = useWebhookEndpoints();
  const deliveries = useWebhookDeliveries();

  const createKey = useCreateIntegrationKey();
  const revokeKey = useRevokeIntegrationKey();
  const createWebhook = useCreateWebhookEndpoint();
  const updateWebhook = useUpdateWebhookEndpoint();
  const deleteWebhook = useDeleteWebhookEndpoint();
  const testWebhook = useTestWebhookEndpoint();
  const redeliver = useRedeliverWebhook();

  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  const [keyName, setKeyName] = useState('FlowLine');
  const [keyScopes, setKeyScopes] = useState<string[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);

  const [hookName, setHookName] = useState('FlowLine');
  const [hookUrl, setHookUrl] = useState('');
  const [hookSecret, setHookSecret] = useState('');
  const [hookEvents, setHookEvents] = useState<string[]>([]);

  // Default to everything once the catalog arrives.
  useEffect(() => {
    if (catalog.data) {
      setKeyScopes((s) => (s.length ? s : catalog.data.scopes));
      setHookEvents((s) => (s.length ? s : catalog.data.eventTypes));
    }
  }, [catalog.data]);

  const fail = (error: unknown) =>
    toast({
      title: t('error'),
      description: getApiErrorMessage(error, t('error')),
      variant: 'destructive',
    });

  const scopeLabel = (s: string) => t(`scopes.${s.replace(':', '_')}`);
  const eventLabel = (e: string) => t(`events.${e.replace('.', '_')}`);
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

  if (catalog.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const activeKeys = (keys.data ?? []).filter((k) => !k.revokedAt);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon" aria-label={t('back')}>
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </div>

      {catalog.isError && (
        <ErrorBox
          message={t('loadFailed')}
          onRetry={() => void catalog.refetch()}
          retryLabel={t('retry')}
        />
      )}
      {catalog.data && !catalog.data.encryptionConfigured && (
        <div className="rounded-md border border-amber-500 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {t('encryptionMissing')}
        </div>
      )}

      {/* Step 1: FlowLine -> Mizano */}
      <Section
        icon={<KeyRound className="h-5 w-5" />}
        title={t('step1.title')}
        description={t('step1.description')}
      >
        <CopyField label={t('step1.baseUrl')} value={integrationsBaseUrl(origin)} />

        {newKey && (
          <div className="space-y-2 rounded-md border border-primary p-4">
            <CopyField label={t('step1.newKey')} value={newKey} />
            <p className="text-xs text-muted-foreground">{t('step1.newKeyWarning')}</p>
            <Button size="sm" variant="outline" onClick={() => setNewKey(null)}>
              {t('done')}
            </Button>
          </div>
        )}

        {canEdit && catalog.data && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              createKey.mutate(
                { name: keyName.trim(), scopes: keyScopes },
                { onSuccess: (k) => setNewKey(k.key), onError: fail },
              );
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="key-name">{t('name')}</Label>
              <Input
                id="key-name"
                value={keyName}
                maxLength={100}
                onChange={(e) => setKeyName(e.target.value)}
              />
            </div>
            <Label>{t('step1.scopes')}</Label>
            <ScopeOrEventChecklist
              idPrefix="scope"
              items={catalog.data.scopes}
              selected={keyScopes}
              onChange={setKeyScopes}
              labelFor={scopeLabel}
            />
            <Button
              type="submit"
              disabled={createKey.isPending || !keyName.trim() || keyScopes.length === 0}
            >
              {t('step1.create')}
            </Button>
          </form>
        )}

        {keys.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : keys.isError ? (
          <ErrorBox
            message={t('loadFailed')}
            onRetry={() => void keys.refetch()}
            retryLabel={t('retry')}
          />
        ) : (keys.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('step1.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead>{t('step1.prefix')}</TableHead>
                  <TableHead>{t('step1.lastUsed')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(keys.data ?? []).map((k) => (
                  <TableRow key={k.id}>
                    <TableCell>{k.name}</TableCell>
                    <TableCell dir="ltr" className="font-mono text-xs">
                      {k.prefix}…
                    </TableCell>
                    <TableCell className="text-xs">{date(k.lastUsedAt)}</TableCell>
                    <TableCell>
                      <Badge variant={k.revokedAt ? 'outline' : 'default'}>
                        {k.revokedAt ? t('step1.revoked') : t('step1.active')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      {canEdit && !k.revokedAt && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              {t('step1.revoke')}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t('step1.revokeTitle')}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t('step1.revokeDescription')}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => revokeKey.mutate(k.id, { onError: fail })}
                              >
                                {t('step1.revoke')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {activeKeys.length > 0 && (
          <p className="text-xs text-muted-foreground">{t('step1.howToUse')}</p>
        )}
      </Section>

      {/* Step 2: Mizano -> FlowLine */}
      <Section
        icon={<Webhook className="h-5 w-5" />}
        title={t('step2.title')}
        description={t('step2.description')}
      >
        {canEdit && catalog.data && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              createWebhook.mutate(
                {
                  name: hookName.trim(),
                  url: hookUrl.trim(),
                  secret: hookSecret.trim(),
                  eventTypes: hookEvents,
                },
                {
                  onSuccess: () => {
                    setHookUrl('');
                    setHookSecret('');
                    toast({ title: t('step2.saved') });
                  },
                  onError: fail,
                },
              );
            }}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="hook-name">{t('name')}</Label>
                <Input
                  id="hook-name"
                  value={hookName}
                  maxLength={100}
                  onChange={(e) => setHookName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hook-url">{t('step2.url')}</Label>
                <Input
                  id="hook-url"
                  dir="ltr"
                  inputMode="url"
                  placeholder="https://…/api/public/webhooks/…"
                  value={hookUrl}
                  onChange={(e) => setHookUrl(e.target.value)}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="hook-secret">{t('step2.secret')}</Label>
                <Input
                  id="hook-secret"
                  dir="ltr"
                  type="password"
                  autoComplete="off"
                  placeholder="whsec_…"
                  value={hookSecret}
                  onChange={(e) => setHookSecret(e.target.value)}
                />
              </div>
            </div>
            <Label>{t('step2.events')}</Label>
            <ScopeOrEventChecklist
              idPrefix="event"
              items={catalog.data.eventTypes}
              selected={hookEvents}
              onChange={setHookEvents}
              labelFor={eventLabel}
            />
            <Button
              type="submit"
              disabled={
                createWebhook.isPending ||
                !hookUrl.trim() ||
                hookSecret.trim().length < 16 ||
                hookEvents.length === 0
              }
            >
              {t('step2.add')}
            </Button>
          </form>
        )}

        {webhooks.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : webhooks.isError ? (
          <ErrorBox
            message={t('loadFailed')}
            onRetry={() => void webhooks.refetch()}
            retryLabel={t('retry')}
          />
        ) : (webhooks.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('step2.empty')}</p>
        ) : (
          <div className="space-y-3">
            {(webhooks.data ?? []).map((w) => (
              <div
                key={w.id}
                className="flex flex-col gap-3 rounded-md border p-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{w.name}</p>
                  <p dir="ltr" className="truncate font-mono text-xs text-muted-foreground">
                    {w.url}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('step2.secretHint')}: <span dir="ltr">{w.secretHint}</span> ·{' '}
                    {w.eventTypes.map(eventLabel).join('، ')}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch
                      checked={w.isActive}
                      aria-label={t('step2.enabled')}
                      onCheckedChange={(isActive) =>
                        updateWebhook.mutate({ id: w.id, input: { isActive } }, { onError: fail })
                      }
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!w.isActive || testWebhook.isPending}
                      onClick={() =>
                        testWebhook.mutate(w.id, {
                          onSuccess: (r) =>
                            toast(
                              r.status === 'SUCCEEDED'
                                ? {
                                    title: t('step2.testOk', {
                                      code: String(r.lastStatusCode ?? ''),
                                    }),
                                  }
                                : {
                                    title: t('step2.testFailed'),
                                    description: r.lastError ?? '',
                                    variant: 'destructive',
                                  },
                            ),
                          onError: fail,
                        })
                      }
                    >
                      <Send className="h-4 w-4 me-1" />
                      {t('step2.test')}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={t('step2.delete')}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('step2.deleteTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('step2.deleteDescription')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteWebhook.mutate(w.id, { onError: fail })}
                          >
                            {t('step2.delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Delivery log */}
      <Section
        icon={<RefreshCw className="h-5 w-5" />}
        title={t('log.title')}
        description={t('log.description')}
      >
        {deliveries.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : deliveries.isError ? (
          <ErrorBox
            message={t('loadFailed')}
            onRetry={() => void deliveries.refetch()}
            retryLabel={t('retry')}
          />
        ) : (deliveries.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('log.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('log.event')}</TableHead>
                  <TableHead>{t('log.endpoint')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('log.attempts')}</TableHead>
                  <TableHead>{t('log.result')}</TableHead>
                  <TableHead>{t('log.time')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(deliveries.data ?? []).map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-xs">
                      {d.eventType === 'mizano.test' ? t('log.testEvent') : eventLabel(d.eventType)}
                    </TableCell>
                    <TableCell className="text-xs">{d.endpoint.name}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[d.status]}>
                        {d.status === 'PENDING' && d.attempts > 0
                          ? t('log.status.RETRYING')
                          : t(`log.status.${d.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {d.attempts}/{d.maxAttempts}
                    </TableCell>
                    <TableCell dir="ltr" className="max-w-[16rem] truncate text-xs">
                      {d.lastStatusCode ? `HTTP ${d.lastStatusCode}` : (d.lastError ?? '—')}
                    </TableCell>
                    <TableCell className="text-xs">
                      {d.status === 'PENDING' && d.attempts > 0
                        ? t('log.nextAttempt', { time: date(d.nextAttemptAt) })
                        : date(d.deliveredAt ?? d.createdAt)}
                    </TableCell>
                    <TableCell className="text-end">
                      {canEdit && d.status !== 'DELIVERING' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={redeliver.isPending}
                          onClick={() => redeliver.mutate(d.id, { onError: fail })}
                        >
                          {t('log.redeliver')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  );
}
