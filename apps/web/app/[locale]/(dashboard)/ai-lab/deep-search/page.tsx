'use client';

import { useState } from 'react';
import {
  Search,
  Play,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  Filter,
  Globe,
  Code2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  useDeepSearchJobs,
  useDeepSearchJob,
  useRunDeepSearch,
  useUpdateSuggestion,
  getStatusLabel,
  type DeepSearchSuggestion,
  type DeepSearchJob,
} from '@/lib/hooks/use-deep-search';
import { SearchProgress } from '@/components/ai/deep-search/search-progress';
import { SuggestionCard } from '@/components/ai/deep-search/suggestion-card';
import dynamic from 'next/dynamic';

const PromptModal = dynamic(
  () => import('@/components/ai/deep-search/prompt-modal').then((m) => m.PromptModal),
  { ssr: false },
);

type CategoryFilter = 'ALL' | 'FEATURE_GAP' | 'PERFORMANCE_UX' | 'AI_CAPABILITY';

export default function DeepSearchPage() {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [promptSuggestion, setPromptSuggestion] = useState<DeepSearchSuggestion | null>(null);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [skipWeb, setSkipWeb] = useState(false);

  const { data: jobsData } = useDeepSearchJobs();
  const { data: activeJob } = useDeepSearchJob(activeJobId);
  const runDeepSearch = useRunDeepSearch();
  const updateSuggestion = useUpdateSuggestion();

  const jobs = jobsData?.data || [];

  const handleRunSearch = async () => {
    try {
      const result = await runDeepSearch.mutateAsync({ skipWeb });
      setActiveJobId(result.data.id);
    } catch {
      // Error handled by mutation
    }
  };

  const handleGetPrompt = (suggestion: DeepSearchSuggestion) => {
    setPromptSuggestion(suggestion);
    setPromptModalOpen(true);
    // Mark as accepted when viewing prompt
    if (suggestion.status === 'pending') {
      updateSuggestion.mutate({ suggestionId: suggestion.id, status: 'accepted' });
    }
  };

  const handleDismiss = (suggestionId: string) => {
    updateSuggestion.mutate({ suggestionId, status: 'dismissed' });
  };

  const isRunning = activeJob && !['COMPLETED', 'FAILED'].includes(activeJob.status);
  const suggestions = activeJob?.suggestions || [];
  const filteredSuggestions =
    categoryFilter === 'ALL'
      ? suggestions
      : suggestions.filter((s) => s.category === categoryFilter);

  // Stats for the current job
  const featureGapCount = suggestions.filter((s) => s.category === 'FEATURE_GAP').length;
  const perfUxCount = suggestions.filter((s) => s.category === 'PERFORMANCE_UX').length;
  const aiCapCount = suggestions.filter((s) => s.category === 'AI_CAPABILITY').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Search className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">DeepSearch Agent</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Analyze the market and codebase to discover enhancement opportunities
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={skipWeb}
              onChange={(e) => setSkipWeb(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-muted-foreground">Skip web scraping</span>
          </label>
          <Button
            onClick={handleRunSearch}
            disabled={runDeepSearch.isPending || !!isRunning}
            size="lg"
          >
            {runDeepSearch.isPending || isRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run DeepSearch
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Progress Bar (visible during search) */}
      {activeJob && !['COMPLETED', 'FAILED'].includes(activeJob.status) && (
        <SearchProgress job={activeJob} />
      )}

      {/* Results Section */}
      {activeJob && activeJob.status === 'COMPLETED' && suggestions.length > 0 && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Search className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{suggestions.length}</p>
                    <p className="text-xs text-muted-foreground">Total Suggestions</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Globe className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{featureGapCount}</p>
                    <p className="text-xs text-muted-foreground">Feature Gaps</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Code2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{perfUxCount}</p>
                    <p className="text-xs text-muted-foreground">Performance & UX</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Search className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{aiCapCount}</p>
                    <p className="text-xs text-muted-foreground">AI Capabilities</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filter:</span>
            {(['ALL', 'FEATURE_GAP', 'PERFORMANCE_UX', 'AI_CAPABILITY'] as const).map((cat) => (
              <Button
                key={cat}
                variant={categoryFilter === cat ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCategoryFilter(cat)}
              >
                {cat === 'ALL'
                  ? 'All'
                  : cat === 'FEATURE_GAP'
                    ? 'Feature Gaps'
                    : cat === 'PERFORMANCE_UX'
                      ? 'Performance & UX'
                      : 'AI Capabilities'}
              </Button>
            ))}
          </div>

          {/* Suggestion Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredSuggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onGetPrompt={handleGetPrompt}
                onDismiss={handleDismiss}
                isUpdating={updateSuggestion.isPending}
              />
            ))}
          </div>

          {filteredSuggestions.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No suggestions in this category.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Failed State */}
      {activeJob && activeJob.status === 'FAILED' && (
        <Card className="border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-red-600">
              <XCircle className="h-5 w-5" />
              <div>
                <p className="font-medium">Search Failed</p>
                <p className="text-sm text-muted-foreground">
                  {activeJob.error || 'An unexpected error occurred.'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State (no active job) */}
      {!activeJob && jobs.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No searches yet</h3>
            <p className="text-muted-foreground mb-4 max-w-md mx-auto">
              Click &ldquo;Run DeepSearch&rdquo; to analyze the ERP market and your codebase for
              enhancement opportunities. Each suggestion includes a ready-to-use Claude Code prompt.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Past Searches */}
      {jobs.length > 0 && (
        <>
          <Separator />
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Past Searches
            </h2>
            <div className="space-y-2">
              {jobs.map((job: DeepSearchJob) => (
                <Card
                  key={job.id}
                  className={`cursor-pointer transition-all hover:shadow-sm ${activeJobId === job.id ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => setActiveJobId(job.id)}
                >
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {job.status === 'COMPLETED' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : job.status === 'FAILED' ? (
                          <XCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        )}
                        <span className="text-sm font-medium">
                          {new Date(job.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>{job.suggestionsCount} suggestions</span>
                        <Badge
                          variant={
                            job.status === 'COMPLETED'
                              ? 'default'
                              : job.status === 'FAILED'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {getStatusLabel(job.status)}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Prompt Modal */}
      <PromptModal
        suggestion={promptSuggestion}
        open={promptModalOpen}
        onOpenChange={setPromptModalOpen}
      />
    </div>
  );
}
