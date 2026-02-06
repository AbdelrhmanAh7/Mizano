'use client';

import { useState } from 'react';
import { Check, X, Edit2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSubmitAiFeedback } from '@/lib/hooks/use-ai';
import { cn } from '@/lib/utils';

export type AiFeature =
  | 'CATEGORIZATION'
  | 'RECONCILIATION'
  | 'OCR_LAYOUT'
  | 'DEMAND_FORECAST'
  | 'LEAD_SCORING'
  | 'ANOMALY'
  | 'REORDER'
  | 'PAYMENT_PREDICTION';

export interface AiFeedbackWidgetProps {
  feature: AiFeature;
  predictionId?: string;
  suggestion: string | Record<string, any>;
  confidence: number;
  inputData: Record<string, any>;
  onAccept?: (suggestion: any) => void;
  onReject?: () => void;
  onCorrect?: (correctedValue: string) => void;
  className?: string;
  showConfidence?: boolean;
  correctionLabel?: string;
  correctionPlaceholder?: string;
}

export function AiFeedbackWidget({
  feature,
  predictionId,
  suggestion,
  confidence,
  inputData,
  onAccept,
  onReject,
  onCorrect,
  className,
  showConfidence = true,
  correctionLabel = 'Correct Value',
  correctionPlaceholder = 'Enter the correct value...',
}: AiFeedbackWidgetProps) {
  const [isCorrectDialogOpen, setIsCorrectDialogOpen] = useState(false);
  const [correctedValue, setCorrectedValue] = useState('');
  const { mutate: submitFeedback, isPending } = useSubmitAiFeedback();

  const displaySuggestion =
    typeof suggestion === 'string' ? suggestion : JSON.stringify(suggestion);

  const getConfidenceColor = () => {
    if (confidence >= 0.85) return 'bg-green-100 text-green-800';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getConfidenceLabel = () => {
    if (confidence >= 0.85) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };

  const handleAccept = () => {
    submitFeedback(
      {
        feature,
        predictionId,
        aiSuggestion: typeof suggestion === 'string' ? { value: suggestion } : suggestion,
        userAction: 'ACCEPTED',
        inputData,
      },
      {
        onSuccess: () => {
          onAccept?.(suggestion);
        },
      }
    );
  };

  const handleReject = () => {
    submitFeedback(
      {
        feature,
        predictionId,
        aiSuggestion: typeof suggestion === 'string' ? { value: suggestion } : suggestion,
        userAction: 'REJECTED',
        inputData,
      },
      {
        onSuccess: () => {
          onReject?.();
        },
      }
    );
  };

  const handleCorrect = () => {
    if (!correctedValue.trim()) return;

    submitFeedback(
      {
        feature,
        predictionId,
        aiSuggestion: typeof suggestion === 'string' ? { value: suggestion } : suggestion,
        userAction: 'CORRECTED',
        userAnswer: correctedValue,
        inputData,
      },
      {
        onSuccess: () => {
          setIsCorrectDialogOpen(false);
          setCorrectedValue('');
          onCorrect?.(correctedValue);
        },
      }
    );
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border bg-muted/50 p-2',
        className
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{displaySuggestion}</span>
          {showConfidence && (
            <Badge variant="secondary" className={cn('text-xs', getConfidenceColor())}>
              {getConfidenceLabel()} ({Math.round(confidence * 100)}%)
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleAccept}
          disabled={isPending}
          className="h-8 w-8 p-0 hover:bg-green-100 hover:text-green-700"
          title="Accept suggestion"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleReject}
          disabled={isPending}
          className="h-8 w-8 p-0 hover:bg-red-100 hover:text-red-700"
          title="Reject suggestion"
        >
          <X className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCorrectDialogOpen(true)}
          disabled={isPending}
          className="h-8 w-8 p-0 hover:bg-blue-100 hover:text-blue-700"
          title="Correct suggestion"
        >
          <Edit2 className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={isCorrectDialogOpen} onOpenChange={setIsCorrectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct AI Suggestion</DialogTitle>
            <DialogDescription>
              Provide the correct value to help improve future predictions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>AI Suggestion</Label>
              <div className="rounded-md bg-muted p-2 text-sm">{displaySuggestion}</div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="correction">{correctionLabel}</Label>
              <Input
                id="correction"
                value={correctedValue}
                onChange={(e) => setCorrectedValue(e.target.value)}
                placeholder={correctionPlaceholder}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCorrectDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCorrect} disabled={isPending || !correctedValue.trim()}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
