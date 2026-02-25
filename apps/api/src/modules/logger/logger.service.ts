import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  LogEntry,
  LogLevel,
  LogSource,
  LogCategory,
  LogStatus,
  LogFilter,
  LogStats,
  GeneratePromptResponse,
} from '@mizano/shared-types';

@Injectable()
export class LoggerService {
  private readonly logger = new Logger(LoggerService.name);
  private logs: Map<string, LogEntry> = new Map();
  private maxLogs = 10000;

  /**
   * Create a fingerprint for deduplication
   */
  private createFingerprint(
    level: LogLevel,
    source: LogSource,
    message: string,
    stack?: string,
  ): string {
    const normalizedMessage = message
      .replace(/\d+/g, 'N')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'UUID')
      .trim();
    const stackFirstLine = stack?.split('\n')[0] || '';
    const raw = `${level}:${source}:${normalizedMessage}:${stackFirstLine}`;
    return createHash('sha256').update(raw).digest('hex').substring(0, 16);
  }

  /**
   * Categorize an error based on its message and context
   */
  private categorize(message: string, context?: Record<string, any>): LogCategory {
    const msg = message.toLowerCase();
    if (context?.category) return context.category as LogCategory;
    if (msg.includes('prisma') || msg.includes('database') || msg.includes('sql'))
      return LogCategory.DATABASE_ERROR;
    if (
      msg.includes('unauthorized') ||
      msg.includes('forbidden') ||
      msg.includes('auth') ||
      msg.includes('token')
    )
      return LogCategory.AUTH_ERROR;
    if (msg.includes('validation') || msg.includes('invalid') || msg.includes('required'))
      return LogCategory.VALIDATION_ERROR;
    if (
      msg.includes('ai') ||
      msg.includes('model') ||
      msg.includes('inference') ||
      msg.includes('prediction')
    )
      return LogCategory.AI_INFERENCE_ERROR;
    if (msg.includes('training') || msg.includes('train')) return LogCategory.AI_TRAINING_ERROR;
    if (msg.includes('network') || msg.includes('timeout') || msg.includes('econnrefused'))
      return LogCategory.NETWORK_ERROR;
    if (msg.includes('business') || msg.includes('rule')) return LogCategory.BUSINESS_LOGIC;
    if (msg.includes('deprecated')) return LogCategory.DEPRECATION;
    if (msg.includes('slow') || msg.includes('performance') || msg.includes('memory'))
      return LogCategory.PERFORMANCE;
    return LogCategory.UNKNOWN;
  }

  /**
   * Capture an error or warning log
   */
  capture(params: {
    level: LogLevel;
    source: LogSource;
    message: string;
    stack?: string;
    context?: Record<string, any>;
    url?: string;
    method?: string;
    statusCode?: number;
    userAgent?: string;
    userId?: string;
    organizationId?: string;
    filePaths?: string[];
  }): LogEntry {
    const fingerprint = this.createFingerprint(
      params.level,
      params.source,
      params.message,
      params.stack,
    );

    // Deduplication: increment existing
    const existing = this.logs.get(fingerprint);
    if (existing) {
      existing.occurrences += 1;
      existing.timestamp = new Date().toISOString();
      if (params.context) {
        existing.context = { ...existing.context, ...params.context };
      }
      this.logs.set(fingerprint, existing);
      return existing;
    }

    const entry: LogEntry = {
      id: fingerprint,
      timestamp: new Date().toISOString(),
      level: params.level,
      source: params.source,
      category: this.categorize(params.message, params.context),
      status: LogStatus.OPEN,
      message: params.message,
      stack: params.stack,
      context: params.context,
      url: params.url,
      method: params.method,
      statusCode: params.statusCode,
      userAgent: params.userAgent,
      userId: params.userId,
      organizationId: params.organizationId,
      occurrences: 1,
      fingerprint,
      filePaths: params.filePaths,
      hasTestCoverage: false,
    };

    // Evict oldest when at capacity
    if (this.logs.size >= this.maxLogs) {
      const oldest = [...this.logs.entries()].sort(
        (a, b) => new Date(a[1].timestamp).getTime() - new Date(b[1].timestamp).getTime(),
      )[0];
      if (oldest) this.logs.delete(oldest[0]);
    }

    this.logs.set(fingerprint, entry);

    // Also log through NestJS logger
    if (params.level === LogLevel.ERROR) {
      this.logger.error(`[${params.source}] ${params.message}`, params.stack);
    } else if (params.level === LogLevel.WARN) {
      this.logger.warn(`[${params.source}] ${params.message}`);
    }

    return entry;
  }

  /**
   * Capture error from exception filter
   */
  captureException(error: Error, source: LogSource, context?: Record<string, any>): LogEntry {
    return this.capture({
      level: LogLevel.ERROR,
      source,
      message: error.message,
      stack: error.stack,
      context,
    });
  }

  /**
   * Capture warning
   */
  captureWarning(message: string, source: LogSource, context?: Record<string, any>): LogEntry {
    return this.capture({
      level: LogLevel.WARN,
      source,
      message,
      context,
    });
  }

  /**
   * Get all logs with optional filtering
   */
  getLogs(filter?: LogFilter): LogEntry[] {
    let logs = [...this.logs.values()];

    if (filter) {
      if (filter.levels?.length) {
        logs = logs.filter((l) => filter.levels!.includes(l.level));
      }
      if (filter.sources?.length) {
        logs = logs.filter((l) => filter.sources!.includes(l.source));
      }
      if (filter.categories?.length) {
        logs = logs.filter((l) => filter.categories!.includes(l.category));
      }
      if (filter.statuses?.length) {
        logs = logs.filter((l) => filter.statuses!.includes(l.status));
      }
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        logs = logs.filter(
          (l) =>
            l.message.toLowerCase().includes(searchLower) ||
            l.stack?.toLowerCase().includes(searchLower) ||
            l.url?.toLowerCase().includes(searchLower),
        );
      }
      if (filter.from) {
        const fromDate = new Date(filter.from);
        logs = logs.filter((l) => new Date(l.timestamp) >= fromDate);
      }
      if (filter.to) {
        const toDate = new Date(filter.to);
        logs = logs.filter((l) => new Date(l.timestamp) <= toDate);
      }
    }

    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Get statistics
   */
  getStats(): LogStats {
    const logs = [...this.logs.values()];

    const bySource: Record<LogSource, number> = {
      [LogSource.FRONTEND]: 0,
      [LogSource.BACKEND]: 0,
      [LogSource.AI_MODEL]: 0,
    };

    const byCategory = Object.values(LogCategory).reduce(
      (acc, cat) => ({ ...acc, [cat]: 0 }),
      {} as Record<LogCategory, number>,
    );

    let totalErrors = 0;
    let totalWarnings = 0;
    let openCount = 0;
    let fixedCount = 0;
    let testCoveredCount = 0;

    for (const log of logs) {
      if (log.level === LogLevel.ERROR) totalErrors++;
      if (log.level === LogLevel.WARN) totalWarnings++;
      if (log.status === LogStatus.OPEN) openCount++;
      if (log.status === LogStatus.FIXED) fixedCount++;
      if (log.status === LogStatus.TEST_COVERED) testCoveredCount++;
      bySource[log.source]++;
      byCategory[log.category]++;
    }

    return {
      totalErrors,
      totalWarnings,
      openCount,
      fixedCount,
      testCoveredCount,
      bySource,
      byCategory,
    };
  }

  /**
   * Update status of logs
   */
  updateStatus(ids: string[], status: LogStatus): number {
    let updated = 0;
    for (const id of ids) {
      const log = this.logs.get(id);
      if (log) {
        log.status = status;
        if (status === LogStatus.TEST_COVERED) {
          log.hasTestCoverage = true;
        }
        this.logs.set(id, log);
        updated++;
      }
    }
    return updated;
  }

  /**
   * Clear logs by IDs or status
   */
  clearLogs(params?: { ids?: string[]; status?: LogStatus; before?: string }): number {
    if (!params) {
      const count = this.logs.size;
      this.logs.clear();
      return count;
    }

    let removed = 0;
    const entries = [...this.logs.entries()];

    for (const [key, log] of entries) {
      let shouldRemove = false;
      if (params.ids?.includes(key)) shouldRemove = true;
      if (params.status && log.status === params.status) shouldRemove = true;
      if (params.before && new Date(log.timestamp) < new Date(params.before)) shouldRemove = true;
      if (shouldRemove) {
        this.logs.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Generate a Claude prompt for fixing selected errors
   */
  generatePrompt(ids: string[]): GeneratePromptResponse {
    const selectedLogs = ids.map((id) => this.logs.get(id)).filter((l): l is LogEntry => !!l);

    if (selectedLogs.length === 0) {
      return { prompt: 'No errors selected.', logCount: 0 };
    }

    const errorDetails = selectedLogs
      .map((log, i) => {
        const parts = [
          `### Error ${i + 1}: ${log.message}`,
          `- **Level**: ${log.level}`,
          `- **Source**: ${log.source}`,
          `- **Category**: ${log.category}`,
          `- **Occurrences**: ${log.occurrences}`,
          `- **Timestamp**: ${log.timestamp}`,
        ];
        if (log.url) parts.push(`- **URL**: ${log.method || 'GET'} ${log.url}`);
        if (log.statusCode) parts.push(`- **Status Code**: ${log.statusCode}`);
        if (log.stack) parts.push(`- **Stack Trace**:\n\`\`\`\n${log.stack}\n\`\`\``);
        if (log.context && Object.keys(log.context).length) {
          parts.push(`- **Context**: \`\`\`json\n${JSON.stringify(log.context, null, 2)}\n\`\`\``);
        }
        if (log.filePaths?.length) {
          parts.push(`- **Related Files**: ${log.filePaths.join(', ')}`);
        }
        return parts.join('\n');
      })
      .join('\n\n---\n\n');

    const prompt = `# Fix Errors and Add Test Coverage

I have ${selectedLogs.length} error(s)/warning(s) in my Mizano ERP application that need to be fixed with proper test coverage.

## Project Context
- **Backend**: NestJS with Prisma ORM, TypeScript
- **Frontend**: Next.js 14 (App Router) with React, TypeScript, TailwindCSS, shadcn/ui
- **AI Models**: TensorFlow.js based ML models
- **Testing**: Jest (backend e2e + unit), Jest + React Testing Library (frontend)
- **Monorepo**: Turborepo with pnpm workspaces

## Errors to Fix

${errorDetails}

## Requirements

For each error above, please:

1. **Root Cause Analysis**: Explain why this error occurs
2. **Fix Implementation**: Provide the exact code changes needed to fix the error
3. **Test Coverage**: Write comprehensive tests that:
   - Cover the error scenario (regression test)
   - Cover the fix working correctly
   - Cover edge cases related to this error
   - Follow existing project testing patterns
4. **Prevention**: Suggest any guards, validators, or patterns to prevent recurrence

## Output Format

For each error, provide:
\`\`\`
### Fix for Error N: [Brief Description]

**Root Cause**: ...

**Files to Modify**: 
- path/to/file.ts

**Code Changes**:
\`\`\`diff
// show the diff
\`\`\`

**Test File**: path/to/file.spec.ts
\`\`\`typescript
// complete test code
\`\`\`

**Prevention Notes**: ...
\`\`\`
`;

    return { prompt, logCount: selectedLogs.length };
  }

  /**
   * Get a single log by ID
   */
  getById(id: string): LogEntry | undefined {
    return this.logs.get(id);
  }
}
