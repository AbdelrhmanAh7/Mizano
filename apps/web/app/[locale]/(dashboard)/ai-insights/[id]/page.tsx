'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  CheckCircle2,
  X,
  ExternalLink,
  AlertTriangle,
  TrendingUp,
  Lightbulb,
  BarChart3,
  Bell,
  Target,
  Brain,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useTranslations } from 'next-intl';
import {
  useAIInsight,
  useDismissInsight,
  useActionInsight,
  getInsightTypeLabel,
  getInsightTypeColor,
  getInsightPriorityLabel,
  getInsightPriorityColor,
  InsightType,
} from '@/lib/hooks/use-ai';

const insightIcons: Record<InsightType, React.ReactNode> = {
  ANOMALY: <AlertTriangle className="h-6 w-6" />,
  TREND: <TrendingUp className="h-6 w-6" />,
  RECOMMENDATION: <Lightbulb className="h-6 w-6" />,
  FORECAST: <BarChart3 className="h-6 w-6" />,
  ALERT: <Bell className="h-6 w-6" />,
  OPPORTUNITY: <Target className="h-6 w-6" />,
};

export default function InsightDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useTranslations('ai.insights.detail');
  const tInsights = useTranslations('ai.insights');
  const { id } = use(params);
  const router = useRouter();
  const { data: insight, isLoading } = useAIInsight(id);
  const dismissInsight = useDismissInsight();
  const actionInsight = useActionInsight();

  const handleDismiss = async () => {
    await dismissInsight.mutateAsync(id);
    router.push('/ai-insights');
  };

  const handleAction = async (action: string) => {
    await actionInsight.mutateAsync({ id, action });
    router.push('/ai-insights');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!insight) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">{t('notFound')}</h2>
        <Button asChild className="mt-4">
          <Link href="/ai-insights">{t('backToInsights')}</Link>
        </Button>
      </div>
    );
  }

  const confidencePercent = Math.round(insight.confidence * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/ai-insights">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${getInsightTypeColor(insight.type).split(' ')[0]}`}>
              {insightIcons[insight.type as InsightType]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{insight.title}</h1>
                <Badge variant="outline" className={getInsightTypeColor(insight.type)}>
                  {getInsightTypeLabel(insight.type)}
                </Badge>
                <Badge variant="outline" className={getInsightPriorityColor(insight.priority)}>
                  {getInsightPriorityLabel(insight.priority)}
                </Badge>
              </div>
              <p className="text-muted-foreground">
                Generated {format(new Date(insight.createdAt), 'MMMM d, yyyy at HH:mm')}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {insight.status === 'NEW' && (
            <>
              <Button variant="outline" onClick={handleDismiss}>
                <X className="mr-2 h-4 w-4" />
                {t('dismiss')}
              </Button>
              <Button onClick={() => handleAction('acknowledge')}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {t('acknowledge')}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Details */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('description')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg">{insight.description}</p>
            </CardContent>
          </Card>

          {insight.impact && (
            <Card>
              <CardHeader>
                <CardTitle className="text-red-600 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  {tInsights('impact')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p>{insight.impact}</p>
              </CardContent>
            </Card>
          )}

          {insight.recommendation && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-blue-800 flex items-center gap-2">
                  <Lightbulb className="h-5 w-5" />
                  {tInsights('recommendation')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-blue-800">{insight.recommendation}</p>
                {insight.entityType && insight.entityId && (
                  <Button variant="outline" className="mt-4" asChild>
                    <Link href={`/${insight.entityType}/${insight.entityId}`}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {tInsights('viewRelated', { entityType: insight.entityType })}
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {insight.data && (
            <Card>
              <CardHeader>
                <CardTitle>{t('supportingData')}</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                  {JSON.stringify(insight.data, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                {t('aiConfidence')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{t('confidenceLevel')}</span>
                  <span className="font-mono font-bold">{confidencePercent}%</span>
                </div>
                <Progress value={confidencePercent} className="h-3" />
                <p className="text-xs text-muted-foreground">
                  {confidencePercent >= 90
                    ? t('confidenceVeryHigh')
                    : confidencePercent >= 70
                      ? t('confidenceGood')
                      : confidencePercent >= 50
                        ? t('confidenceModerate')
                        : t('confidenceLow')}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('details')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">{t('status')}</p>
                <p className="font-medium">{insight.status}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('type')}</p>
                <p className="font-medium">{getInsightTypeLabel(insight.type)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('priority')}</p>
                <p className="font-medium">{getInsightPriorityLabel(insight.priority)}</p>
              </div>
              {insight.module && (
                <div>
                  <p className="text-sm text-muted-foreground">{tInsights('module')}</p>
                  <p className="font-medium">{insight.module}</p>
                </div>
              )}
              {insight.expiresAt && (
                <div>
                  <p className="text-sm text-muted-foreground">{t('expires')}</p>
                  <p className="font-medium">
                    {format(new Date(insight.expiresAt), 'MMM d, yyyy')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          {insight.status === 'NEW' && (
            <Card>
              <CardHeader>
                <CardTitle>{t('actions')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleAction('investigate')}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t('investigate')}
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleAction('fix')}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {t('markAsFixed')}
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start text-muted-foreground"
                  onClick={handleDismiss}
                >
                  <X className="mr-2 h-4 w-4" />
                  {t('dismissFalsePositive')}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
