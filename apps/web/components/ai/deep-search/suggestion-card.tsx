'use client';

import { ArrowRight, X, TrendingUp, Gauge } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DeepSearchSuggestion } from '@/lib/hooks/use-deep-search';
import {
  getCategoryColor,
  getCategoryLabel,
  getImpactColor,
  getEffortColor,
} from '@/lib/hooks/use-deep-search';

interface SuggestionCardProps {
  suggestion: DeepSearchSuggestion;
  onGetPrompt: (suggestion: DeepSearchSuggestion) => void;
  onDismiss: (suggestionId: string) => void;
  isUpdating?: boolean;
}

export function SuggestionCard({
  suggestion,
  onGetPrompt,
  onDismiss,
  isUpdating,
}: SuggestionCardProps) {
  if (suggestion.status === 'dismissed') return null;

  return (
    <Card
      className={`transition-all hover:shadow-md ${suggestion.status === 'accepted' ? 'border-green-300 bg-green-50/30' : ''}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className={getCategoryColor(suggestion.category)}>
                {getCategoryLabel(suggestion.category)}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Priority: {suggestion.priority}/10
              </Badge>
              {suggestion.status === 'accepted' && (
                <Badge className="bg-green-100 text-green-800">Accepted</Badge>
              )}
            </div>
            <h3 className="font-semibold text-lg leading-tight">{suggestion.title}</h3>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">{suggestion.description}</p>

        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Impact: </span>
            <span className={`font-medium ${getImpactColor(suggestion.impact)}`}>
              {suggestion.impact}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Gauge className="h-3.5 w-3.5" />
            <span>Effort: </span>
            <span className={`font-medium ${getEffortColor(suggestion.effort)}`}>
              {suggestion.effort}
            </span>
          </div>
        </div>

        {suggestion.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestion.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs font-normal">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDismiss(suggestion.id)}
            disabled={isUpdating}
          >
            <X className="h-4 w-4 mr-1" />
            Dismiss
          </Button>
          <Button size="sm" onClick={() => onGetPrompt(suggestion)}>
            Get Prompt
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
