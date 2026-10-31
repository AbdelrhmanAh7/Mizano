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
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getLocalizedApiErrorMessage } from '@/lib/api-error';
import type { McpConnection } from '@/lib/api/mcp';
import { useMcpConnections, useRevokeMcpConnection } from '@/lib/hooks/use-mcp';
import { Check, Copy, PlugZap } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const APPS = ['claude', 'claudeCode', 'chatgpt', 'codex', 'gemini'] as const;
type App = (typeof APPS)[number];

/** Builder commands per app; `{url}` is the server address. Shown as-is in both languages. */
const COMMANDS: Partial<Record<App, string[]>> = {
  claudeCode: ['claude mcp add --transport http mizano {url}', '/mcp'],
  codex: ['codex mcp add mizano --url {url}', 'codex mcp login mizano'],
  gemini: ['gemini mcp add --transport http mizano {url}', '/mcp auth mizano'],
};

/** Steps (message keys) per app, in order. */
const STEPS: Record<App, string[]> = {
  claude: ['claude1', 'claude2', 'claude3'],
  claudeCode: ['claudeCode1', 'claudeCode2'],
  chatgpt: ['chatgpt1', 'chatgpt2', 'chatgpt3'],
  codex: ['codex1', 'codex2'],
  gemini: ['gemini1', 'gemini2', 'gemini3'],
};

function CopyButton({ value, label, copied }: { value: string; label: string; copied: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), 2000);
    return () => clearTimeout(timer);
  }, [done]);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => setDone(true));
      }}
    >
      {done ? <Check className="me-1 h-3.5 w-3.5" /> : <Copy className="me-1 h-3.5 w-3.5" />}
      {done ? copied : label}
    </Button>
  );
}

function CommandBlock({
  command,
  copy,
  copied,
}: {
  command: string;
  copy: string;
  copied: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted p-2" dir="ltr">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs">
        {command}
      </code>
      <CopyButton value={command} label={copy} copied={copied} />
    </div>
  );
}

/**
 * "Connect your AI app": the person's own Claude, ChatGPT, Codex or Gemini works through Mizano's
 * tools with no key; the list shows connected apps and lets their owner (or an admin) disconnect.
 */
export function AiAppConnect() {
  const t = useTranslations('settings.aiApp');
  const tErrors = useTranslations('settings.mcpErrors');
  const locale = useLocale();
  const query = useMcpConnections();
  const revoke = useRevokeMcpConnection();
  const [error, setError] = useState<string | null>(null);

  const serverUrl = query.data?.serverUrl ?? null;
  const date = (value: string) => new Date(value).toLocaleDateString(locale);

  const disconnect = (connection: McpConnection) => {
    setError(null);
    revoke.mutate(connection.id, {
      onError: (err) => setError(getLocalizedApiErrorMessage(err, t('genericError'), tErrors)),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlugZap className="h-5 w-5" />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {query.isLoading && (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {query.isError && (
          <div className="rounded-md border border-destructive p-4 text-sm">
            <p className="text-destructive">
              {getLocalizedApiErrorMessage(query.error, t('loadFailed'), tErrors)}
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => query.refetch()}>
              {t('retry')}
            </Button>
          </div>
        )}

        {query.data && (
          <>
            {serverUrl ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('address')}</p>
                <div className="flex items-center gap-2 rounded-md border p-2" dir="ltr">
                  <code className="min-w-0 flex-1 break-all font-mono text-sm">{serverUrl}</code>
                  <CopyButton value={serverUrl} label={t('copy')} copied={t('copied')} />
                </div>
                <p className="text-xs text-muted-foreground">{t('addressHint')}</p>
              </div>
            ) : (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                {t('notConfigured')}
              </p>
            )}

            {serverUrl && (
              <Tabs defaultValue="claude" className="space-y-3">
                <TabsList className="h-auto flex-wrap justify-start">
                  {APPS.map((app) => (
                    <TabsTrigger key={app} value={app}>
                      {t(`apps.${app}`)}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {APPS.map((app) => (
                  <TabsContent key={app} value={app} className="space-y-3">
                    <ol className="list-decimal space-y-2 ps-5 text-sm">
                      {STEPS[app].map((step) => (
                        <li key={step}>{t(`steps.${step}`)}</li>
                      ))}
                    </ol>
                    {COMMANDS[app]?.map((command) => (
                      <CommandBlock
                        key={command}
                        command={command.replace('{url}', serverUrl)}
                        copy={t('copy')}
                        copied={t('copied')}
                      />
                    ))}
                  </TabsContent>
                ))}
              </Tabs>
            )}

            <p className="text-sm text-muted-foreground">{t('safety')}</p>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">{t('connected.title')}</h3>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {query.data.connections.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('connected.empty')}</p>
              ) : (
                <ul className="space-y-2">
                  {query.data.connections.map((connection) => (
                    <li
                      key={connection.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          <span className="break-words">{connection.clientName}</span>
                          <Badge variant="outline">{t(`access.${connection.access}`)}</Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('connected.by', {
                            name: connection.isMine ? t('connected.you') : connection.userName,
                            date: date(connection.createdAt),
                          })}
                          {' · '}
                          {connection.lastUsedAt
                            ? t('connected.lastUsed', { date: date(connection.lastUsedAt) })
                            : t('connected.notUsed')}
                        </p>
                      </div>
                      {(connection.isMine || query.data.canManageAll) && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" disabled={revoke.isPending}>
                              {t('connected.disconnect')}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t('connected.disconnectTitle', { app: connection.clientName })}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t('connected.disconnectBody')}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                              <AlertDialogAction onClick={() => disconnect(connection)}>
                                {t('connected.disconnect')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
