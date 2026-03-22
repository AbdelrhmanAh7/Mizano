'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  useAuditLogs,
  useAuditStats,
  formatAuditAction,
  getActionColor,
} from '@/lib/hooks/use-audit-logs';
import { ChevronLeft, ChevronRight, Edit3, Plus, ScrollText, Search, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { format } from 'date-fns';

export default function AuditLogsPage() {
  const t = useTranslations('settings.auditLogs');

  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState<string>('all');
  const [action, setAction] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const limit = 20;

  const { data: statsData, isLoading: statsLoading } = useAuditStats(30);
  const stats = statsData?.data || statsData;

  const { data: logsData, isLoading: logsLoading } = useAuditLogs({
    page,
    limit,
    entityType: entityType !== 'all' ? entityType : undefined,
    action: action !== 'all' ? (action as 'CREATE' | 'UPDATE' | 'DELETE') : undefined,
    search: searchQuery || undefined,
  });

  const logs = logsData?.data || logsData?.items || [];
  const meta = logsData?.meta;
  const totalPages = meta?.totalPages || 1;

  const entityTypes = [
    'invoices',
    'bills',
    'customers',
    'vendors',
    'journals',
    'payments',
    'expenses',
    'items',
    'accounts',
    'bank-accounts',
  ];

  if (statsLoading && logsLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <ScrollText className="h-4 w-4" />
                {t('stats.totalActions')}
              </div>
              <div className="text-2xl font-bold">{stats.total || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Plus className="h-4 w-4" />
                {t('stats.creates')}
              </div>
              <div className="text-2xl font-bold text-green-600">{stats.creates || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Edit3 className="h-4 w-4" />
                {t('stats.updates')}
              </div>
              <div className="text-2xl font-bold text-blue-600">{stats.updates || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Trash2 className="h-4 w-4" />
                {t('stats.deletes')}
              </div>
              <div className="text-2xl font-bold text-red-600">{stats.deletes || 0}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('filters.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
            <Select
              value={entityType}
              onValueChange={(v) => {
                setEntityType(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder={t('filters.entityType')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filters.allEntities')}</SelectItem>
                {entityTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={action}
              onValueChange={(v) => {
                setAction(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t('filters.action')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filters.allActions')}</SelectItem>
                <SelectItem value="CREATE">{t('actions.create')}</SelectItem>
                <SelectItem value="UPDATE">{t('actions.update')}</SelectItem>
                <SelectItem value="DELETE">{t('actions.delete')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('table.title')}</CardTitle>
          <CardDescription>{t('table.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center">
              <ScrollText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t('empty.title')}</p>
              <p className="text-sm text-muted-foreground">{t('empty.description')}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('columns.timestamp')}</TableHead>
                      <TableHead>{t('columns.user')}</TableHead>
                      <TableHead>{t('columns.action')}</TableHead>
                      <TableHead>{t('columns.entityType')}</TableHead>
                      <TableHead>{t('columns.entityId')}</TableHead>
                      <TableHead>{t('columns.ip')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map(
                      (log: {
                        id: string;
                        createdAt: string;
                        user?: { name?: string; email?: string };
                        action: string;
                        entityType: string;
                        entityId: string;
                        ipAddress?: string;
                      }) => (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(log.createdAt), 'MMM d, yyyy HH:mm')}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{log.user?.name || '-'}</div>
                              <div className="text-xs text-muted-foreground">
                                {log.user?.email || ''}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getActionColor(log.action)}>
                              {formatAuditAction(log.action)}
                            </Badge>
                          </TableCell>
                          <TableCell className="capitalize">
                            {log.entityType.replace(/-/g, ' ')}
                          </TableCell>
                          <TableCell className="font-mono text-xs max-w-[120px] truncate">
                            {log.entityId}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {log.ipAddress || '-'}
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    {t('pagination.page')} {page} / {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
