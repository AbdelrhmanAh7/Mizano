import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { redactSensitive, redactText, redactUrl, sanitizeStack } from '../../common/utils/redact';
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

/** Bucket for entries that cannot be attributed to an organization (never exposed through the API). */
const SYSTEM_SCOPE = 'system';

/** Caps applied at capture time: client-supplied fields are untrusted. */
const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 8000;
const MAX_URL_LENGTH = 500;
const MAX_USER_AGENT_LENGTH = 255;
const MAX_METHOD_LENGTH = 16;
const MAX_FILE_PATHS = 20;
const MAX_FILE_PATH_LENGTH = 300;
const MAX_CONTEXT_KEYS = 50;

/**
 * In-memory error capture, strictly tenant-scoped.
 *
 * Every entry carries the organization it belongs to (taken from the authenticated
 * request, never from the client). All reads and writes take the caller's
 * `organizationId`; entries without one ("system" entries: unauthenticated requests,
 * schedulers) are kept for process logs only and are not readable through the API,
 * because there is no platform-admin role to scope them to. Fingerprints include the
 * organization so identical errors from two tenants never share a record (and its
 * context). Captured text is redacted and truncated before it is stored.
 */
@Injectable()
export class LoggerService {
  private readonly logger = new Logger(LoggerService.name);
  private logs: Map<string, LogEntry> = new Map();
  private maxLogs = 10000;
  /** Per-organization cap so one noisy tenant cannot evict everyone else's entries. */
  private maxLogsPerOrg = 2000;

  /**
   * Create a fingerprint for deduplication
   */
  private createFingerprint(
    level: LogLevel,
    source: LogSource,
    message: string,
    stack?: string,
    organizationId?: string,
  ): string {
    const normalizedMessage = message
      .replace(/\d+/g, 'N')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'UUID')
      .trim();
    const stackFirstLine = stack?.split('\n')[0] || '';
    const raw = `${organizationId ?? SYSTEM_SCOPE}:${level}:${source}:${normalizedMessage}:${stackFirstLine}`;
    return createHash('sha256').update(raw).digest('hex').substring(0, 16);
  }

  /**
   * Categorize an error based on its message and context
   */
  private categorize(message: string, context?: Record<string, unknown>): LogCategory {
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
    context?: Record<string, unknown>;
    url?: string;
    method?: string;
    statusCode?: number;
    userAgent?: string;
    userId?: string;
    organizationId?: string;
    filePaths?: string[];
  }): LogEntry {
    const message = redactText(String(params.message ?? ''), MAX_MESSAGE_LENGTH);
    const stack =
      typeof params.stack === 'string' ? redactText(params.stack, MAX_STACK_LENGTH) : undefined;
    const context = params.context
      ? redactSensitive(params.context, {
          maxStringLength: 500,
          maxDepth: 4,
          maxArrayLength: 20,
        })
      : undefined;

    const fingerprint = this.createFingerprint(
      params.level,
      params.source,
      message,
      stack,
      params.organizationId,
    );

    // Deduplication: increment existing
    const existing = this.logs.get(fingerprint);
    if (existing) {
      existing.occurrences += 1;
      existing.timestamp = new Date().toISOString();
      if (context && Object.keys(existing.context ?? {}).length < MAX_CONTEXT_KEYS) {
        existing.context = { ...existing.context, ...context };
      }
      this.logs.set(fingerprint, existing);
      return existing;
    }

    const entry: LogEntry = {
      id: fingerprint,
      timestamp: new Date().toISOString(),
      level: params.level,
      source: params.source,
      category: this.categorize(message, context),
      status: LogStatus.OPEN,
      message,
      stack,
      context,
      url: redactUrl(params.url, MAX_URL_LENGTH),
      method: params.method?.slice(0, MAX_METHOD_LENGTH),
      statusCode: params.statusCode,
      userAgent: params.userAgent?.slice(0, MAX_USER_AGENT_LENGTH),
      userId: params.userId,
      organizationId: params.organizationId,
      occurrences: 1,
      fingerprint,
      filePaths: params.filePaths
        ?.slice(0, MAX_FILE_PATHS)
        .map((p) => String(p).slice(0, MAX_FILE_PATH_LENGTH)),
      hasTestCoverage: false,
    };

    this.evictIfNeeded(params.organizationId);
    this.logs.set(fingerprint, entry);

    // Also log through the NestJS logger. Only backend-sourced messages (already built
    // from safe descriptions by the exception filter) are printed; frontend/AI messages
    // are client-supplied text and are referenced by fingerprint only.
    const detail = params.source === LogSource.BACKEND ? ` ${message}` : '';
    const summary = `[${params.source}] ${entry.category} fingerprint=${fingerprint}${detail}`;
    if (params.level === LogLevel.ERROR) {
      this.logger.error(summary, params.source === LogSource.BACKEND ? stack : undefined);
    } else if (params.level === LogLevel.WARN) {
      this.logger.warn(summary);
    }

    return entry;
  }

  /** Evict the oldest entry of the organization (per-org cap), then the oldest overall (global cap). */
  private evictIfNeeded(organizationId?: string): void {
    const scope = organizationId ?? SYSTEM_SCOPE;
    const own = [...this.logs.entries()].filter(
      ([, log]) => (log.organizationId ?? SYSTEM_SCOPE) === scope,
    );
    if (own.length >= this.maxLogsPerOrg) {
      const oldestOwn = this.oldest(own);
      if (oldestOwn) this.logs.delete(oldestOwn);
    }
    if (this.logs.size >= this.maxLogs) {
      const oldest = this.oldest([...this.logs.entries()]);
      if (oldest) this.logs.delete(oldest);
    }
  }

  private oldest(entries: Array<[string, LogEntry]>): string | undefined {
    return entries.sort(
      (a, b) => new Date(a[1].timestamp).getTime() - new Date(b[1].timestamp).getTime(),
    )[0]?.[0];
  }

  /**
   * Capture error from exception filter
   */
  captureException(
    error: Error,
    source: LogSource,
    context?: Record<string, unknown>,
    scope?: { organizationId?: string; userId?: string },
  ): LogEntry {
    return this.capture({
      level: LogLevel.ERROR,
      source,
      message: error.message,
      stack: sanitizeStack(error),
      context,
      organizationId: scope?.organizationId,
      userId: scope?.userId,
    });
  }

  /**
   * Capture warning
   */
  captureWarning(
    message: string,
    source: LogSource,
    context?: Record<string, unknown>,
    scope?: { organizationId?: string; userId?: string },
  ): LogEntry {
    return this.capture({
      level: LogLevel.WARN,
      source,
      message,
      context,
      organizationId: scope?.organizationId,
      userId: scope?.userId,
    });
  }

  /** Entries of one organization; an empty organization id matches nothing. */
  private forOrg(organizationId: string): LogEntry[] {
    if (!organizationId) return [];
    return [...this.logs.values()].filter((l) => l.organizationId === organizationId);
  }

  /**
   * Get the organization's logs with optional filtering
   */
  getLogs(organizationId: string, filter?: LogFilter): LogEntry[] {
    let logs = this.forOrg(organizationId);

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
  getStats(organizationId: string): LogStats {
    const logs = this.forOrg(organizationId);

    const bySource: Record<LogSource, number> = {
      [LogSource.FRONTEND]: 0,
      [LogSource.BACKEND]: 0,
      [LogSource.AI_MODEL]: 0,
    };

    const byCategory: Record<LogCategory, number> = Object.values(LogCategory).reduce(
      (acc, cat) => {
        acc[cat] = 0;
        return acc;
      },
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
  updateStatus(organizationId: string, ids: string[], status: LogStatus): number {
    let updated = 0;
    for (const id of ids) {
      const log = this.logs.get(id);
      if (log && !!organizationId && log.organizationId === organizationId) {
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
   * Clear the organization's logs by IDs, status or age. With no filter at all (no params,
   * or an empty `{}` as the web "Clear all" button sends) every entry of the organization is
   * removed; an explicit empty `ids` list removes nothing. Other organizations are never touched.
   */
  clearLogs(
    organizationId: string,
    params?: { ids?: string[]; status?: LogStatus; before?: string },
  ): number {
    let removed = 0;
    const entries = [...this.logs.entries()].filter(
      ([, log]) => !!organizationId && log.organizationId === organizationId,
    );

    if (!params || (params.ids === undefined && !params.status && !params.before)) {
      for (const [key] of entries) this.logs.delete(key);
      return entries.length;
    }

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
  generatePrompt(
    organizationId: string,
    ids: string[],
    options?: { includeStacks?: boolean; includeContext?: boolean },
  ): GeneratePromptResponse {
    const includeStacks = options?.includeStacks ?? true;
    const includeContext = options?.includeContext ?? true;

    const selectedLogs = ids
      .map((id) => this.getById(organizationId, id))
      .filter((l): l is LogEntry => !!l);

    if (selectedLogs.length === 0) {
      return { prompt: 'No errors selected.', logCount: 0 };
    }

    const errorDetails = selectedLogs
      .map((log, i) => {
        const parts: string[] = [
          `### Error ${i + 1}: ${log.message}`,
          `**${log.level}** · ${log.source} · ${log.category} · ×${log.occurrences}`,
        ];
        if (log.url) {
          parts.push(
            `**Endpoint**: \`${log.method ?? 'GET'} ${log.url}\`${log.statusCode ? ` → ${log.statusCode}` : ''}`,
          );
        }
        if (log.filePaths?.length) {
          parts.push(`**Files**: ${log.filePaths.join(', ')}`);
        }
        if (includeStacks && log.stack) {
          const lines = log.stack.split('\n').slice(0, 8).join('\n');
          parts.push(`**Stack**:\n\`\`\`\n${lines}\n\`\`\``);
        }
        if (includeContext && log.context && Object.keys(log.context).length > 0) {
          const ctxStr = JSON.stringify(log.context);
          const truncated = ctxStr.length > 400 ? `${ctxStr.substring(0, 400)}…}` : ctxStr;
          parts.push(`**Context**: \`${truncated}\``);
        }
        return parts.join('\n');
      })
      .join('\n\n---\n\n');

    const prompt = `Fix ${selectedLogs.length} error(s) in Mizano ERP (NestJS/Next.js 14/TypeScript/Prisma monorepo).

${errorDetails}

For each error: root cause → exact code fix → regression test (Jest) → prevention tip.
Rules: \`Decimal\` for money, \`organizationId\` in all DB queries, no \`any\` types, no \`console.log\`.`;

    return { prompt, logCount: selectedLogs.length };
  }

  /**
   * Get a single log by ID, only if it belongs to the organization
   */
  getById(organizationId: string, id: string): LogEntry | undefined {
    const log = this.logs.get(id);
    return log && !!organizationId && log.organizationId === organizationId ? log : undefined;
  }
}
