'use client';

import { useTranslations } from 'next-intl';
import { FolderKanban } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { ProjectOverview, formatCurrency } from '@/lib/hooks/use-dashboard';
import { Link } from '@/i18n/routing';

interface ProjectsOverviewProps {
  projects: ProjectOverview[];
}

function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'IN_PROGRESS':
      return 'default';
    case 'COMPLETED':
      return 'secondary';
    case 'ON_HOLD':
      return 'outline';
    case 'CANCELLED':
      return 'destructive';
    default:
      return 'secondary';
  }
}

function getStatusLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case 'IN_PROGRESS':
      return t('status.inProgress');
    case 'COMPLETED':
      return t('status.completed');
    case 'ON_HOLD':
      return t('status.onHold');
    case 'CANCELLED':
      return t('status.cancelled');
    case 'NOT_STARTED':
      return t('status.notStarted');
    default:
      return status;
  }
}

export function ProjectsOverview({ projects }: ProjectsOverviewProps) {
  const t = useTranslations('common.dashboard.projects');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">{t('title')}</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/projects">{t('viewAll')}</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {projects.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>{t('noProjects')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {projects.slice(0, 5).map((project) => (
              <div key={project.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderKanban className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Link
                      href={`/projects/${project.id}`}
                      className="text-sm font-medium truncate hover:underline"
                    >
                      {project.name}
                    </Link>
                    <Badge
                      variant={getStatusVariant(project.status)}
                      className="text-[10px] px-1.5 py-0 shrink-0"
                    >
                      {getStatusLabel(project.status, t)}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {project.hoursLogged.toFixed(1)}
                    {t('hoursAbbr')}
                  </span>
                </div>
                {project.budget > 0 && (
                  <div className="flex items-center gap-2">
                    <Progress
                      value={Math.min(project.budgetUsedPercent, 100)}
                      className={cn(
                        'h-1.5 flex-1',
                        project.budgetUsedPercent > 90 && '[&>div]:bg-red-500',
                        project.budgetUsedPercent > 75 &&
                          project.budgetUsedPercent <= 90 &&
                          '[&>div]:bg-amber-500',
                      )}
                    />
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                      {formatCurrency(project.revenue)} / {formatCurrency(project.budget)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
