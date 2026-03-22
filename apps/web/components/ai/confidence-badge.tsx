'use client';

import { Sparkles, CircleDot, CircleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface ConfidenceBadgeProps {
  confidence: number;
  className?: string;
  showTooltip?: boolean;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const getConfidenceConfig = (confidence: number) => {
  if (confidence >= 0.85) {
    return {
      icon: Sparkles,
      color: 'bg-green-100 text-green-800 border-green-200',
      iconColor: 'text-green-600',
      label: 'High',
      description: 'AI is highly confident in this suggestion',
    };
  }
  if (confidence >= 0.6) {
    return {
      icon: CircleDot,
      color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      iconColor: 'text-yellow-600',
      label: 'Medium',
      description: 'AI has moderate confidence - please review',
    };
  }
  return {
    icon: CircleAlert,
    color: 'bg-red-100 text-red-800 border-red-200',
    iconColor: 'text-red-600',
    label: 'Low',
    description: 'AI has low confidence - manual verification recommended',
  };
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

export function ConfidenceBadge({
  confidence,
  className,
  showTooltip = true,
  showPercentage = true,
  size = 'md',
}: ConfidenceBadgeProps) {
  const config = getConfidenceConfig(confidence);
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;

  const percentageText = `${Math.round(confidence * 100)}%`;

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex items-center gap-1 font-medium',
        config.color,
        sizeStyles.badge,
        className,
      )}
    >
      <Icon className={cn(sizeStyles.icon, config.iconColor)} />
      <span>
        {config.label}
        {showPercentage && <span className="ml-1 opacity-75">({percentageText})</span>}
      </span>
    </Badge>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{badge}</span>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <div className="font-medium">{config.label} Confidence</div>
            <p className="text-sm text-muted-foreground">{config.description}</p>
            <div className="pt-1">
              <ConfidenceBar confidence={confidence} />
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ConfidenceBar({
  confidence,
  className,
  showLabels = false,
}: {
  confidence: number;
  className?: string;
  showLabels?: boolean;
}) {
  const percentage = Math.round(confidence * 100);

  const getBarColor = () => {
    if (confidence >= 0.85) return 'bg-green-500';
    if (confidence >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className={cn('space-y-1', className)}>
      <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
        {/* Threshold markers */}
        <div className="absolute h-full border-l border-gray-300" style={{ left: '60%' }} />
        <div className="absolute h-full border-l border-gray-300" style={{ left: '85%' }} />
        {/* Confidence bar */}
        <div
          className={cn('h-full rounded-full transition-all duration-500', getBarColor())}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabels && (
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0%</span>
          <span>Low</span>
          <span>Medium</span>
          <span>High</span>
          <span>100%</span>
        </div>
      )}
    </div>
  );
}

export function ConfidenceIndicator({
  confidence,
  size = 'md',
}: {
  confidence: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  const config = getConfidenceConfig(confidence);
  const Icon = config.icon;
  const sizeStyles = sizeConfig[size];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center justify-center">
            <Icon className={cn(sizeStyles.icon, config.iconColor)} />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {config.label} confidence: {Math.round(confidence * 100)}%
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
