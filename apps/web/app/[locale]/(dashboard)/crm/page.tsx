'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Users,
  DollarSign,
  ArrowRight,
  Plus,
  UserPlus,
  Target,
  TrendingUp,
  Trophy,
  BarChart3,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useLeads,
  useDeals,
  formatCurrency,
  calculateWeightedValue,
  getLeadSourceLabel,
  getDealStageLabel,
  getDealStageColor,
  type Lead,
  type Deal,
  type LeadSource,
  type DealStage,
} from '@/lib/hooks/use-crm';

export default function CRMPage() {
  const t = useTranslations('crm');

  const { data: leadsData, isLoading: leadsLoading } = useLeads({ limit: 200 });
  const { data: dealsData, isLoading: dealsLoading } = useDeals({ limit: 200 });

  const leads: Lead[] = leadsData?.data || [];
  const deals: Deal[] = dealsData?.data || [];

  const isLoading = leadsLoading || dealsLoading;

  // Lead metrics
  const qualifiedLeads = leads.filter((l) => l.status === 'QUALIFIED').length;
  const newLeads = leads.filter((l) => l.status === 'NEW').length;

  // Deal metrics
  const activeDeals = deals.filter((d) => d.stage !== 'WON' && d.stage !== 'LOST');
  const totalPipelineValue = activeDeals.reduce((sum, d) => sum + (d.expectedAmount || 0), 0);
  const weightedValue = calculateWeightedValue(activeDeals);
  const wonDeals = deals.filter((d) => d.stage === 'WON');
  const closedDeals = deals.filter((d) => d.stage === 'WON' || d.stage === 'LOST');
  const winRate =
    closedDeals.length > 0 ? Math.round((wonDeals.length / closedDeals.length) * 100) : 0;

  // Lead source breakdown
  const leadsBySource: Record<string, number> = {};
  leads.forEach((l) => {
    leadsBySource[l.source] = (leadsBySource[l.source] || 0) + 1;
  });
  const sortedSources = Object.entries(leadsBySource).sort((a, b) => b[1] - a[1]);

  // Deal stage breakdown
  const dealsByStage: Record<string, { count: number; value: number }> = {};
  deals.forEach((d) => {
    if (!dealsByStage[d.stage]) dealsByStage[d.stage] = { count: 0, value: 0 };
    dealsByStage[d.stage].count++;
    dealsByStage[d.stage].value += d.expectedAmount || 0;
  });
  const STAGE_ORDER: DealStage[] = [
    'NEW',
    'MEETING_SCHEDULED',
    'PROPOSAL_SENT',
    'NEGOTIATION',
    'WON',
    'LOST',
  ];

  const modules = [
    {
      title: t('leads.title'),
      description: t('leads.description'),
      icon: Users,
      href: '/crm/leads',
      color: 'bg-blue-500',
      stats: `${leads.length} total`,
    },
    {
      title: t('deals.title'),
      description: t('deals.description'),
      icon: DollarSign,
      href: '/crm/deals',
      color: 'bg-green-500',
      stats: `${activeDeals.length} active`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/crm/leads/new">
            <UserPlus className="mr-2 h-4 w-4" />
            {t('hub.newLead')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/crm/deals/new">
            <Plus className="mr-2 h-4 w-4" />
            {t('hub.newDeal')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/crm/deals">
            <BarChart3 className="mr-2 h-4 w-4" />
            {t('hub.viewPipeline')}
          </Link>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('hub.stats.totalLeads')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{leads.length}</div>
            )}
            <p className="text-xs text-muted-foreground">
              {!isLoading
                ? t('hub.stats.totalLeadsDesc', { qualified: qualifiedLeads, new: newLeads })
                : '\u00A0'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('hub.stats.activeDeals')}</CardTitle>
            <Target className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-blue-600">{activeDeals.length}</div>
            )}
            <p className="text-xs text-muted-foreground">{t('hub.stats.activeDealsDesc')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('hub.stats.pipelineValue')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(totalPipelineValue)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {!isLoading
                ? t('hub.stats.pipelineValueDesc', { weighted: formatCurrency(weightedValue) })
                : '\u00A0'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('hub.stats.winRate')}</CardTitle>
            <Trophy className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-amber-600">{winRate}%</div>
            )}
            <p className="text-xs text-muted-foreground">{t('hub.stats.winRateDesc')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Module Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {modules.map((module) => (
          <Card key={module.href} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${module.color}`}>
                  <module.icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">{module.title}</CardTitle>
                  {isLoading ? (
                    <Skeleton className="h-4 w-16 mt-1" />
                  ) : (
                    <p className="text-sm text-muted-foreground">{module.stats}</p>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">{module.description}</p>
              <Button asChild variant="outline" className="w-full group">
                <Link href={module.href}>
                  Open {module.title}
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Lead Sources & Deal Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Leads by Source */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('hub.leadsBySource')}</CardTitle>
          </CardHeader>
          <CardContent>
            {leadsLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : sortedSources.length === 0 ? (
              <div className="text-center py-8">
                <Users className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm">{t('hub.noLeads')}</p>
                <Button asChild size="sm" className="mt-3">
                  <Link href="/crm/leads/new">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('hub.newLead')}
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedSources.map(([source, count]) => {
                  const percentage = leads.length ? Math.round((count / leads.length) * 100) : 0;
                  return (
                    <div key={source} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">
                          {getLeadSourceLabel(source as LeadSource)}
                        </span>
                        <span className="text-muted-foreground">
                          {count} ({percentage}%)
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deals by Stage */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{t('hub.dealsByStage')}</CardTitle>
            {deals.length > 0 && (
              <Button asChild variant="outline" size="sm">
                <Link href="/crm/deals">{t('hub.viewPipeline')}</Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {dealsLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : Object.keys(dealsByStage).length === 0 ? (
              <div className="text-center py-8">
                <DollarSign className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm">{t('hub.noDeals')}</p>
                <Button asChild size="sm" className="mt-3">
                  <Link href="/crm/deals/new">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('hub.newDeal')}
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {STAGE_ORDER.filter((stage) => dealsByStage[stage]).map((stage) => {
                  const data = dealsByStage[stage];
                  return (
                    <div
                      key={stage}
                      className="flex items-center justify-between py-2 border-b last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <Badge className={getDealStageColor(stage)}>
                          {getDealStageLabel(stage)}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <span className="text-sm text-muted-foreground">
                          {t('hub.dealsInStage', { count: data.count })}
                        </span>
                        <p className="text-sm font-mono font-semibold">
                          {formatCurrency(data.value)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
