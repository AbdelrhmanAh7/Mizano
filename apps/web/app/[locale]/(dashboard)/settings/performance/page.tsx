'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import type {
  IndexRecommendation,
  QueryDistributionItem,
  QueryMetricEntry,
  TimeTrendItem,
} from '@/lib/hooks/use-performance';
import {
  useDatabaseHealth,
  useIndexRecommendations,
  useQueryDistribution,
  useQueryStats,
  useResetMetrics,
  useResponseTimeTrend,
  useSlowQueries,
} from '@/lib/hooks/use-performance';
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  Lightbulb,
  RefreshCw,
  Server,
  Zap,
} from 'lucide-react';
import { useState } from 'react';

// ─── Duration Badge ────────────────────────────────────────────────────────────

function DurationBadge({ duration }: { duration: number }) {
  if (duration < 100) {
    return (
      <Badge
        variant="secondary"
        className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
      >
        {duration.toFixed(1)}ms
      </Badge>
    );
  }
  if (duration < 500) {
    return (
      <Badge
        variant="secondary"
        className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
      >
        {duration.toFixed(1)}ms
      </Badge>
    );
  }
  return <Badge variant="destructive">{duration.toFixed(1)}ms</Badge>;
}

// ─── Health Cards ──────────────────────────────────────────────────────────────

function HealthCards() {
  const { data: health, isLoading } = useDatabaseHealth();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!health) return null;

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Database Status</CardTitle>
          <Database className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {health.primaryConnected ? (
              <span className="text-green-600">Connected</span>
            ) : (
              <span className="text-red-600">Disconnected</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Latency: {health.primaryLatencyMs}ms</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Read Replica</CardTitle>
          <Server className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {health.replicaConfigured ? (
              health.replicaConnected ? (
                <span className="text-green-600">Active</span>
              ) : (
                <span className="text-red-600">Down</span>
              )
            ) : (
              <span className="text-muted-foreground">Not configured</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {health.replicaConfigured && health.replicaLatencyMs != null
              ? `Latency: ${health.replicaLatencyMs}ms`
              : 'Using primary for reads'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Connection Pool</CardTitle>
          <Zap className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{health.poolSize}</div>
          <p className="text-xs text-muted-foreground mt-1">Max connections</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Uptime</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatUptime(health.uptimeSeconds)}</div>
          <p className="text-xs text-muted-foreground mt-1">Since last restart</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Stats Cards ───────────────────────────────────────────────────────────────

function StatsCards() {
  const { data: stats, isLoading } = useQueryStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Queries</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalQueries.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Buffer: {stats.bufferSize.toLocaleString()} entries
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Response</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.avgDuration.toFixed(1)}ms</div>
          <p className="text-xs text-muted-foreground mt-1">P50: {stats.p50.toFixed(1)}ms</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">P95 Latency</CardTitle>
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.p95.toFixed(1)}ms</div>
          <p className="text-xs text-muted-foreground mt-1">P99: {stats.p99.toFixed(1)}ms</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Slow Queries</CardTitle>
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-orange-600">
            {stats.slowQueryCount.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.totalQueries > 0
              ? `${((stats.slowQueryCount / stats.totalQueries) * 100).toFixed(1)}% of total`
              : 'No queries yet'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Distribution Chart (horizontal bars) ──────────────────────────────────────

function DistributionChart() {
  const { data: distribution, isLoading } = useQueryDistribution();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const items = distribution || [];
  const maxCount = Math.max(...items.map((d) => d.count), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Query Distribution by Model</CardTitle>
        <CardDescription>Number of queries per database model</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No query data collected yet
          </p>
        ) : (
          <div className="space-y-3">
            {items.slice(0, 12).map((item: QueryDistributionItem) => (
              <div key={item.model} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium truncate max-w-[120px] sm:max-w-none">
                    {item.model}
                  </span>
                  <span className="text-muted-foreground ml-2 flex-shrink-0">
                    {item.count.toLocaleString()} ({item.avgDuration.toFixed(0)}ms avg)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${(item.count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Response Time Trend ───────────────────────────────────────────────────────

function ResponseTimeTrend() {
  const [interval, setInterval] = useState(5);
  const { data: trend, isLoading } = useResponseTimeTrend(interval);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  const items = trend || [];
  const maxDuration = Math.max(...items.map((t) => t.avgDuration), 1);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">Response Time Trend</CardTitle>
            <CardDescription>Average query duration over time</CardDescription>
          </div>
          <Select value={String(interval)} onValueChange={(v) => setInterval(Number(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 min</SelectItem>
              <SelectItem value="5">5 min</SelectItem>
              <SelectItem value="15">15 min</SelectItem>
              <SelectItem value="30">30 min</SelectItem>
              <SelectItem value="60">60 min</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No trend data available yet
          </p>
        ) : (
          <div className="flex items-end gap-1 h-48 overflow-x-auto">
            {items.map((item: TimeTrendItem, idx: number) => {
              const height = maxDuration > 0 ? (item.avgDuration / maxDuration) * 100 : 0;
              const time = new Date(item.bucket).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });
              return (
                <div
                  key={idx}
                  className="flex flex-col items-center gap-1 flex-shrink-0 min-w-[32px]"
                  title={`${time}: ${item.avgDuration.toFixed(1)}ms (${item.count} queries)`}
                >
                  <div
                    className={`w-6 rounded-t transition-all ${
                      item.avgDuration > 500
                        ? 'bg-red-500'
                        : item.avgDuration > 100
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    }`}
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {time}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Slow Queries Table ────────────────────────────────────────────────────────

function SlowQueriesTable() {
  const [page, setPage] = useState(1);
  const [threshold, setThreshold] = useState(100);
  const { data, isLoading } = useSlowQueries({ page, limit: 10, threshold });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">Slow Queries</CardTitle>
            <CardDescription>Queries exceeding duration threshold</CardDescription>
          </div>
          <Select
            value={String(threshold)}
            onValueChange={(v) => {
              setThreshold(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">&gt; 50ms</SelectItem>
              <SelectItem value="100">&gt; 100ms</SelectItem>
              <SelectItem value="250">&gt; 250ms</SelectItem>
              <SelectItem value="500">&gt; 500ms</SelectItem>
              <SelectItem value="1000">&gt; 1s</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data || data.data.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No queries above {threshold}ms threshold
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Try lowering the threshold or wait for more queries
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto -mx-6">
              <div className="min-w-[500px] px-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.data.map((entry: QueryMetricEntry, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(entry.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-medium">{entry.model}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{entry.action}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DurationBadge duration={entry.duration} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {data.meta.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Page {data.meta.page} of {data.meta.totalPages} ({data.meta.total} total)
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.meta.totalPages}
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
  );
}

// ─── Index Recommendations ─────────────────────────────────────────────────────

function IndexRecommendations() {
  const { data: recommendations, isLoading } = useIndexRecommendations();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const items = recommendations || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-yellow-500" />
          Index Recommendations
        </CardTitle>
        <CardDescription>AI-powered suggestions based on query patterns</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="text-center py-8">
            <Lightbulb className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No recommendations yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Recommendations appear after sufficient query data is collected
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((rec: IndexRecommendation, idx: number) => (
              <div key={idx} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">
                      {rec.table}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      ({rec.columns.join(', ')})
                    </span>
                  </div>
                  <Badge
                    variant={rec.estimatedImpact > 1000 ? 'destructive' : 'secondary'}
                    className="flex-shrink-0"
                  >
                    Impact: {rec.estimatedImpact}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{rec.reason}</p>
                <pre className="text-xs bg-muted rounded p-2 overflow-x-auto">
                  <code>{rec.suggestedSQL}</code>
                </pre>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const resetMetrics = useResetMetrics();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Database Performance</h1>
          <p className="text-muted-foreground">
            Monitor query performance, connection health, and optimization opportunities
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => resetMetrics.mutate()}
          disabled={resetMetrics.isPending}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${resetMetrics.isPending ? 'animate-spin' : ''}`} />
          Reset Metrics
        </Button>
      </div>

      {/* Health Cards */}
      <HealthCards />

      {/* Stats Cards */}
      <StatsCards />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ResponseTimeTrend />
        <DistributionChart />
      </div>

      {/* Slow Queries Table */}
      <SlowQueriesTable />

      {/* Index Recommendations */}
      <IndexRecommendations />
    </div>
  );
}
