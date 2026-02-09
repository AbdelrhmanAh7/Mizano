'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Bug,
  AlertTriangle,
  Trash2,
  Copy,
  Check,
  CheckCheck,
  X,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Server,
  Monitor,
  Brain,
  Sparkles,
  ClipboardCopy,
  ShieldCheck,
  Eye,
  EyeOff,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLogger } from '@/lib/hooks/use-logger';
import { useGlobalErrorCapture } from '@/lib/hooks/use-global-error-capture';
import {
  LogEntry,
  LogLevel,
  LogSource,
  LogCategory,
  LogStatus,
} from '@mizano/shared-types';

// ---- Helper components ----

function LevelIcon({ level }: { level: LogLevel }) {
  if (level === LogLevel.ERROR) {
    return <Bug className="h-4 w-4 text-destructive" />;
  }
  if (level === LogLevel.WARN) {
    return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  }
  return <AlertTriangle className="h-4 w-4 text-blue-500" />;
}

function SourceIcon({ source }: { source: LogSource }) {
  if (source === LogSource.BACKEND) {
    return <Server className="h-3.5 w-3.5" />;
  }
  if (source === LogSource.FRONTEND) {
    return <Monitor className="h-3.5 w-3.5" />;
  }
  return <Brain className="h-3.5 w-3.5" />;
}

function StatusBadge({ status }: { status: LogStatus }) {
  const variants: Record<LogStatus, { label: string; className: string }> = {
    [LogStatus.OPEN]: { label: 'Open', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    [LogStatus.FIXED]: { label: 'Fixed', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    [LogStatus.IGNORED]: { label: 'Ignored', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
    [LogStatus.TEST_COVERED]: { label: 'Test Covered', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  };
  const v = variants[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${v.className}`}>
      {v.label}
    </span>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

// ---- Log Row ----

function LogRow({
  log,
  isSelected,
  onToggle,
  isExpanded,
  onExpand,
}: {
  log: LogEntry;
  isSelected: boolean;
  onToggle: () => void;
  isExpanded: boolean;
  onExpand: () => void;
}) {
  return (
    <div
      className={`border-b border-border/50 transition-colors ${
        isSelected ? 'bg-accent/50' : 'hover:bg-accent/20'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Checkbox checked={isSelected} onCheckedChange={onToggle} />
        <button onClick={onExpand} className="shrink-0">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        <LevelIcon level={log.level} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{log.message}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <SourceIcon source={log.source} />
              {log.source}
            </span>
            <span>·</span>
            <span>{log.category}</span>
            {log.occurrences > 1 && (
              <>
                <span>·</span>
                <span className="text-orange-500 font-medium">×{log.occurrences}</span>
              </>
            )}
            <span>·</span>
            <span>{formatTime(log.timestamp)}</span>
          </div>
        </div>
        <StatusBadge status={log.status} />
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-3 pb-3 pl-14 space-y-2">
          {log.url && (
            <div className="text-xs">
              <span className="text-muted-foreground">URL: </span>
              <span className="font-mono">
                {log.method && <span className="text-blue-500">{log.method} </span>}
                {log.url}
              </span>
              {log.statusCode && (
                <span className="ml-2 text-red-500">[{log.statusCode}]</span>
              )}
            </div>
          )}
          {log.stack && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Stack Trace
              </summary>
              <pre className="mt-1 p-2 bg-muted rounded text-[11px] overflow-x-auto max-h-40 whitespace-pre-wrap">
                {log.stack}
              </pre>
            </details>
          )}
          {log.context && Object.keys(log.context).length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Context
              </summary>
              <pre className="mt-1 p-2 bg-muted rounded text-[11px] overflow-x-auto max-h-40">
                {JSON.stringify(log.context, null, 2)}
              </pre>
            </details>
          )}
          {log.filePaths && log.filePaths.length > 0 && (
            <div className="text-xs">
              <span className="text-muted-foreground">Files: </span>
              {log.filePaths.map((fp, i) => (
                <span key={i} className="font-mono text-blue-500">
                  {fp}{i < log.filePaths!.length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Prompt Dialog ----

function PromptDialog({
  prompt,
  open,
  onClose,
}: {
  prompt: string;
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = prompt;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [prompt]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-4">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            <DialogTitle>Claude Fix Prompt</DialogTitle>
          </div>
          <DialogDescription>
            Copy this prompt and paste it into Claude (or any AI assistant) to get fixes with test coverage for the selected errors.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[55vh] rounded-md border bg-muted/50 p-4">
          <pre className="text-sm whitespace-pre-wrap font-mono leading-relaxed select-text">
            {prompt}
          </pre>
        </ScrollArea>

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            {prompt.length} characters
          </p>
          <Button onClick={handleCopy} className="min-w-[140px]">
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <ClipboardCopy className="h-4 w-4 mr-2" />
                Copy to Clipboard
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Main Dashboard ----

export function LoggerDashboard() {
  // Initialize global error capture
  useGlobalErrorCapture();

  const {
    logs,
    stats,
    filter,
    selectedIds,
    isOpen,
    logsLoading,
    isClearing,
    isGeneratingPrompt,
    setFilter,
    resetFilter,
    selectAll,
    deselectAll,
    toggleSelection,
    markAsFixed,
    markAsTestCovered,
    markAsIgnored,
    clearResolved,
    clearAll,
    clearSelected,
    generateClaudePrompt,
    setOpen,
    toggle,
    refetch,
  } = useLogger();

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchValue, setSearchValue] = useState('');
  const [promptContent, setPromptContent] = useState<string | null>(null);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleGeneratePrompt = useCallback(async () => {
    const result = await generateClaudePrompt();
    if (result?.prompt) {
      setPromptContent(result.prompt);
    }
  }, [generateClaudePrompt]);

  const handleSearch = useCallback(
    (value: string) => {
      setSearchValue(value);
      setFilter({ search: value || undefined });
    },
    [setFilter],
  );

  const errorCount = stats?.totalErrors || 0;
  const warnCount = stats?.totalWarnings || 0;
  const openCount = stats?.openCount || 0;

  return (
    <>
      {/* Floating trigger button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="fixed bottom-20 right-4 z-50 h-12 w-12 rounded-full shadow-lg border-2 transition-all hover:scale-105"
              onClick={toggle}
              style={{
                borderColor:
                  errorCount > 0
                    ? 'hsl(var(--destructive))'
                    : warnCount > 0
                    ? '#eab308'
                    : 'hsl(var(--border))',
              }}
            >
              <Bug className="h-5 w-5" />
              {openCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                  {openCount > 99 ? '99+' : openCount}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Error Logger ({openCount} open)</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Side panel */}
      <Sheet open={isOpen} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl p-0 flex flex-col"
        >
          {/* Header */}
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bug className="h-5 w-5 text-destructive" />
                <SheetTitle>Error Logger</SheetTitle>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={refetch} title="Refresh">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Stats bar */}
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-red-500">
                <Bug className="h-3 w-3" /> {errorCount} errors
              </span>
              <span className="flex items-center gap-1 text-yellow-500">
                <AlertTriangle className="h-3 w-3" /> {warnCount} warnings
              </span>
              <span className="flex items-center gap-1 text-green-500">
                <Check className="h-3 w-3" /> {stats?.fixedCount || 0} fixed
              </span>
              <span className="flex items-center gap-1 text-blue-500">
                <ShieldCheck className="h-3 w-3" /> {stats?.testCoveredCount || 0} tested
              </span>
            </div>

            {/* Search & Filters */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search errors..."
                  value={searchValue}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>

              {/* Source filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <Filter className="h-3.5 w-3.5" />
                    Filter
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Level</DropdownMenuLabel>
                  {Object.values(LogLevel).map((level) => (
                    <DropdownMenuCheckboxItem
                      key={level}
                      checked={filter.levels?.includes(level) || false}
                      onCheckedChange={(checked) => {
                        const current = filter.levels || [];
                        setFilter({
                          levels: checked
                            ? [...current, level]
                            : current.filter((l) => l !== level),
                        });
                      }}
                    >
                      {level}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Source</DropdownMenuLabel>
                  {Object.values(LogSource).map((source) => (
                    <DropdownMenuCheckboxItem
                      key={source}
                      checked={filter.sources?.includes(source) || false}
                      onCheckedChange={(checked) => {
                        const current = filter.sources || [];
                        setFilter({
                          sources: checked
                            ? [...current, source]
                            : current.filter((s) => s !== source),
                        });
                      }}
                    >
                      {source}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Status</DropdownMenuLabel>
                  {Object.values(LogStatus).map((status) => (
                    <DropdownMenuCheckboxItem
                      key={status}
                      checked={filter.statuses?.includes(status) || false}
                      onCheckedChange={(checked) => {
                        const current = filter.statuses || [];
                        setFilter({
                          statuses: checked
                            ? [...current, status]
                            : current.filter((s) => s !== status),
                        });
                      }}
                    >
                      {status}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={resetFilter}>
                    Clear Filters
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Bulk actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Checkbox
                  checked={
                    logs.length > 0 && selectedIds.length === logs.length
                  }
                  onCheckedChange={(checked) =>
                    checked ? selectAll() : deselectAll()
                  }
                />
                <span>
                  {selectedIds.length > 0
                    ? `${selectedIds.length} selected`
                    : 'Select all'}
                </span>
              </div>

              <Separator orientation="vertical" className="h-4" />

              {/* ===== CLEAR RESOLVED BUTTON ===== */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearResolved}
                      disabled={isClearing}
                      className="gap-1 text-green-600 border-green-200 hover:bg-green-50 dark:border-green-800 dark:hover:bg-green-900/20"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Clear Fixed & Tested
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Remove all errors that are fixed and have test coverage</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* ===== GENERATE CLAUDE PROMPT BUTTON ===== */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGeneratePrompt}
                      disabled={selectedIds.length === 0 || isGeneratingPrompt}
                      className="gap-1 text-purple-600 border-purple-200 hover:bg-purple-50 dark:border-purple-800 dark:hover:bg-purple-900/20"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {isGeneratingPrompt ? 'Generating...' : 'Generate Fix Prompt'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Generate a Claude prompt to fix selected errors with test coverage</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {selectedIds.length > 0 && (
                <>
                  <Separator orientation="vertical" className="h-4" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1">
                        Actions
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => markAsFixed(selectedIds)}>
                        <Check className="h-4 w-4 mr-2 text-green-500" />
                        Mark as Fixed
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => markAsTestCovered(selectedIds)}>
                        <ShieldCheck className="h-4 w-4 mr-2 text-blue-500" />
                        Mark as Test Covered
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => markAsIgnored(selectedIds)}>
                        <EyeOff className="h-4 w-4 mr-2 text-gray-500" />
                        Mark as Ignored
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={clearSelected}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Selected
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}

              <div className="ml-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
                      <Trash2 className="h-3 w-3" />
                      Clear
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={clearResolved}>
                      Clear Fixed & Test Covered
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={clearAll}
                      className="text-destructive"
                    >
                      Clear All Logs
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Log list */}
          <ScrollArea className="flex-1">
            {logsLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                Loading logs...
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <CheckCheck className="h-8 w-8" />
                <p className="font-medium">All clear!</p>
                <p className="text-xs">No errors or warnings to show</p>
              </div>
            ) : (
              <div>
                {logs.map((log) => (
                  <LogRow
                    key={log.id}
                    log={log}
                    isSelected={selectedIds.includes(log.id)}
                    onToggle={() => toggleSelection(log.id)}
                    isExpanded={expandedIds.has(log.id)}
                    onExpand={() => toggleExpand(log.id)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          <div className="p-3 border-t bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
            <span>{logs.length} entries</span>
            <span>
              {stats?.bySource?.[LogSource.FRONTEND] || 0} frontend ·{' '}
              {stats?.bySource?.[LogSource.BACKEND] || 0} backend ·{' '}
              {stats?.bySource?.[LogSource.AI_MODEL] || 0} AI
            </span>
          </div>
        </SheetContent>
      </Sheet>

      {/* Prompt modal */}
      <PromptDialog
        prompt={promptContent || ''}
        open={!!promptContent}
        onClose={() => setPromptContent(null)}
      />
    </>
  );
}
