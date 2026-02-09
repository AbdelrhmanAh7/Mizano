'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, GraduationCap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import {
  useOcrTrainingSubmit,
  OcrTrainingExtractResult,
} from '@/lib/hooks/use-ocr-training';
import { cn } from '@/lib/utils';

interface QuickTrainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extractionResult?: OcrTrainingExtractResult;
  vendorId?: string;
  corrections?: Record<string, any>;
}

const FIELD_LABELS: Record<string, string> = {
  date: 'Date',
  total: 'Total',
  subtotal: 'Subtotal',
  tax: 'Tax',
  invoiceNumber: 'Invoice Number',
  vendorName: 'Vendor Name',
};

export function QuickTrainDialog({
  open,
  onOpenChange,
  extractionResult,
  vendorId,
  corrections: externalCorrections,
}: QuickTrainDialogProps) {
  const { toast } = useToast();
  const submitMutation = useOcrTrainingSubmit();
  const [additionalCorrections, setAdditionalCorrections] = useState<
    Record<string, any>
  >({});

  // Merge external corrections with any additional ones from this dialog
  const allCorrections = useMemo(
    () => ({ ...externalCorrections, ...additionalCorrections }),
    [externalCorrections, additionalCorrections],
  );

  const correctionCount = Object.keys(allCorrections).length;

  const originalValues = useMemo(() => {
    if (!extractionResult) return {};
    return {
      date: extractionResult.date,
      total: extractionResult.total,
      subtotal: extractionResult.subtotal,
      tax: extractionResult.tax,
      invoiceNumber: extractionResult.invoiceNumber,
      vendorName: extractionResult.vendorName,
    };
  }, [extractionResult]);

  const handleSubmit = () => {
    if (!extractionResult || !vendorId || correctionCount === 0) return;

    submitMutation.mutate(
      {
        vendorId,
        rawText: extractionResult.rawText,
        extractedFields: originalValues,
        correctedFields: allCorrections,
      },
      {
        onSuccess: (response) => {
          const res = response.data;
          toast({
            title: 'Training data submitted',
            description: `${correctionCount} correction(s) saved. ${res.isActive ? 'Vendor layout learning is active!' : `${res.sampleCount}/3 samples collected.`}`,
          });
          setAdditionalCorrections({});
          onOpenChange(false);
        },
        onError: (error: any) => {
          toast({
            variant: 'destructive',
            title: 'Submission failed',
            description:
              error.response?.data?.message ||
              'Failed to submit training data',
          });
        },
      },
    );
  };

  if (!extractionResult) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Train OCR Model
          </DialogTitle>
          <DialogDescription>
            Submit your corrections to help the AI learn this vendor&apos;s
            invoice layout. The model improves with each correction.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px]">
          <div className="space-y-3 pr-4">
            {correctionCount > 0 ? (
              <>
                <p className="text-sm font-medium">
                  You made {correctionCount} correction(s):
                </p>
                {Object.entries(allCorrections).map(([field, correctedValue]) => {
                  const original =
                    originalValues[field as keyof typeof originalValues];
                  return (
                    <div
                      key={field}
                      className="border rounded-md p-3 space-y-1"
                    >
                      <Label className="text-xs font-medium">
                        {FIELD_LABELS[field] || field}
                      </Label>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground line-through">
                          {original === null ? '(empty)' : String(original)}
                        </span>
                        <span className="text-muted-foreground">&rarr;</span>
                        <span className="font-medium text-blue-700">
                          {String(correctedValue)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  No corrections detected yet. You can add corrections below:
                </p>
                {Object.entries(FIELD_LABELS).map(([key, label]) => {
                  const original =
                    originalValues[key as keyof typeof originalValues];
                  const corrected = additionalCorrections[key];

                  return (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs">
                        {label}
                        {original !== null && (
                          <span className="text-muted-foreground ml-1">
                            (OCR: {String(original)})
                          </span>
                        )}
                      </Label>
                      <Input
                        value={corrected !== undefined ? String(corrected) : ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || val === String(original)) {
                            setAdditionalCorrections((prev) => {
                              const next = { ...prev };
                              delete next[key];
                              return next;
                            });
                          } else {
                            setAdditionalCorrections((prev) => ({
                              ...prev,
                              [key]: val,
                            }));
                          }
                        }}
                        placeholder={
                          original !== null ? String(original) : 'Not detected'
                        }
                        className={cn(
                          'h-8 text-sm',
                          corrected !== undefined &&
                            'border-blue-400 bg-blue-50/50',
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {correctionCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {correctionCount} field(s)
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={
                correctionCount === 0 || submitMutation.isPending || !vendorId
              }
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Submit Training Data
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
