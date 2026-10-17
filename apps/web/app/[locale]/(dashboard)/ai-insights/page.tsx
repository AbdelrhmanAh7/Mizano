'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Target,
  Bell,
  BarChart3,
  RefreshCw,
  Eye,
  X,
  Sparkles,
  Play,
  Settings2,
  ListOrdered,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';
import {
  useAIInsights,
  useDismissInsight,
  useRunAnomalyDetection,
  getInsightTypeLabel,
  getInsightTypeColor,
  getInsightPriorityLabel,
  getInsightPriorityColor,
  formatConfidence,
  AIInsight,
  InsightType,
} from '@/lib/hooks/use-ai';

const insightIcons: Record<InsightType, React.ReactNode> = {
  ANOMALY: <AlertTriangle className="h-5 w-5" />,
  TREND: <TrendingUp className="h-5 w-5" />,
  RECOMMENDATION: <Lightbulb className="h-5 w-5" />,
  FORECAST: <BarChart3 className="h-5 w-5" />,
  ALERT: <Bell className="h-5 w-5" />,
  OPPORTUNITY: <Target className="h-5 w-5" />,
};

export default function AIInsightsPage() {
  const t = useTranslations('ai.insights');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('NEW');

  const { data, isLoading, refetch } = useAIInsights({
    type: typeFilter !== 'all' ? typeFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });

  const dismissInsight = useDismissInsight();
  const runAnomalyDetection = useRunAnomalyDetection();

  const insights: AIInsight[] = data?.data || [];

  const handleDismiss = async (id: string) => {
    await dismissInsight.mutateAsync(id);
  };

  const handleRunAnalysis = async () => {
    await runAnomalyDetection.mutateAsync();
    refetch();
  };

  // Summary counts
  const anomalyCount = insights.filter((i) => i.type === 'ANOMALY').length;
  const recommendationCount = insights.filter((i) => i.type === 'RECOMMENDATION').length;
  const highPriorityCount = insights.filter(
    (i) => i.priority === 'HIGH' || i.priority === 'CRITICAL',
  ).length;

  const [workerConfigOpen, setWorkerConfigOpen] = useState(false);
  const [viewJobsOpen, setViewJobsOpen] = useState(false);
  const [workerRunning, setWorkerRunning] = useState(true);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-8 w-8 text-primary" />
            {t('title')}
          </h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setWorkerRunning(true)}
            aria-label="Start Worker"
          >
            <Play className="mr-2 h-4 w-4" />
            {t('startWorker')}
          </Button>

          <Button variant="outline" onClick={() => setViewJobsOpen(true)} aria-label="View Jobs">
            <ListOrdered className="mr-2 h-4 w-4" />
            {t('viewJobs')}
          </Button>

          <Dialog open={workerConfigOpen} onOpenChange={setWorkerConfigOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" aria-label="Worker Configuration">
                <Settings2 className="mr-2 h-4 w-4" />
                {t('workerConfiguration')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('workerConfiguration')}</DialogTitle>
                <DialogDescription>
                  Worker Container, API Image and Worker Entrypoint configuration
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="font-medium">{t('workerContainer')}</span>
                  <Badge variant="outline">intake-worker</Badge>
                </div>
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="font-medium">{t('apiImage')}</span>
                  <span className="text-sm font-mono text-muted-foreground">
                    ghcr.io/abdelrhmanah7/mizano-api:latest
                  </span>
                </div>
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="font-medium">{t('workerEntrypoint')}</span>
                  <span className="text-sm font-mono text-muted-foreground">
                    node dist/main.worker.js
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="font-medium">{t('workerStatus')}</span>
                  <Badge variant={workerRunning ? 'default' : 'secondary'}>
                    {workerRunning ? t('workerRunning') : t('workerReady')}
                  </Badge>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setWorkerRunning(true)}
                  aria-label="Start Worker"
                >
                  {t('startWorker')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setWorkerConfigOpen(false);
                    setViewJobsOpen(true);
                  }}
                  aria-label="View Jobs"
                >
                  {t('viewJobs')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={viewJobsOpen} onOpenChange={setViewJobsOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('viewJobs')}</DialogTitle>
                <DialogDescription>Document intake queue and worker jobs</DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Intake jobs are processed asynchronously by the background worker container.
                </p>
                <Button asChild className="w-full">
                  <Link href="/purchases/bills/scan">Go to Bill Scan & Intake Jobs</Link>
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button onClick={handleRunAnalysis} disabled={runAnomalyDetection.isPending}>
            <RefreshCw
              className={`mr-2 h-4 w-4 ${runAnomalyDetection.isPending ? 'animate-spin' : ''}`}
            />
            {runAnomalyDetection.isPending ? t('analyzing') : t('runAnalysis')}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Sparkles className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('totalInsights')}</p>
                <p className="text-2xl font-bold">{insights.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('anomalies')}</p>
                <p className="text-2xl font-bold text-red-600">{anomalyCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Lightbulb className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('recommendations')}</p>
                <p className="text-2xl font-bold">{recommendationCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Bell className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('highPriority')}</p>
                <p className="text-2xl font-bold text-orange-600">{highPriorityCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="ANOMALY">Anomalies</SelectItem>
            <SelectItem value="TREND">Trends</SelectItem>
            <SelectItem value="RECOMMENDATION">Recommendations</SelectItem>
            <SelectItem value="FORECAST">Forecasts</SelectItem>
            <SelectItem value="ALERT">Alerts</SelectItem>
            <SelectItem value="OPPORTUNITY">Opportunities</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="NEW">New</SelectItem>
            <SelectItem value="VIEWED">Viewed</SelectItem>
            <SelectItem value="ACTIONED">Actioned</SelectItem>
            <SelectItem value="DISMISSED">Dismissed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Insights List */}
      {insights.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Brain className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">{t('noInsightsFound')}</h3>
              <p className="text-muted-foreground">{t('noInsightsDescription')}</p>
              <Button onClick={handleRunAnalysis} className="mt-4">
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('runAnalysis')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {insights.map((insight) => (
            <Card key={insight.id} className="overflow-hidden">
              <div className="flex">
                <div
                  className={`w-1 ${
                    insight.priority === 'CRITICAL'
                      ? 'bg-red-500'
                      : insight.priority === 'HIGH'
                        ? 'bg-orange-500'
                        : insight.priority === 'MEDIUM'
                          ? 'bg-blue-500'
                          : 'bg-gray-300'
                  }`}
                />
                <div className="flex-1 p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div
                        className={`p-2 rounded-lg ${getInsightTypeColor(insight.type).split(' ')[0]}`}
                      >
                        {insightIcons[insight.type]}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{insight.title}</h3>
                          <Badge variant="outline" className={getInsightTypeColor(insight.type)}>
                            {getInsightTypeLabel(insight.type)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={getInsightPriorityColor(insight.priority)}
                          >
                            {getInsightPriorityLabel(insight.priority)}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground">{insight.description}</p>
                        {insight.impact && (
                          <p className="text-sm">
                            <span className="font-medium">{t('impact')}:</span> {insight.impact}
                          </p>
                        )}
                        {insight.recommendation && (
                          <p className="text-sm text-blue-600">
                            <span className="font-medium">{t('recommendation')}:</span>{' '}
                            {insight.recommendation}
                          </p>
                        )}
                        <div className="flex items-center gap-4 pt-2 text-sm text-muted-foreground">
                          <span>
                            {t('confidence')}: {formatConfidence(insight.confidence)}
                          </span>
                          <span>{format(new Date(insight.createdAt), 'MMM d, yyyy HH:mm')}</span>
                          {insight.module && (
                            <span>
                              {t('module')}: {insight.module}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/ai-insights/${insight.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      {insight.status === 'NEW' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDismiss(insight.id)}
                          disabled={dismissInsight.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              {t('forecast')}
            </CardTitle>
            <CardDescription>{t('subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/ai-insights/forecast">{t('forecast')}</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              {t('revenue')}
            </CardTitle>
            <CardDescription>{t('subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/ai-insights/revenue">{t('revenue')}</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" />
              {t('customers')}
            </CardTitle>
            <CardDescription>{t('subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/ai-insights/customers">{t('customers')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
