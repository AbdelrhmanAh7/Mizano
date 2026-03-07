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
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useCacheKeys,
  useCacheStats,
  useDeleteCachePattern,
  useFlushCache,
} from '@/lib/hooks/use-cache';
import {
  Activity,
  ArrowLeft,
  Clock,
  Database,
  HardDrive,
  Key,
  RefreshCw,
  Search,
  Trash2,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

// ─── Helpers ──────────────────────────────────────

function formatUptime(seconds: number): string {
  if (seconds <= 0) return 'N/A';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTTL(ttl: number): string {
  if (ttl === -1) return 'No expiry';
  if (ttl === -2) return 'Expired';
  if (ttl <= 0) return '—';
  if (ttl >= 3600) return `${Math.floor(ttl / 3600)}h ${Math.floor((ttl % 3600) / 60)}m`;
  if (ttl >= 60) return `${Math.floor(ttl / 60)}m ${ttl % 60}s`;
  return `${ttl}s`;
}

function extractKeyLabel(fullKey: string): string {
  // Strip org prefix: "org:abc-123:dashboard:overview:xyz" → "dashboard:overview:xyz"
  const match = fullKey.match(/^org:[^:]+:(.+)$/);
  return match ? match[1] : fullKey;
}

// ─── Stats Loading Skeleton ──────────────────────

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-20" />
            <Skeleton className="mt-2 h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Empty State ─────────────────────────────────

function EmptyKeys() {
  const t = useTranslations('settings');
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Key className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">{t('cache.noKeys')}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{t('cache.noKeysDescription')}</p>
    </div>
  );
}

// ─── Main Component ──────────────────────────────

export function CacheManagement() {
  const t = useTranslations('settings');
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useCacheStats();
  const {
    data: keysData,
    isLoading: keysLoading,
    error: keysError,
    refetch: refetchKeys,
  } = useCacheKeys();
  const flushMutation = useFlushCache();
  const deletePatternMutation = useDeleteCachePattern();
  const [searchFilter, setSearchFilter] = useState('');

  const filteredKeys =
    keysData?.keys?.filter((k) =>
      extractKeyLabel(k.key).toLowerCase().includes(searchFilter.toLowerCase()),
    ) ?? [];

  const handleRefresh = () => {
    refetchStats();
    refetchKeys();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button variant="ghost" size="icon" aria-label={t('common.goBack')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('cache.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('cache.description')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('cache.refresh')}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                disabled={flushMutation.isPending || !stats?.connected}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('cache.flushAll')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('cache.flushConfirmTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('cache.flushConfirmDescription')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('cache.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => flushMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t('cache.flushCache')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Error State */}
      {statsError && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{t('cache.failedToLoad')}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => refetchStats()}>
              {t('cache.retry')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      {statsLoading ? (
        <StatsSkeleton />
      ) : stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Store Type */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                {t('cache.storeType')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold capitalize">{stats.storeType}</span>
                <Badge variant={stats.connected ? 'default' : 'destructive'}>
                  {stats.connected ? t('cache.connected') : t('cache.disconnected')}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('cache.uptime', { value: formatUptime(stats.uptime) })}
              </p>
            </CardContent>
          </Card>

          {/* Key Count */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                {t('cache.totalKeys')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">{stats.keyCount.toLocaleString()}</span>
              <p className="text-xs text-muted-foreground mt-1">{t('cache.acrossAllOrgs')}</p>
            </CardContent>
          </Card>

          {/* Memory Usage */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                {t('cache.memoryUsage')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">{stats.memoryUsage}</span>
              <p className="text-xs text-muted-foreground mt-1">{t('cache.redisMemory')}</p>
            </CardContent>
          </Card>

          {/* Hit Rate */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                {t('cache.hitRate')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">{stats.hitRate}%</span>
                {stats.hitRate >= 70 ? (
                  <Badge variant="default" className="bg-green-600 text-white">
                    {t('cache.good')}
                  </Badge>
                ) : stats.hitRate >= 40 ? (
                  <Badge variant="secondary">{t('cache.fair')}</Badge>
                ) : (
                  <Badge variant="destructive">{t('cache.low')}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t('cache.cacheEfficiency')}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Cache Keys Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg">{t('cache.cachedKeys')}</CardTitle>
              <CardDescription>{t('cache.cachedKeysDescription')}</CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('cache.filterKeys')}
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {keysLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : keysError ? (
            <div className="text-center py-8">
              <p className="text-sm text-destructive">{t('cache.failedToLoadKeys')}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => refetchKeys()}>
                {t('cache.retry')}
              </Button>
            </div>
          ) : filteredKeys.length === 0 ? (
            <EmptyKeys />
          ) : (
            <div className="overflow-x-auto -mx-6">
              <div className="min-w-[500px] px-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('cache.keyColumn')}</TableHead>
                      <TableHead className="w-[120px]">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {t('cache.ttlColumn')}
                        </div>
                      </TableHead>
                      <TableHead className="w-[80px] text-right">
                        {t('cache.actionsColumn')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredKeys.map((keyInfo) => {
                      const label = extractKeyLabel(keyInfo.key);
                      // Extract category prefix (e.g. "dashboard" from "dashboard:overview:xyz")
                      const category = label.split(':')[0];

                      return (
                        <TableRow key={keyInfo.key}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs font-normal shrink-0">
                                {category}
                              </Badge>
                              <span
                                className="text-sm font-mono truncate max-w-[300px]"
                                title={label}
                              >
                                {label}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {formatTTL(keyInfo.ttl)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => deletePatternMutation.mutate(label)}
                              disabled={deletePatternMutation.isPending}
                              title="Delete this key"
                              aria-label="Delete cache key"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cache Architecture Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {t('cache.howItWorks')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div>
              <h4 className="font-semibold mb-1">{t('cache.dashboardReports')}</h4>
              <p className="text-muted-foreground">{t('cache.dashboardReportsDescription')}</p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">{t('cache.accountLists')}</h4>
              <p className="text-muted-foreground">{t('cache.accountListsDescription')}</p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">{t('cache.salesPurchases')}</h4>
              <p className="text-muted-foreground">{t('cache.salesPurchasesDescription')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
