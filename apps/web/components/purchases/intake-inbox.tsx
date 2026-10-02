'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { AlertTriangle, ExternalLink, FileSearch, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { BulkActionConfirmDialog } from '@/components/data-table/bulk-action-confirm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import type { IntakeJobStatus } from '@/lib/hooks/use-ai-document-intake';
import {
  intakeInboxApi,
  useBulkApproveIntake,
  useIntakeInbox,
  useRetryIntakeJob,
  type IntakeInboxRow,
  type IntakeSource,
} from '@/lib/hooks/use-intake-inbox';
import { useBaseCurrency } from '@/lib/hooks/use-organization';
import { usePermissions } from '@/lib/hooks/use-permissions';

export type InboxTab = 'ready' | 'review' | 'failed' | 'approved';

export const INBOX_TAB_STATUSES: Record<InboxTab, IntakeJobStatus[]> = {
  ready: ['EXTRACTED'],
  review: ['NEEDS_REVIEW'],
  failed: ['FAILED', 'DEAD_LETTER'],
  approved: ['APPROVED'],
};

const TABS: InboxTab[] = ['ready', 'review', 'failed', 'approved'];
const COLUMNS = [
  'date',
  'source',
  'file',
  'vendor',
  'invoiceNo',
  'total',
  'status',
  'confidence',
  'actions',
] as const;
const PAGE_SIZE = 20;
const MAX_TOAST_FAILURES = 5;

function formatMoney(total: string | null, currency: string | undefined, locale: string): string {
  if (total === null) return '—';
  const amount = Number(total);
  if (!Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat(
      locale,
      currency ? { style: 'currency', currency } : undefined,
    ).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency ?? ''}`.trim();
  }
}

function rowLabel(row: IntakeInboxRow): string {
  return row.summary.vendorName || row.originalFileName;
}

export function IntakeInbox(): JSX.Element {
  const t = useTranslations('purchases.inbox');
  const tStatus = useTranslations('ai.intake.status');
  const locale = useLocale();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const baseCurrency = useBaseCurrency();
  // Same permission as the API routes (list, original, retry, confirm).
  const canUse = hasPermission('purchases.create');

  const [tab, setTab] = useState<InboxTab>('ready');
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<IntakeSource | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const query = useIntakeInbox({
    status: INBOX_TAB_STATUSES[tab],
    source: source || undefined,
    from: from || undefined,
    to: to || undefined,
    search: search || undefined,
    page,
    limit: PAGE_SIZE,
  });
  const bulkApprove = useBulkApproveIntake();
  const retry = useRetryIntakeJob();

  const rows = useMemo(() => query.data?.data ?? [], [query.data]);
  const meta = query.data?.meta;
  const approvableIds = useMemo(
    () => (tab === 'ready' ? rows.filter((r) => r.summary.readyToApprove).map((r) => r.id) : []),
    [rows, tab],
  );

  // Keep only selections that are still ready after a refresh (e.g. approved elsewhere).
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set(Array.from(prev).filter((id) => approvableIds.includes(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [approvableIds]);

  const resetView = (): void => {
    setSelected(new Set());
    setPage(1);
  };

  const toggle = (id: string, checked: boolean): void =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const allSelected = approvableIds.length > 0 && approvableIds.every((id) => selected.has(id));

  const runApprove = async (): Promise<void> => {
    const ids = Array.from(selected);
    const names = new Map(rows.map((r) => [r.id, rowLabel(r)]));
    try {
      const result = await bulkApprove.mutateAsync(ids);
      const failures = result.failures ?? [];
      setSelected(new Set());
      setConfirmOpen(false);
      if (failures.length === 0) {
        toast({
          title: t('toast.approvedTitle'),
          description: t('toast.approvedDescription', { count: result.processed }),
        });
        return;
      }
      const lines = failures
        .slice(0, MAX_TOAST_FAILURES)
        .map((f) => `${names.get(f.id) ?? f.id}: ${f.reason}`);
      if (failures.length > MAX_TOAST_FAILURES) {
        lines.push(t('toast.moreFailures', { count: failures.length - MAX_TOAST_FAILURES }));
      }
      toast({
        variant: 'destructive',
        title: t('toast.partialTitle', { processed: result.processed, total: result.total }),
        description: lines.join('\n'),
      });
    } catch {
      setConfirmOpen(false);
      toast({ variant: 'destructive', title: t('toast.errorTitle') });
    }
  };

  const runRetry = async (id: string): Promise<void> => {
    setRetryingId(id);
    try {
      await retry.mutateAsync(id);
      toast({ title: t('toast.retryQueued') });
    } catch {
      toast({ variant: 'destructive', title: t('toast.retryFailed') });
    } finally {
      setRetryingId(null);
    }
  };

  const openOriginal = async (id: string): Promise<void> => {
    try {
      await intakeInboxApi.openOriginal(id);
    } catch {
      toast({ variant: 'destructive', title: t('toast.originalFailed') });
    }
  };

  if (!canUse) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          {t('noAccess')}
        </CardContent>
      </Card>
    );
  }

  const hasError = query.isError && !query.data;
  const showSelection = tab === 'ready';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw
              className={`me-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`}
              aria-hidden
            />
            {t('refresh')}
          </Button>
          {showSelection && (
            <Button
              size="sm"
              disabled={selected.size === 0 || bulkApprove.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              {t('approveSelected', { count: selected.size })}
            </Button>
          )}
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as InboxTab);
          resetView();
        }}
      >
        <TabsList className="h-auto flex-wrap">
          {TABS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {t(`tabs.${key}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            resetView();
          }}
          placeholder={t('filters.search')}
          aria-label={t('filters.search')}
        />
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={source}
          aria-label={t('filters.source')}
          onChange={(e) => {
            setSource(e.target.value as IntakeSource | '');
            resetView();
          }}
        >
          <option value="">{t('filters.allSources')}</option>
          <option value="WEB">{t('source.WEB')}</option>
          <option value="TELEGRAM">{t('source.TELEGRAM')}</option>
        </select>
        <Input
          type="date"
          value={from}
          max={to || undefined}
          aria-label={t('filters.from')}
          onChange={(e) => {
            setFrom(e.target.value);
            resetView();
          }}
        />
        <Input
          type="date"
          value={to}
          min={from || undefined}
          aria-label={t('filters.to')}
          onChange={(e) => {
            setTo(e.target.value);
            resetView();
          }}
        />
      </div>

      {query.isError && query.data && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm"
        >
          <AlertTriangle className="h-4 w-4" aria-hidden />
          {t('reconnecting')}
        </div>
      )}

      {query.isLoading ? (
        <div className="space-y-2" data-testid="inbox-loading" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : hasError ? (
        <Card>
          <CardContent
            role="alert"
            className="flex flex-col items-center gap-3 py-10 text-center"
            data-testid="inbox-error"
          >
            <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
            <div>
              <p className="font-medium">{t('error.title')}</p>
              <p className="text-sm text-muted-foreground">{t('error.description')}</p>
            </div>
            <Button variant="outline" onClick={() => void query.refetch()}>
              {t('error.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent
            className="flex flex-col items-center gap-2 py-10 text-center"
            data-testid="inbox-empty"
          >
            <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">{t(`empty.${tab}.title`)}</p>
            <p className="text-sm text-muted-foreground">{t(`empty.${tab}.description`)}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-start">
              <tr>
                {showSelection && (
                  <th className="w-10 px-3 py-2 text-start">
                    <Checkbox
                      aria-label={t('selectAll')}
                      checked={allSelected}
                      disabled={approvableIds.length === 0}
                      onCheckedChange={(checked) =>
                        setSelected(checked === true ? new Set(approvableIds) : new Set())
                      }
                    />
                  </th>
                )}
                {COLUMNS.map((col) => (
                  <th key={col} className="px-3 py-2 text-start font-medium">
                    {t(`columns.${col}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const s = row.summary;
                const ready = s.readyToApprove;
                // The inbox only creates bills; a draft of another type has no page here.
                const draftHref =
                  row.status === 'APPROVED' &&
                  row.draftDocumentId &&
                  row.draftDocumentType === 'bill'
                    ? `/purchases/bills/${row.draftDocumentId}`
                    : null;
                return (
                  <tr key={row.id} className="border-t" data-testid={`inbox-row-${row.id}`}>
                    {showSelection && (
                      <td className="px-3 py-2">
                        <Checkbox
                          aria-label={t('selectRow', { name: rowLabel(row) })}
                          checked={selected.has(row.id)}
                          disabled={!ready}
                          title={!ready && s.blocker ? t(`blocker.${s.blocker}`) : undefined}
                          onCheckedChange={(checked) => toggle(row.id, checked === true)}
                        />
                      </td>
                    )}
                    <td className="whitespace-nowrap px-3 py-2">
                      {format(new Date(row.createdAt), 'yyyy-MM-dd HH:mm')}
                    </td>
                    <td className="px-3 py-2">{t(`source.${row.source}`)}</td>
                    <td className="max-w-[12rem] truncate px-3 py-2" title={row.originalFileName}>
                      {row.originalFileName}
                    </td>
                    <td className="px-3 py-2">{s.vendorName ?? '—'}</td>
                    <td className="px-3 py-2">{s.documentNumber ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-end tabular-nums">
                      {formatMoney(s.total, s.currency ?? baseCurrency, locale)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={row.status === 'APPROVED' ? 'default' : 'secondary'}>
                        {tStatus(row.status)}
                      </Badge>
                      {row.status === 'EXTRACTED' && !ready && s.blocker && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t(`blocker.${s.blocker}`)}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {s.confidence === null ? '—' : `${Math.round(s.confidence * 100)}%`}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {draftHref ? (
                          <Button asChild variant="outline" size="sm">
                            <Link href={draftHref}>{t('openDraft')}</Link>
                          </Button>
                        ) : row.status === 'EXTRACTED' || row.status === 'NEEDS_REVIEW' ? (
                          <Button asChild variant="outline" size="sm">
                            <Link
                              href={`/purchases/bills/scan?jobId=${encodeURIComponent(row.id)}`}
                            >
                              <FileSearch className="me-1 h-4 w-4" aria-hidden />
                              {t('review')}
                            </Link>
                          </Button>
                        ) : null}
                        {(row.status === 'FAILED' || row.status === 'DEAD_LETTER') && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={retryingId === row.id}
                            onClick={() => void runRetry(row.id)}
                          >
                            {retryingId === row.id ? (
                              <Loader2 className="me-1 h-4 w-4 animate-spin" aria-hidden />
                            ) : (
                              <RefreshCw className="me-1 h-4 w-4" aria-hidden />
                            )}
                            {t('retry')}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void openOriginal(row.id)}
                          aria-label={t('viewOriginalFor', { name: row.originalFileName })}
                        >
                          <ExternalLink className="me-1 h-4 w-4" aria-hidden />
                          {t('viewOriginal')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t('previous')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t('pageOf', { page: meta.page, total: meta.totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('next')}
          </Button>
        </div>
      )}

      <BulkActionConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        action="approve"
        count={selected.size}
        itemType="documents"
        title={t('confirm.title', { count: selected.size })}
        description={t('confirm.description', { count: selected.size })}
        confirmLabel={t('confirm.confirm')}
        cancelLabel={t('confirm.cancel')}
        isLoading={bulkApprove.isPending}
        onConfirm={() => void runApprove()}
      />
    </div>
  );
}
