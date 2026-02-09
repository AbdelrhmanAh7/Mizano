'use client';

import { useState } from 'react';
import { Loader2, Sparkles, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useGenerateTrainingData } from '@/lib/hooks/use-ai-training-lab';
import type { AiModelConfig } from './all-models-config';

interface GenerateDataDialogProps {
  model: AiModelConfig | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GenerateDataDialog({ model, open, onOpenChange }: GenerateDataDialogProps) {
  const [count, setCount] = useState(100);
  const generate = useGenerateTrainingData();

  const handleGenerate = () => {
    if (!model) return;
    generate.mutate(
      { feature: model.feature, count },
      {
        onSuccess: () => {
          setTimeout(() => onOpenChange(false), 1500);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Generate Training Data
          </DialogTitle>
          <DialogDescription>
            Generate synthetic training samples for <strong>{model?.name}</strong>.
            This creates realistic random data to help the model learn.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="count">Number of samples</Label>
            <Input
              id="count"
              type="number"
              min={10}
              max={500}
              value={count}
              onChange={(e) => setCount(Math.max(10, Math.min(500, parseInt(e.target.value) || 100)))}
            />
            <p className="text-xs text-muted-foreground">
              Between 10 and 500 samples. More data generally improves accuracy.
            </p>
          </div>

          {generate.isSuccess && (
            <div className="rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-3">
              <p className="text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Generated {generate.data?.data?.inserted || count} training samples successfully!
              </p>
            </div>
          )}

          {generate.isError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3">
              <p className="text-sm text-red-700 dark:text-red-300">
                Failed to generate data. Please try again.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={generate.isPending}>
            {generate.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate {count} Samples
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
