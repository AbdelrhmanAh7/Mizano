'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface BulkJobProgress {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  processed: number;
  total: number;
  progress: number;
  failures?: Array<{ id: string; reason: string }>;
}

interface BulkProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The job ID returned by the bulk operation endpoint */
  jobId: string | null;
  /** Action label for the dialog title (e.g. "Paying", "Deleting") */
  actionLabel: string;
  /** Entity type label (e.g. "invoices", "bills") */
  itemType: string;
  /** Called when the operation completes */
  onComplete?: (result: BulkJobProgress) => void;
  /** Base API URL — defaults to NEXT_PUBLIC_API_URL */
  apiBaseUrl?: string;
}

export function BulkProgressDialog({
  open,
  onOpenChange,
  jobId,
  actionLabel,
  itemType,
  onComplete,
  apiBaseUrl,
}: BulkProgressDialogProps) {
  const [progress, setProgress] = useState<BulkJobProgress | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const baseUrl = apiBaseUrl || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6001/api';

  useEffect(() => {
    if (!open || !jobId) return;

    // Reset state
    setProgress(null);

    // Try SSE first, fall back to polling
    const sseUrl = `${baseUrl}/bulk-operations/${jobId}/progress`;
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    let fallbackToPolling = false;

    es.addEventListener('progress', (event) => {
      try {
        const data: BulkJobProgress = JSON.parse(event.data);
        setProgress(data);

        if (data.status === 'completed' || data.status === 'failed') {
          es.close();
          onComplete?.(data);
        }
      } catch {
        // ignore parse errors
      }
    });

    es.onerror = () => {
      es.close();
      // Fall back to polling
      if (!fallbackToPolling) {
        fallbackToPolling = true;
        startPolling(jobId);
      }
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jobId]);

  const startPolling = (pollJobId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${baseUrl}/bulk-operations/${pollJobId}/status`);
        if (!res.ok) {
          clearInterval(interval);
          return;
        }
        const data: BulkJobProgress = await res.json();
        setProgress(data);

        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(interval);
          onComplete?.(data);
        }
      } catch {
        clearInterval(interval);
      }
    }, 500);

    // Cleanup on unmount
    return () => clearInterval(interval);
  };

  const isRunning = !progress || progress.status === 'pending' || progress.status === 'running';
  const isCompleted = progress?.status === 'completed';
  const isFailed = progress?.status === 'failed';
  const hasFailures = (progress?.failures?.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={isRunning ? undefined : onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => isRunning && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isRunning && <Loader2 className="h-5 w-5 animate-spin text-blue-500" />}
            {isCompleted && !hasFailures && <CheckCircle2 className="h-5 w-5 text-green-500" />}
            {isCompleted && hasFailures && <AlertCircle className="h-5 w-5 text-yellow-500" />}
            {isFailed && <XCircle className="h-5 w-5 text-red-500" />}
            {isRunning
              ? `${actionLabel} ${itemType}...`
              : isCompleted
                ? `${actionLabel} Complete`
                : `${actionLabel} Failed`}
          </DialogTitle>
          <DialogDescription>
            {isRunning
              ? `Processing ${progress?.total ?? 0} ${itemType}. Please wait...`
              : isCompleted && !hasFailures
                ? `Successfully processed ${progress?.processed ?? 0} ${itemType}.`
                : isCompleted && hasFailures
                  ? `Processed ${(progress?.processed ?? 0) - (progress?.failures?.length ?? 0)} of ${progress?.total ?? 0} ${itemType}. Some items had errors.`
                  : `Failed to process ${itemType}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Progress bar */}
          <div className="space-y-2">
            <Progress value={progress?.progress ?? 0} className="h-3" />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>
                {progress?.processed ?? 0} / {progress?.total ?? 0} processed
              </span>
              <span>{progress?.progress ?? 0}%</span>
            </div>
          </div>

          {/* Failures list */}
          {hasFailures && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900 dark:bg-yellow-950">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  {progress?.failures?.length} item
                  {(progress?.failures?.length ?? 0) > 1 ? 's' : ''} failed
                </span>
              </div>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {progress?.failures?.slice(0, 10).map((failure, idx) => (
                  <li key={idx} className="text-xs text-yellow-700 dark:text-yellow-300 truncate">
                    {failure.reason}
                  </li>
                ))}
                {(progress?.failures?.length ?? 0) > 10 && (
                  <li className="text-xs text-yellow-600 dark:text-yellow-400 italic">
                    ...and {(progress?.failures?.length ?? 0) - 10} more
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            disabled={isRunning}
            variant={isFailed ? 'destructive' : 'default'}
          >
            {isRunning ? 'Processing...' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
