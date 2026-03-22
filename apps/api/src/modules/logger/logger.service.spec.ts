import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from './logger.service';
import { LogLevel, LogSource, LogCategory, LogStatus } from '@mizano/shared-types';

describe('LoggerService', () => {
  let service: LoggerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LoggerService],
    }).compile();

    service = module.get<LoggerService>(LoggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('capture', () => {
    it('should capture an error log', () => {
      const entry = service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Database connection failed',
        stack: 'Error: Database connection failed\n    at Object.<anonymous>',
      });

      expect(entry).toBeDefined();
      expect(entry.level).toBe(LogLevel.ERROR);
      expect(entry.source).toBe(LogSource.BACKEND);
      expect(entry.message).toBe('Database connection failed');
      expect(entry.status).toBe(LogStatus.OPEN);
      expect(entry.occurrences).toBe(1);
      expect(entry.fingerprint).toBeDefined();
      expect(entry.id).toBeDefined();
    });

    it('should capture a warning log', () => {
      const entry = service.capture({
        level: LogLevel.WARN,
        source: LogSource.FRONTEND,
        message: 'Deprecated API usage detected',
      });

      expect(entry.level).toBe(LogLevel.WARN);
      expect(entry.source).toBe(LogSource.FRONTEND);
    });

    it('should deduplicate identical errors by incrementing occurrences', () => {
      const first = service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Connection timeout',
      });

      const second = service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Connection timeout',
      });

      expect(first.id).toBe(second.id);
      expect(second.occurrences).toBe(2);
    });

    it('should auto-categorize database errors', () => {
      const entry = service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Prisma query failed: unique constraint violation',
      });

      expect(entry.category).toBe(LogCategory.DATABASE_ERROR);
    });

    it('should auto-categorize auth errors', () => {
      const entry = service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Unauthorized: invalid token',
      });

      expect(entry.category).toBe(LogCategory.AUTH_ERROR);
    });

    it('should auto-categorize validation errors', () => {
      const entry = service.capture({
        level: LogLevel.WARN,
        source: LogSource.BACKEND,
        message: 'Validation failed: email is required',
      });

      expect(entry.category).toBe(LogCategory.VALIDATION_ERROR);
    });

    it('should auto-categorize AI inference errors', () => {
      const entry = service.capture({
        level: LogLevel.ERROR,
        source: LogSource.AI_MODEL,
        message: 'AI model inference failed: out of memory',
      });

      expect(entry.category).toBe(LogCategory.AI_INFERENCE_ERROR);
    });

    it('should auto-categorize network errors', () => {
      const entry = service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'ECONNREFUSED: connection refused',
      });

      expect(entry.category).toBe(LogCategory.NETWORK_ERROR);
    });

    it('should use custom category from context', () => {
      const entry = service.capture({
        level: LogLevel.ERROR,
        source: LogSource.FRONTEND,
        message: 'Something failed',
        context: { category: LogCategory.RENDER_ERROR },
      });

      expect(entry.category).toBe(LogCategory.RENDER_ERROR);
    });

    it('should include optional metadata', () => {
      const entry = service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Request failed',
        url: '/api/users',
        method: 'POST',
        statusCode: 500,
        userAgent: 'Mozilla/5.0',
        userId: 'user-123',
        organizationId: 'org-456',
        filePaths: ['src/users/users.service.ts'],
      });

      expect(entry.url).toBe('/api/users');
      expect(entry.method).toBe('POST');
      expect(entry.statusCode).toBe(500);
      expect(entry.userId).toBe('user-123');
      expect(entry.organizationId).toBe('org-456');
      expect(entry.filePaths).toEqual(['src/users/users.service.ts']);
    });
  });

  describe('captureException', () => {
    it('should capture an Error object', () => {
      const error = new Error('Test error');
      const entry = service.captureException(error, LogSource.BACKEND, {
        module: 'auth',
      });

      expect(entry.level).toBe(LogLevel.ERROR);
      expect(entry.message).toBe('Test error');
      expect(entry.stack).toBeDefined();
      expect(entry.context).toEqual({ module: 'auth' });
    });
  });

  describe('captureWarning', () => {
    it('should capture a warning message', () => {
      const entry = service.captureWarning('Rate limit approaching', LogSource.BACKEND, {
        limit: 100,
        current: 95,
      });

      expect(entry.level).toBe(LogLevel.WARN);
      expect(entry.message).toBe('Rate limit approaching');
    });
  });

  describe('getLogs', () => {
    beforeEach(() => {
      service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Backend error 1',
      });
      service.capture({
        level: LogLevel.WARN,
        source: LogSource.FRONTEND,
        message: 'Frontend warning 1',
      });
      service.capture({
        level: LogLevel.ERROR,
        source: LogSource.AI_MODEL,
        message: 'AI model error 1',
      });
      service.capture({
        level: LogLevel.WARN,
        source: LogSource.BACKEND,
        message: 'Backend warning 1',
      });
    });

    it('should return all logs sorted by timestamp desc', () => {
      const logs = service.getLogs();
      expect(logs.length).toBe(4);
      // Most recent first
      expect(new Date(logs[0].timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(logs[1].timestamp).getTime(),
      );
    });

    it('should filter by level', () => {
      const logs = service.getLogs({ levels: [LogLevel.ERROR] });
      expect(logs.length).toBe(2);
      expect(logs.every((l) => l.level === LogLevel.ERROR)).toBe(true);
    });

    it('should filter by source', () => {
      const logs = service.getLogs({ sources: [LogSource.BACKEND] });
      expect(logs.length).toBe(2);
      expect(logs.every((l) => l.source === LogSource.BACKEND)).toBe(true);
    });

    it('should filter by search term', () => {
      const logs = service.getLogs({ search: 'frontend' });
      expect(logs.length).toBe(1);
      expect(logs[0].source).toBe(LogSource.FRONTEND);
    });

    it('should filter by status', () => {
      const allLogs = service.getLogs();
      service.updateStatus([allLogs[0].id], LogStatus.FIXED);

      const openLogs = service.getLogs({ statuses: [LogStatus.OPEN] });
      expect(openLogs.length).toBe(3);

      const fixedLogs = service.getLogs({ statuses: [LogStatus.FIXED] });
      expect(fixedLogs.length).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      service.capture({ level: LogLevel.ERROR, source: LogSource.BACKEND, message: 'Error 1' });
      service.capture({ level: LogLevel.ERROR, source: LogSource.FRONTEND, message: 'Error 2' });
      service.capture({ level: LogLevel.WARN, source: LogSource.AI_MODEL, message: 'Warning 1' });

      const stats = service.getStats();
      expect(stats.totalErrors).toBe(2);
      expect(stats.totalWarnings).toBe(1);
      expect(stats.openCount).toBe(3);
      expect(stats.fixedCount).toBe(0);
      expect(stats.bySource[LogSource.BACKEND]).toBe(1);
      expect(stats.bySource[LogSource.FRONTEND]).toBe(1);
      expect(stats.bySource[LogSource.AI_MODEL]).toBe(1);
    });
  });

  describe('updateStatus', () => {
    it('should update log status', () => {
      const entry = service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Test error',
      });

      const updated = service.updateStatus([entry.id], LogStatus.FIXED);
      expect(updated).toBe(1);

      const log = service.getById(entry.id);
      expect(log?.status).toBe(LogStatus.FIXED);
    });

    it('should set hasTestCoverage when marking as TEST_COVERED', () => {
      const entry = service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Test error',
      });

      service.updateStatus([entry.id], LogStatus.TEST_COVERED);
      const log = service.getById(entry.id);
      expect(log?.hasTestCoverage).toBe(true);
      expect(log?.status).toBe(LogStatus.TEST_COVERED);
    });

    it('should return 0 for non-existent IDs', () => {
      const updated = service.updateStatus(['nonexistent'], LogStatus.FIXED);
      expect(updated).toBe(0);
    });
  });

  describe('clearLogs', () => {
    it('should clear all logs when no params', () => {
      service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Database failed',
      });
      service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Network timeout',
      });

      const removed = service.clearLogs();
      expect(removed).toBe(2);
      expect(service.getLogs().length).toBe(0);
    });

    it('should clear logs by IDs', () => {
      const e1 = service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Database failed',
      });
      service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Network timeout',
      });

      const removed = service.clearLogs({ ids: [e1.id] });
      expect(removed).toBe(1);
      expect(service.getLogs().length).toBe(1);
    });

    it('should clear logs by status', () => {
      const e1 = service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Database failed',
      });
      service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Network timeout',
      });
      service.updateStatus([e1.id], LogStatus.FIXED);

      const removed = service.clearLogs({ status: LogStatus.FIXED });
      expect(removed).toBe(1);
      expect(service.getLogs().length).toBe(1);
    });
  });

  describe('generatePrompt', () => {
    it('should generate a Claude prompt for selected errors', () => {
      const e1 = service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Database connection failed',
        stack: 'Error: Database connection failed\n    at PrismaClient.connect',
        url: '/api/users',
        method: 'GET',
        statusCode: 500,
      });

      const e2 = service.capture({
        level: LogLevel.WARN,
        source: LogSource.FRONTEND,
        message: 'Component render timeout',
        context: { component: 'Dashboard' },
      });

      const result = service.generatePrompt([e1.id, e2.id]);

      expect(result.logCount).toBe(2);
      expect(result.prompt).toContain('Fix 2 error(s)');
      expect(result.prompt).toContain('Database connection failed');
      expect(result.prompt).toContain('Component render timeout');
      expect(result.prompt).toContain('NestJS');
      expect(result.prompt).toContain('Next.js');
      expect(result.prompt).toContain('root cause');
    });

    it('should return empty prompt message for no selection', () => {
      const result = service.generatePrompt([]);
      expect(result.logCount).toBe(0);
      expect(result.prompt).toBe('No errors selected.');
    });

    it('should include stack traces in prompt', () => {
      const e1 = service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Test error',
        stack: 'Error: Test error\n    at Function.test (/src/test.ts:10:5)',
      });

      const result = service.generatePrompt([e1.id]);
      expect(result.prompt).toContain('**Stack**');
      expect(result.prompt).toContain('/src/test.ts:10:5');
    });
  });

  describe('getById', () => {
    it('should return a log by ID', () => {
      const entry = service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Test error',
      });

      const found = service.getById(entry.id);
      expect(found).toBeDefined();
      expect(found?.message).toBe('Test error');
    });

    it('should return undefined for non-existent ID', () => {
      const found = service.getById('nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('eviction', () => {
    it('should evict oldest logs when at capacity', () => {
      // Access private maxLogs for testing
      (service as any).maxLogs = 3;

      service.capture({ level: LogLevel.ERROR, source: LogSource.BACKEND, message: 'Error A' });
      service.capture({ level: LogLevel.ERROR, source: LogSource.BACKEND, message: 'Error B' });
      service.capture({ level: LogLevel.ERROR, source: LogSource.BACKEND, message: 'Error C' });
      service.capture({ level: LogLevel.ERROR, source: LogSource.BACKEND, message: 'Error D' });

      const logs = service.getLogs();
      expect(logs.length).toBe(3);
      // Oldest (Error A) should have been evicted
      expect(logs.find((l) => l.message === 'Error A')).toBeUndefined();
    });
  });
});
