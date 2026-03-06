'use client';

import { CheckCircle2, Clock, Database, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useVendorOcrHistory } from '@/lib/hooks/use-ocr-training';
import { cn } from '@/lib/utils';

interface VendorTrainingHistoryProps {
  vendorId: string;
  className?: string;
}

const ACTIVATION_THRESHOLD = 3;

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function VendorTrainingHistory({ vendorId, className }: VendorTrainingHistoryProps) {
  const { data, isLoading } = useVendorOcrHistory(vendorId);
  const history = data?.data;

  if (!vendorId) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">Select a vendor to view training history</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground animate-pulse">Loading history...</p>
        </CardContent>
      </Card>
    );
  }

  if (!history) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No training history found</p>
        </CardContent>
      </Card>
    );
  }

  const sampleCount = history.layout?.sampleCount || 0;
  const isActive = sampleCount >= ACTIVATION_THRESHOLD;
  const progressPercent = Math.min(100, (sampleCount / ACTIVATION_THRESHOLD) * 100);

  // Extract learned field names from layout
  const learnedFields = history.layout?.fieldPositions
    ? Object.entries(history.layout.fieldPositions)
        .filter(([, v]: [string, { learned?: boolean }]) => v?.learned)
        .map(([k]) => k)
    : [];

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="truncate">{history.vendorName}</span>
          {isActive ? (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Active
            </Badge>
          ) : (
            <Badge variant="secondary">
              {sampleCount}/{ACTIVATION_THRESHOLD} samples
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress to activation */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Training Progress</span>
            <span className="font-medium">
              {sampleCount} / {ACTIVATION_THRESHOLD}
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          {!isActive && (
            <p className="text-xs text-muted-foreground">
              {ACTIVATION_THRESHOLD - sampleCount} more correction(s) needed to activate layout
              learning
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Database className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium">{history.trainingDataCount}</p>
              <p className="text-xs text-muted-foreground">Training records</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium">{history.corrections.length}</p>
              <p className="text-xs text-muted-foreground">Corrections</p>
            </div>
          </div>
        </div>

        {/* Learned fields */}
        {learnedFields.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Learned Fields</p>
            <div className="flex flex-wrap gap-1.5">
              {learnedFields.map((field) => (
                <Badge key={field} variant="outline" className="text-xs capitalize">
                  {field.replace(/([A-Z])/g, ' $1').trim()}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Last used */}
        {history.layout?.lastUsedAt && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Last trained: {formatRelativeTime(history.layout.lastUsedAt)}
          </div>
        )}

        <Separator />

        {/* Recent corrections */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Recent Corrections</p>
          {history.corrections.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No corrections yet</p>
          ) : (
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {history.corrections.map(
                  (correction: {
                    id: string;
                    userAnswer: string | Record<string, unknown>;
                    userAction: string;
                    createdAt: string;
                  }) => {
                    let correctedFields: Record<string, unknown> = {};
                    try {
                      correctedFields =
                        typeof correction.userAnswer === 'string'
                          ? JSON.parse(correction.userAnswer)
                          : correction.userAnswer || {};
                    } catch {
                      // ignore
                    }

                    return (
                      <div key={correction.id} className="border rounded-md p-2 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs',
                              correction.userAction === 'CORRECTED'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-green-50 text-green-700 border-green-200',
                            )}
                          >
                            {correction.userAction}
                          </Badge>
                          <span className="text-muted-foreground">
                            {formatRelativeTime(correction.createdAt)}
                          </span>
                        </div>
                        {Object.keys(correctedFields).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(correctedFields).map(([key, val]) => (
                              <span
                                key={key}
                                className="text-muted-foreground bg-muted px-1 rounded"
                              >
                                {key}: {String(val).slice(0, 20)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  },
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
