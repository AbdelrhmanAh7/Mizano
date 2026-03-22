'use client';

import { Loader2, Globe, Code2, Sparkles, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { DeepSearchJob } from '@/lib/hooks/use-deep-search';
import { getStatusLabel } from '@/lib/hooks/use-deep-search';

interface SearchProgressProps {
  job: DeepSearchJob;
}

const statusIcons: Record<string, React.ReactNode> = {
  PENDING: <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />,
  SCRAPING: <Globe className="h-4 w-4 animate-pulse text-blue-500" />,
  ANALYZING: <Code2 className="h-4 w-4 animate-pulse text-yellow-500" />,
  GENERATING: <Sparkles className="h-4 w-4 animate-pulse text-purple-500" />,
  COMPLETED: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  FAILED: <XCircle className="h-4 w-4 text-red-500" />,
};

export function SearchProgress({ job }: SearchProgressProps) {
  const isRunning = !['COMPLETED', 'FAILED'].includes(job.status);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {statusIcons[job.status]}
              <span className="font-medium">{getStatusLabel(job.status)}</span>
            </div>
            <span className="text-muted-foreground">{job.progress}%</span>
          </div>

          <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                job.status === 'FAILED'
                  ? 'bg-red-500'
                  : job.status === 'COMPLETED'
                    ? 'bg-green-500'
                    : 'bg-primary'
              } ${isRunning ? 'animate-pulse' : ''}`}
              style={{ width: `${job.progress}%` }}
            />
          </div>

          {job.progressMessage && (
            <p className="text-sm text-muted-foreground">{job.progressMessage}</p>
          )}

          {job.error && <p className="text-sm text-red-500">{job.error}</p>}

          <div className="flex gap-4 text-xs text-muted-foreground">
            {job.webSourcesScraped > 0 && <span>Web sources: {job.webSourcesScraped}</span>}
            {job.codeFilesAnalyzed > 0 && <span>Code files: {job.codeFilesAnalyzed}</span>}
            {job.suggestionsCount > 0 && <span>Suggestions: {job.suggestionsCount}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
