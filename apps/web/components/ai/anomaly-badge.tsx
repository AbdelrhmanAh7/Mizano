'use client';

import { AlertTriangle, AlertCircle, Info, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AnomalyType =
  | 'TRANSACTION'
  | 'OVERTIME'
  | 'SPENDING'
  | 'PAYROLL'
  | 'INVENTORY'
  | 'REVENUE';

export interface AnomalyBadgeProps {
  severity: AnomalySeverity;
  type: AnomalyType;
  description: string;
  zScore?: number;
  value?: number;
  expectedValue?: number;
  className?: string;
  showTooltip?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const severityConfig = {
  LOW: {
    icon: Info,
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    iconColor: 'text-blue-600',
    label: 'Low',
  },
  MEDIUM: {
    icon: AlertCircle,
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    iconColor: 'text-yellow-600',
    label: 'Medium',
  },
  HIGH: {
    icon: AlertTriangle,
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    iconColor: 'text-orange-600',
    label: 'High',
  },
  CRITICAL: {
    icon: XCircle,
    color: 'bg-red-100 text-red-800 border-red-200 animate-pulse',
    iconColor: 'text-red-600',
    label: 'Critical',
  },
};

const typeLabels: Record<AnomalyType, string> = {
  TRANSACTION: 'Transaction',
  OVERTIME: 'Overtime',
  SPENDING: 'Spending',
  PAYROLL: 'Payroll',
  INVENTORY: 'Inventory',
  REVENUE: 'Revenue',
};

const sizeConfig = {
  sm: {
    badge: 'h-5 text-xs px-1.5',
    icon: 'h-3 w-3',
  },
  md: {
    badge: 'h-6 text-sm px-2',
    icon: 'h-4 w-4',
  },
  lg: {
    badge: 'h-7 text-sm px-2.5',
    icon: 'h-5 w-5',
  },
};

export function AnomalyBadge({
  severity,
  type,
  description,
  zScore,
  value,
  expectedValue,
  className,
  showTooltip = true,
  size = 'md',
}: AnomalyBadgeProps) {
  const config = severityConfig[severity];
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
    }).format(num);
  };

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex items-center gap-1 font-medium',
        config.color,
        sizeStyles.badge,
        className
      )}
    >
      <Icon className={cn(sizeStyles.icon, config.iconColor)} />
      <span>{config.label}</span>
    </Badge>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-2">
            <div className="font-medium">
              {typeLabels[type]} Anomaly - {config.label} Severity
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
            {zScore !== undefined && (
              <div className="text-xs">
                <span className="font-medium">Z-Score:</span> {zScore.toFixed(2)} (
                {Math.abs(zScore) > 3
                  ? 'Highly unusual'
                  : Math.abs(zScore) > 2
                  ? 'Unusual'
                  : 'Slightly unusual'}
                )
              </div>
            )}
            {value !== undefined && expectedValue !== undefined && (
              <div className="text-xs">
                <span className="font-medium">Value:</span> {formatNumber(value)}{' '}
                <span className="text-muted-foreground">
                  (expected: ~{formatNumber(expectedValue)})
                </span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function AnomalyIndicator({
  hasAnomaly,
  severity,
  className,
}: {
  hasAnomaly: boolean;
  severity?: AnomalySeverity;
  className?: string;
}) {
  if (!hasAnomaly) return null;

  const config = severityConfig[severity || 'MEDIUM'];
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'inline-flex items-center justify-center rounded-full p-1',
              severity === 'CRITICAL' && 'animate-pulse',
              className
            )}
          >
            <Icon className={cn('h-4 w-4', config.iconColor)} />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {config.label} severity anomaly detected. Click for details.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
