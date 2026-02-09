// ============================================
// MIZANO ERP - Logger Types & Interfaces
// ============================================

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

export enum LogSource {
  FRONTEND = 'frontend',
  BACKEND = 'backend',
  AI_MODEL = 'ai-model',
}

export enum LogCategory {
  UNHANDLED_EXCEPTION = 'unhandled-exception',
  API_ERROR = 'api-error',
  VALIDATION_ERROR = 'validation-error',
  DATABASE_ERROR = 'database-error',
  AUTH_ERROR = 'auth-error',
  AI_INFERENCE_ERROR = 'ai-inference-error',
  AI_TRAINING_ERROR = 'ai-training-error',
  RENDER_ERROR = 'render-error',
  NETWORK_ERROR = 'network-error',
  BUSINESS_LOGIC = 'business-logic',
  PERFORMANCE = 'performance',
  DEPRECATION = 'deprecation',
  UNKNOWN = 'unknown',
}

export enum LogStatus {
  OPEN = 'open',
  FIXED = 'fixed',
  IGNORED = 'ignored',
  TEST_COVERED = 'test-covered',
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: LogSource;
  category: LogCategory;
  status: LogStatus;
  message: string;
  stack?: string;
  context?: Record<string, any>;
  url?: string;
  method?: string;
  statusCode?: number;
  userAgent?: string;
  userId?: string;
  organizationId?: string;
  /** Number of times this exact error occurred */
  occurrences: number;
  /** Fingerprint for deduplication */
  fingerprint: string;
  /** Related file paths */
  filePaths?: string[];
  /** Whether test coverage exists for this error */
  hasTestCoverage: boolean;
}

export interface LogFilter {
  levels?: LogLevel[];
  sources?: LogSource[];
  categories?: LogCategory[];
  statuses?: LogStatus[];
  search?: string;
  from?: string;
  to?: string;
}

export interface LogStats {
  totalErrors: number;
  totalWarnings: number;
  openCount: number;
  fixedCount: number;
  testCoveredCount: number;
  bySource: Record<LogSource, number>;
  byCategory: Record<LogCategory, number>;
}

export interface ClearLogsRequest {
  ids?: string[];
  status?: LogStatus;
  before?: string;
}

export interface GeneratePromptRequest {
  logIds: string[];
}

export interface GeneratePromptResponse {
  prompt: string;
  logCount: number;
}
