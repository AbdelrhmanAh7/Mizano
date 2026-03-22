'use client';

import { useState } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DeepSearchSuggestion } from '@/lib/hooks/use-deep-search';
import { getCategoryColor, getCategoryLabel } from '@/lib/hooks/use-deep-search';

interface PromptModalProps {
  suggestion: DeepSearchSuggestion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PromptModal({ suggestion, open, onOpenChange }: PromptModalProps) {
  const [copied, setCopied] = useState(false);

  if (!suggestion) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(suggestion.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = suggestion.prompt;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className={getCategoryColor(suggestion.category)}>
              {getCategoryLabel(suggestion.category)}
            </Badge>
            <Badge variant="outline">Priority: {suggestion.priority}/10</Badge>
          </div>
          <DialogTitle className="text-xl">{suggestion.title}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Paste this prompt into Claude Code to start implementation in plan mode
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[55vh] rounded-md border bg-muted/50 p-4">
          <pre className="text-sm whitespace-pre-wrap font-mono leading-relaxed">
            {suggestion.prompt}
          </pre>
        </ScrollArea>

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">{suggestion.prompt.length} characters</p>
          <Button onClick={handleCopy} className="min-w-[140px]">
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copy to Clipboard
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
