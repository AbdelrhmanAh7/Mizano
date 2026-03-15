'use client';

import { useEffect, useState } from 'react';
import { Square, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useActiveTimer, useStopTimer, type TimesheetEntry } from '@/lib/hooks/use-projects';

function formatElapsed(startTime: string): string {
  const start = new Date(startTime).getTime();
  const now = Date.now();
  const diffSec = Math.floor((now - start) / 1000);
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function RunningTimerWidget() {
  const { data: timer } = useActiveTimer();
  const stopTimer = useStopTimer();
  const [elapsed, setElapsed] = useState('00:00:00');

  const entry = timer as (TimesheetEntry & { startTime?: string }) | null | undefined;

  useEffect(() => {
    if (!entry?.startTime) return;
    setElapsed(formatElapsed(entry.startTime));
    const interval = setInterval(() => {
      setElapsed(formatElapsed(entry.startTime!));
    }, 1000);
    return () => clearInterval(interval);
  }, [entry?.startTime]);

  if (!entry) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200">
      <Clock className="h-3.5 w-3.5 text-green-600 animate-pulse" />
      <span className="text-xs font-mono font-medium text-green-700">{elapsed}</span>
      {entry.task?.project?.name && (
        <Badge variant="outline" className="text-xs h-5 bg-white border-green-200 text-green-700">
          {entry.task.project.name}
        </Badge>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-5 w-5 text-red-500 hover:text-red-700 hover:bg-red-50"
        onClick={() => void stopTimer.mutateAsync(entry.id)}
        disabled={stopTimer.isPending}
        title="Stop timer"
      >
        <Square className="h-3 w-3 fill-current" />
      </Button>
    </div>
  );
}
