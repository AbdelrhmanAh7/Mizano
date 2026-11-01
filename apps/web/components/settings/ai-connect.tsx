'use client';

import { AiAppConnect } from '@/components/settings/ai-app-connect';
import { Badge } from '@/components/ui/badge';
import { AiModelPicker } from '@/components/settings/ai-model-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { getLocalizedApiErrorMessage } from '@/lib/api-error';
import {
  AI_FEATURES,
  PROVIDER_KEY_URLS,
  type AiFeature,
  type AiProvider,
  type AiSettingsView,
} from '@/lib/api/ai-settings';
import {
  useAiModels,
  useAiSettings,
  useAiUsage,
  useCompleteOpenRouter,
  useConnectAi,
  useConsentAi,
  useRevokeAi,
  useStartOpenRouter,
  useTestAi,
  useUpdateAi,
} from '@/lib/hooks/use-ai-settings';
import { Link } from '@/i18n/routing';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { ArrowLeft, Brain, ExternalLink, KeyRound, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

/** `?openrouter_state=…&code=…` (or `…?code=…` when the provider appended a second `?`). */
function readOpenRouterReturn(search: string): { state: string; code: string } | null {
  const params = new URLSearchParams(search.replace(/\?/g, '&'));
  const state = params.get('openrouter_state');
  const code = params.get('code');
  return state && code ? { state, code } : null;
}

function StatusBadge({ view, t }: { view: AiSettingsView; t: (key: string) => string }) {
  if (view.provider === 'none') return <Badge variant="secondary">{t('status.off')}</Badge>;
  if (view.activeFeatures.length === 0)
    return <Badge variant="outline">{t('status.connected')}</Badge>;
  return <Badge>{t('status.on')}</Badge>;
}

export function AiConnect() {
  const t = useTranslations('settings.ai');
  const tErrors = useTranslations('settings.aiErrors');
  const locale = useLocale();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('settings.edit');

  const settings = useAiSettings();
  const view = settings.data;
  const connected = !!view && view.provider !== 'none';
  const usage = useAiUsage(connected);
  const models = useAiModels(connected);

  const connect = useConnectAi();
  const update = useUpdateAi();
  const consent = useConsentAi();
  const revoke = useRevokeAi();
  const test = useTestAi();
  const startOpenRouter = useStartOpenRouter();
  const completeOpenRouter = useCompleteOpenRouter();

  const [provider, setProvider] = useState<AiProvider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [limit, setLimit] = useState('');
  const [error, setError] = useState<string | null>(null);
  const handledReturn = useRef(false);

  const fail = (err: unknown) =>
    setError(getLocalizedApiErrorMessage(err, t('genericError'), tErrors));

  useEffect(() => {
    if (view) setLimit(view.monthlyLimitUsd);
  }, [view]);

  // Coming back from OpenRouter: finish the PKCE exchange once, then clean the URL.
  useEffect(() => {
    if (handledReturn.current || typeof window === 'undefined') return;
    const back = readOpenRouterReturn(window.location.search);
    if (!back) return;
    handledReturn.current = true;
    window.history.replaceState(null, '', window.location.pathname);
    completeOpenRouter.mutate(back, { onError: fail });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (settings.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (settings.isError || !view) {
    return (
      <div className="rounded-md border border-destructive p-4 text-sm">
        <p className="text-destructive">{t('loadFailed')}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => settings.refetch()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  const providerName = (p: string) => t(`providers.${p}`);
  const consentGiven = !!view.consent && view.consent.provider === view.provider;
  const offered = view.availableProviders;
  const keyUrl = provider === 'ollama' ? null : PROVIDER_KEY_URLS[provider];

  const onConnect = () => {
    setError(null);
    connect.mutate(
      { provider, ...(provider === 'ollama' ? {} : { apiKey: apiKey.trim() }) },
      { onSuccess: () => setApiKey(''), onError: fail },
    );
  };

  const onOpenRouter = () => {
    setError(null);
    const callbackUrl = `${window.location.origin}/${locale}/settings/ai`;
    startOpenRouter.mutate(callbackUrl, {
      onSuccess: ({ authUrl }) => window.location.assign(authUrl),
      onError: fail,
    });
  };

  const toggleFeature = (feature: AiFeature, on: boolean) => {
    setError(null);
    const others = view.features.filter((f) => f !== feature);
    const features = on ? [...others, feature] : others;
    update.mutate({ features }, { onError: fail });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild aria-label={t('back')}>
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Brain className="h-6 w-6" />
            {t('title')}
            <StatusBadge view={view} t={t} />
          </h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {/* The person's own AI app (Claude, ChatGPT, Codex, Gemini) through Mizano's tools */}
      <AiAppConnect />

      {/* Connection: an API key for the features that run inside Mizano */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            {connected ? t('connection.connectedTitle') : t('connection.title')}
          </CardTitle>
          <CardDescription>{t('connection.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {connected && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4 text-sm">
              <span className="font-medium">{providerName(view.provider)}</span>
              {view.keyHint && <code className="rounded bg-muted px-2 py-0.5">{view.keyHint}</code>}
              {view.keySource === 'openrouter_oauth' && (
                <Badge variant="outline">{t('connection.viaOpenRouter')}</Badge>
              )}
              <span className="text-muted-foreground">
                {t('connection.model')}: {view.model}
              </span>
              <Badge variant={view.verifiedAt ? 'secondary' : 'outline'} data-testid="ai-verified">
                {view.verifiedAt ? t('connection.verified') : t('connection.notVerified')}
              </Badge>
              <div className="ms-auto flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canEdit || test.isPending}
                  onClick={() => {
                    setError(null);
                    test.mutate(undefined, { onError: fail });
                  }}
                >
                  {test.isPending
                    ? t('connection.testing')
                    : !view.verifiedAt || view.lastError
                      ? t('connection.testAgain')
                      : t('connection.test')}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={!canEdit || revoke.isPending}>
                      {t('connection.revoke')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('connection.revokeTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>{t('connection.revokeBody')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => revoke.mutate(undefined, { onError: fail })}
                      >
                        {t('connection.revoke')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              {view.lastError && (
                <div
                  className="w-full rounded-md border border-destructive p-3 text-sm"
                  role="alert"
                  data-testid="ai-last-error"
                >
                  <p className="font-medium text-destructive">{t('connection.lastErrorTitle')}</p>
                  <p>
                    {tErrors.has(view.lastError.code)
                      ? tErrors(view.lastError.code)
                      : tErrors('AI_PROVIDER_ERROR')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('connection.lastErrorAt', {
                      date: new Date(view.lastError.at).toLocaleString(locale),
                    })}
                  </p>
                </div>
              )}
              {test.data && (
                <p className="w-full text-xs text-muted-foreground">
                  {t('connection.testOk', { ms: test.data.latencyMs })}
                </p>
              )}
            </div>
          )}

          {!view.encryptionConfigured && (
            <p className="text-sm text-destructive">{t('connection.encryptionMissing')}</p>
          )}

          <div className="grid gap-4 md:grid-cols-[220px_1fr_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="ai-provider">{t('connection.provider')}</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as AiProvider)}>
                <SelectTrigger id="ai-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {offered.map((p) => (
                    <SelectItem key={p} value={p}>
                      {providerName(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {provider !== 'ollama' ? (
              <div className="space-y-2">
                <Label htmlFor="ai-key">{t('connection.apiKey')}</Label>
                <Input
                  id="ai-key"
                  type="password"
                  autoComplete="off"
                  dir="ltr"
                  value={apiKey}
                  placeholder={t('connection.apiKeyPlaceholder')}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('connection.ollamaHint')}</p>
            )}
            <Button
              onClick={onConnect}
              disabled={!canEdit || connect.isPending || (provider !== 'ollama' && !apiKey.trim())}
            >
              {connect.isPending ? t('connection.verifying') : t('connection.connect')}
            </Button>
          </div>

          {keyUrl && (
            <a
              href={keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
            >
              {t('connection.getKey', { provider: providerName(provider) })}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <p className="text-xs text-muted-foreground">{t('connection.subscriptionNote')}</p>

          {offered.includes('openrouter') && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4">
              <p className="flex-1 text-sm">{t('connection.openRouterHint')}</p>
              <Button
                variant="outline"
                onClick={onOpenRouter}
                disabled={!canEdit || startOpenRouter.isPending || completeOpenRouter.isPending}
              >
                {completeOpenRouter.isPending
                  ? t('connection.verifying')
                  : t('connection.openRouterConnect')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {connected && (
        <>
          {/* Consent */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                {t('consent.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>{t('consent.body', { provider: providerName(view.provider) })}</p>
              {consentGiven ? (
                <p className="text-muted-foreground">
                  {t('consent.given', {
                    date: new Date(view.consent!.at).toLocaleDateString(locale),
                  })}
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={agreed}
                      onCheckedChange={(v) => setAgreed(v === true)}
                      disabled={!canEdit}
                    />
                    {t('consent.checkbox', { provider: providerName(view.provider) })}
                  </label>
                  <Button
                    size="sm"
                    disabled={!canEdit || !agreed || consent.isPending}
                    onClick={() => consent.mutate(view.provider as AiProvider, { onError: fail })}
                  >
                    {t('consent.accept')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Features */}
          <Card>
            <CardHeader>
              <CardTitle>{t('features.title')}</CardTitle>
              <CardDescription>{t('features.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {AI_FEATURES.map((feature) => (
                <div
                  key={feature}
                  className="flex items-center justify-between gap-4 rounded-lg border p-4"
                >
                  <div>
                    <Label htmlFor={`ai-feature-${feature}`} className="text-sm font-medium">
                      {t(`features.${feature}`)}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t(`features.${feature}Description`)}
                    </p>
                  </div>
                  <Switch
                    id={`ai-feature-${feature}`}
                    checked={view.features.includes(feature)}
                    disabled={!canEdit || !consentGiven || update.isPending}
                    onCheckedChange={(on) => toggleFeature(feature, on)}
                  />
                </div>
              ))}
              {!consentGiven && (
                <p className="text-xs text-muted-foreground">{t('features.needsConsent')}</p>
              )}
            </CardContent>
          </Card>

          {/* Model, limit and usage */}
          <Card>
            <CardHeader>
              <CardTitle>{t('spend.title')}</CardTitle>
              <CardDescription>{t('spend.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ai-model">{t('connection.model')}</Label>
                  {models.isError ? (
                    <p className="text-sm text-destructive">{t('spend.modelsFailed')}</p>
                  ) : (
                    <AiModelPicker
                      models={models.data ?? []}
                      current={view.model}
                      disabled={!canEdit || models.isLoading}
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-limit">{t('spend.limit')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="ai-limit"
                      inputMode="decimal"
                      dir="ltr"
                      value={limit}
                      onChange={(e) => setLimit(e.target.value)}
                      disabled={!canEdit}
                    />
                    <Button
                      variant="outline"
                      disabled={
                        !canEdit ||
                        update.isPending ||
                        !/^\d{1,4}(\.\d{1,2})?$/.test(limit) ||
                        limit === view.monthlyLimitUsd
                      }
                      onClick={() => update.mutate({ monthlyLimitUsd: limit }, { onError: fail })}
                    >
                      {t('save')}
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-sm">
                {t('spend.used', { spent: view.spentThisMonthUsd, limit: view.monthlyLimitUsd })}
              </p>
              {usage.isError && (
                <p className="text-sm text-destructive">{t('spend.usageFailed')}</p>
              )}
              {usage.data && usage.data.byFeature.length > 0 && (
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {usage.data.byFeature.map((row) => (
                    <li key={row.feature}>
                      {t(`usageFeature.${row.feature}`)}: {t('spend.calls', { count: row.calls })} ·
                      ${row.costUsd}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
