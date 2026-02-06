'use client';

import { Check, Eye, FileText, Receipt, CreditCard, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfidenceBadge } from './confidence-badge';
import { cn } from '@/lib/utils';

export type MatchEntityType = 'invoice' | 'bill' | 'expense' | 'payment';

export interface MatchScoreBreakdown {
  amountScore: number;
  referenceScore: number;
  nameScore: number;
  dateScore: number;
}

export interface ReconciliationMatch {
  entityType: MatchEntityType;
  entityId: string;
  entity: {
    id: string;
    invoiceNumber?: string;
    billNumber?: string;
    paymentNumber?: string;
    reference?: string;
    amount?: number;
    grandTotal?: number;
    date: string;
    customer?: { name: string };
    vendor?: { name: string };
  };
  totalScore: number;
  breakdown: MatchScoreBreakdown;
  confidence: 'high' | 'medium' | 'low';
  matchReasons: string[];
}

export interface ReconciliationMatchCardProps {
  match: ReconciliationMatch;
  transactionAmount: number;
  onConfirm?: (entityType: MatchEntityType, entityId: string) => void;
  onView?: (entityType: MatchEntityType, entityId: string) => void;
  isLoading?: boolean;
  className?: string;
}

const entityTypeConfig = {
  invoice: {
    icon: FileText,
    label: 'Invoice',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  bill: {
    icon: Receipt,
    label: 'Bill',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
  expense: {
    icon: CreditCard,
    label: 'Expense',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  payment: {
    icon: Wallet,
    label: 'Payment',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
};

const confidenceColors = {
  high: 'border-green-200 bg-green-50/50',
  medium: 'border-yellow-200 bg-yellow-50/50',
  low: 'border-red-200 bg-red-50/50',
};

export function ReconciliationMatchCard({
  match,
  transactionAmount,
  onConfirm,
  onView,
  isLoading,
  className,
}: ReconciliationMatchCardProps) {
  const config = entityTypeConfig[match.entityType];
  const Icon = config.icon;

  const getEntityReference = () => {
    const { entity } = match;
    return (
      entity.invoiceNumber ||
      entity.billNumber ||
      entity.paymentNumber ||
      entity.reference ||
      match.entityId.slice(0, 8)
    );
  };

  const getEntityAmount = () => {
    const { entity } = match;
    return entity.grandTotal || entity.amount || 0;
  };

  const getEntityName = () => {
    const { entity } = match;
    return entity.customer?.name || entity.vendor?.name || 'Unknown';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getAmountDiff = () => {
    const entityAmount = getEntityAmount();
    const diff = Math.abs(transactionAmount - entityAmount);
    if (diff < 0.01) return null;
    return diff;
  };

  return (
    <Card
      className={cn(
        'transition-all hover:shadow-md',
        confidenceColors[match.confidence],
        className
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Entity Type Icon */}
          <div
            className={cn(
              'flex items-center justify-center rounded-lg p-2',
              config.bgColor
            )}
          >
            <Icon className={cn('h-5 w-5', config.color)} />
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{getEntityReference()}</span>
                  <Badge variant="secondary" className="text-xs">
                    {config.label}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  {getEntityName()}
                </div>
              </div>
              <ConfidenceBadge
                confidence={match.totalScore}
                size="sm"
                showPercentage={true}
              />
            </div>

            {/* Amount and Date */}
            <div className="flex items-center gap-4 mt-2 text-sm">
              <div>
                <span className="text-muted-foreground">Amount: </span>
                <span className="font-medium">{formatCurrency(getEntityAmount())}</span>
                {getAmountDiff() && (
                  <span className="text-xs text-muted-foreground ml-1">
                    (diff: {formatCurrency(getAmountDiff()!)})
                  </span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Date: </span>
                <span>{formatDate(match.entity.date)}</span>
              </div>
            </div>

            {/* Match Reasons */}
            {match.matchReasons.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {match.matchReasons.map((reason, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {reason}
                  </Badge>
                ))}
              </div>
            )}

            {/* Score Breakdown */}
            <div className="mt-3 pt-3 border-t">
              <ScoreBreakdown breakdown={match.breakdown} />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onView?.(match.entityType, match.entityId)}
            disabled={isLoading}
          >
            <Eye className="h-4 w-4 mr-1" />
            View
          </Button>
          <Button
            size="sm"
            onClick={() => onConfirm?.(match.entityType, match.entityId)}
            disabled={isLoading}
            className={
              match.confidence === 'high'
                ? 'bg-green-600 hover:bg-green-700'
                : undefined
            }
          >
            <Check className="h-4 w-4 mr-1" />
            {match.confidence === 'high' ? 'Quick Match' : 'Confirm Match'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreBreakdown({ breakdown }: { breakdown: MatchScoreBreakdown }) {
  const scores = [
    { label: 'Amount', score: breakdown.amountScore, weight: 40 },
    { label: 'Reference', score: breakdown.referenceScore, weight: 30 },
    { label: 'Name', score: breakdown.nameScore, weight: 20 },
    { label: 'Date', score: breakdown.dateScore, weight: 10 },
  ];

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">Match Score Breakdown</div>
      <div className="grid grid-cols-4 gap-2">
        {scores.map(({ label, score, weight }) => (
          <div key={label} className="text-center">
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full',
                  score >= 0.7
                    ? 'bg-green-500'
                    : score >= 0.3
                    ? 'bg-yellow-500'
                    : 'bg-gray-300'
                )}
                style={{ width: `${score * 100}%` }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {label} ({weight}%)
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReconciliationMatchList({
  matches,
  transactionAmount,
  onConfirm,
  onView,
  isLoading,
  emptyMessage = 'No matches found',
}: {
  matches: ReconciliationMatch[];
  transactionAmount: number;
  onConfirm?: (entityType: MatchEntityType, entityId: string) => void;
  onView?: (entityType: MatchEntityType, entityId: string) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}) {
  if (matches.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {matches.map((match) => (
        <ReconciliationMatchCard
          key={`${match.entityType}-${match.entityId}`}
          match={match}
          transactionAmount={transactionAmount}
          onConfirm={onConfirm}
          onView={onView}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
}
