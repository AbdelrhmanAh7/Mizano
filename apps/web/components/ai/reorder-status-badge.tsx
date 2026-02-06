'use client';

import { Package, AlertTriangle, XCircle, Archive } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type ReorderStatus = 'OK' | 'LOW_STOCK' | 'CRITICAL' | 'DEAD_STOCK';

export interface ReorderStatusBadgeProps {
  status: ReorderStatus;
  currentStock?: number;
  reorderPoint?: number;
  safetyStock?: number;
  daysSinceLastSale?: number;
  className?: string;
  showTooltip?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const statusConfig = {
  OK: {
    icon: Package,
    color: 'bg-green-100 text-green-800 border-green-200',
    iconColor: 'text-green-600',
    label: 'In Stock',
    description: 'Stock levels are healthy',
  },
  LOW_STOCK: {
    icon: AlertTriangle,
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    iconColor: 'text-yellow-600',
    label: 'Low Stock',
    description: 'Stock is below reorder point - consider reordering soon',
  },
  CRITICAL: {
    icon: XCircle,
    color: 'bg-red-100 text-red-800 border-red-200',
    iconColor: 'text-red-600',
    label: 'Critical',
    description: 'Stock is critically low - immediate reorder needed',
  },
  DEAD_STOCK: {
    icon: Archive,
    color: 'bg-gray-100 text-gray-800 border-gray-200',
    iconColor: 'text-gray-600',
    label: 'Dead Stock',
    description: 'No sales in extended period - consider clearance',
  },
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

export function ReorderStatusBadge({
  status,
  currentStock,
  reorderPoint,
  safetyStock,
  daysSinceLastSale,
  className,
  showTooltip = true,
  size = 'md',
}: ReorderStatusBadgeProps) {
  const config = statusConfig[status];
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;

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
            <div className="font-medium">{config.label}</div>
            <p className="text-sm text-muted-foreground">{config.description}</p>

            {currentStock !== undefined && reorderPoint !== undefined && (
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Current Stock:</span>
                  <span className="font-medium">{currentStock}</span>
                </div>
                <div className="flex justify-between">
                  <span>Reorder Point:</span>
                  <span className="font-medium">{reorderPoint}</span>
                </div>
                {safetyStock !== undefined && (
                  <div className="flex justify-between">
                    <span>Safety Stock:</span>
                    <span className="font-medium">{safetyStock}</span>
                  </div>
                )}
                {daysSinceLastSale !== undefined && (
                  <div className="flex justify-between">
                    <span>Days Since Last Sale:</span>
                    <span className="font-medium">{daysSinceLastSale}</span>
                  </div>
                )}
              </div>
            )}

            {currentStock !== undefined && reorderPoint !== undefined && (
              <div className="pt-2 border-t">
                <StockLevelBar
                  current={currentStock}
                  reorderPoint={reorderPoint}
                  safetyStock={safetyStock || 0}
                />
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function StockLevelBar({
  current,
  reorderPoint,
  safetyStock,
}: {
  current: number;
  reorderPoint: number;
  safetyStock: number;
}) {
  // Calculate max value for scale (150% of reorder point or current, whichever is higher)
  const maxValue = Math.max(reorderPoint * 1.5, current * 1.1);
  const currentPercent = Math.min((current / maxValue) * 100, 100);
  const reorderPercent = (reorderPoint / maxValue) * 100;
  const safetyPercent = (safetyStock / maxValue) * 100;

  const getBarColor = () => {
    if (current <= safetyStock) return 'bg-red-500';
    if (current <= reorderPoint) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="space-y-1">
      <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
        {/* Safety stock marker */}
        <div
          className="absolute h-full border-l-2 border-red-400 border-dashed z-10"
          style={{ left: `${safetyPercent}%` }}
        />
        {/* Reorder point marker */}
        <div
          className="absolute h-full border-l-2 border-yellow-500 z-10"
          style={{ left: `${reorderPercent}%` }}
        />
        {/* Current stock bar */}
        <div
          className={cn('h-full rounded-full transition-all', getBarColor())}
          style={{ width: `${currentPercent}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span>Safety: {safetyStock}</span>
        <span>Reorder: {reorderPoint}</span>
      </div>
    </div>
  );
}

export function ReorderAlert({
  itemName,
  status,
  currentStock,
  reorderPoint,
  className,
}: {
  itemName: string;
  status: ReorderStatus;
  currentStock: number;
  reorderPoint: number;
  className?: string;
}) {
  if (status === 'OK') return null;

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3',
        status === 'CRITICAL'
          ? 'border-red-200 bg-red-50'
          : status === 'LOW_STOCK'
          ? 'border-yellow-200 bg-yellow-50'
          : 'border-gray-200 bg-gray-50',
        className
      )}
    >
      <Icon className={cn('h-5 w-5 mt-0.5', config.iconColor)} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{itemName}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {config.description}
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs">
          <span>
            Current: <strong>{currentStock}</strong>
          </span>
          <span>
            Reorder Point: <strong>{reorderPoint}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
