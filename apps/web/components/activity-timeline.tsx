'use client';

import { useQuery } from '@tanstack/react-query';
import { auditLogsApi } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  Send,
  Check,
  XCircle,
  RotateCcw,
  Clock,
  FileText,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';

// ----- Types -----

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  user?: {
    id: string;
    name?: string;
    email?: string;
  };
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export interface ActivityTimelineProps {
  entityType: string;
  entityId: string;
  /** Title shown in the card header. Defaults to "Activity" */
  title?: string;
  /** Max height of the scrollable area in pixels. Defaults to 400 */
  maxHeight?: number;
  /** CSS class applied to the outer wrapper */
  className?: string;
}

// ----- Action Metadata -----

const ACTION_CONFIG: Record<string, { icon: typeof Plus; label: string; color: string }> = {
  CREATE: { icon: Plus, label: 'Created', color: 'text-green-600 bg-green-100' },
  UPDATE: { icon: Pencil, label: 'Updated', color: 'text-blue-600 bg-blue-100' },
  DELETE: { icon: Trash2, label: 'Deleted', color: 'text-red-600 bg-red-100' },
  VIEW: { icon: Eye, label: 'Viewed', color: 'text-gray-600 bg-gray-100' },
  SEND: { icon: Send, label: 'Sent', color: 'text-purple-600 bg-purple-100' },
  APPROVE: { icon: Check, label: 'Approved', color: 'text-green-600 bg-green-100' },
  REJECT: { icon: XCircle, label: 'Rejected', color: 'text-red-600 bg-red-100' },
  VOID: { icon: XCircle, label: 'Voided', color: 'text-orange-600 bg-orange-100' },
  RESTORE: { icon: RotateCcw, label: 'Restored', color: 'text-teal-600 bg-teal-100' },
  POST: { icon: Check, label: 'Posted', color: 'text-emerald-600 bg-emerald-100' },
  CONVERT: { icon: FileText, label: 'Converted', color: 'text-indigo-600 bg-indigo-100' },
};

const DEFAULT_ACTION = { icon: Clock, label: 'Action', color: 'text-gray-600 bg-gray-100' };

function getActionConfig(action: string) {
  return ACTION_CONFIG[action.toUpperCase()] || { ...DEFAULT_ACTION, label: action };
}

// ----- Change Diff -----

function ChangeDiff({ changes }: { changes: Record<string, { old: unknown; new: unknown }> }) {
  const entries = Object.entries(changes).slice(0, 8);
  if (entries.length === 0) return null;

  return (
    <div className="mt-2 space-y-1 text-xs">
      {entries.map(([field, { old: oldVal, new: newVal }]) => (
        <div key={field} className="flex items-start gap-1">
          <span className="font-medium text-muted-foreground min-w-[80px] capitalize">
            {field.replace(/([A-Z])/g, ' $1').trim()}:
          </span>
          <span className="text-red-500 line-through mr-1">
            {oldVal != null ? String(oldVal) : 'empty'}
          </span>
          <span className="text-green-600 font-medium">
            {newVal != null ? String(newVal) : 'empty'}
          </span>
        </div>
      ))}
      {Object.keys(changes).length > 8 && (
        <span className="text-muted-foreground italic">
          +{Object.keys(changes).length - 8} more changes
        </span>
      )}
    </div>
  );
}

// ----- Timeline Item -----

function TimelineItem({ entry, isLast }: { entry: AuditLogEntry; isLast: boolean }) {
  const config = getActionConfig(entry.action);
  const Icon = config.icon;
  const userName = entry.user?.name || entry.user?.email || 'System';

  return (
    <div className="flex gap-3 relative">
      {/* Vertical line */}
      {!isLast && (
        <div className="absolute left-[15px] top-[32px] bottom-0 w-px bg-border" />
      )}

      {/* Icon circle */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center z-10',
          config.color,
        )}
      >
        <Icon className="w-4 h-4" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-6">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-sm font-medium">{userName}</span>
            <span className="text-sm text-muted-foreground ml-1">
              {config.label.toLowerCase()}d this {entry.entityType.toLowerCase().replace(/_/g, ' ')}
            </span>
          </div>
          <time className="text-xs text-muted-foreground whitespace-nowrap" title={entry.createdAt}>
            {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
          </time>
        </div>

        {/* Change diff */}
        {entry.changes && Object.keys(entry.changes).length > 0 && (
          <ChangeDiff changes={entry.changes} />
        )}
      </div>
    </div>
  );
}

// ----- Loading Skeleton -----

function TimelineSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ----- Main Component -----

export function ActivityTimeline({
  entityType,
  entityId,
  title = 'Activity',
  maxHeight = 400,
  className,
}: ActivityTimelineProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs', entityType, entityId],
    queryFn: async () => {
      const res = await auditLogsApi.getByEntity(entityType, entityId, {
        limit: 50,
        orderBy: 'createdAt',
        order: 'desc',
      });
      const payload = res.data?.data ?? res.data;
      return Array.isArray(payload) ? (payload as AuditLogEntry[]) : [];
    },
    enabled: !!entityType && !!entityId,
  });

  const entries = data || [];

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <TimelineSkeleton />
        ) : isError ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Failed to load activity history.
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No activity recorded yet.
          </p>
        ) : (
          <ScrollArea style={{ maxHeight }} className="pr-2">
            <div className="space-y-0">
              {entries.map((entry, idx) => (
                <TimelineItem
                  key={entry.id}
                  entry={entry}
                  isLast={idx === entries.length - 1}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
