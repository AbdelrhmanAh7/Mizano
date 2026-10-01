import { Logger } from '@nestjs/common';

const captured: { options?: { log?: unknown[] }; handlers: Array<(e: unknown) => void> } = {
  handlers: [],
};

jest.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor(options: { log?: unknown[] }) {
      captured.options = options;
    }
    $use = jest.fn();
    $on = jest.fn((_event: string, handler: (e: unknown) => void) => {
      captured.handlers.push(handler);
    });
    $connect = jest.fn();
    $disconnect = jest.fn();
  },
}));

import {
  attachPrismaQueryLogging,
  buildPrismaLogConfig,
  isQueryLoggingEnabled,
  isQueryParamLoggingEnabled,
} from './prisma-logging';
import { PrismaService } from './prisma.service';

const levelsOf = (log: unknown[] | undefined): string[] =>
  (log ?? []).map((entry) =>
    typeof entry === 'string' ? entry : (entry as { level: string }).level,
  );

describe('prisma query logging policy', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    captured.options = undefined;
    captured.handlers = [];
    delete process.env.PRISMA_LOG_QUERIES;
    delete process.env.PRISMA_LOG_QUERY_PARAMS;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    jest.restoreAllMocks();
  });

  describe('flags', () => {
    it('is off unless PRISMA_LOG_QUERIES is exactly "true"', () => {
      expect(isQueryLoggingEnabled({})).toBe(false);
      expect(isQueryLoggingEnabled({ NODE_ENV: 'development' })).toBe(false);
      expect(isQueryLoggingEnabled({ PRISMA_LOG_QUERIES: 'false' })).toBe(false);
      expect(isQueryLoggingEnabled({ PRISMA_LOG_QUERIES: '1' })).toBe(false);
      expect(isQueryLoggingEnabled({ PRISMA_LOG_QUERIES: 'true' })).toBe(true);
    });

    it('needs a second opt-in for parameters and never logs them in production', () => {
      expect(isQueryParamLoggingEnabled({ PRISMA_LOG_QUERIES: 'true' })).toBe(false);
      expect(isQueryParamLoggingEnabled({ PRISMA_LOG_QUERY_PARAMS: 'true' })).toBe(false);
      expect(
        isQueryParamLoggingEnabled({
          PRISMA_LOG_QUERIES: 'true',
          PRISMA_LOG_QUERY_PARAMS: 'true',
          NODE_ENV: 'development',
        }),
      ).toBe(true);
      expect(
        isQueryParamLoggingEnabled({
          PRISMA_LOG_QUERIES: 'true',
          PRISMA_LOG_QUERY_PARAMS: 'true',
          NODE_ENV: 'production',
        }),
      ).toBe(false);
    });
  });

  describe('buildPrismaLogConfig', () => {
    it.each(['development', 'production', 'test', undefined])(
      'never includes query logging by default (NODE_ENV=%s)',
      (nodeEnv) => {
        expect(levelsOf(buildPrismaLogConfig({ NODE_ENV: nodeEnv }))).not.toContain('query');
      },
    );

    it('keeps errors everywhere and warnings in development only', () => {
      expect(levelsOf(buildPrismaLogConfig({ NODE_ENV: 'production' }))).toEqual(['error']);
      expect(levelsOf(buildPrismaLogConfig({ NODE_ENV: 'development' }))).toEqual([
        'error',
        'warn',
      ]);
    });

    it('emits query events (not stdout) when opted in', () => {
      const config = buildPrismaLogConfig({ PRISMA_LOG_QUERIES: 'true' });
      expect(config).toContainEqual({ emit: 'event', level: 'query' });
      expect(config).not.toContainEqual({ emit: 'stdout', level: 'query' });
    });
  });

  describe('PrismaService', () => {
    it('does not enable query logging by default, even in development', () => {
      process.env.NODE_ENV = 'development';
      const service = new PrismaService();
      expect(levelsOf(captured.options?.log)).not.toContain('query');
      expect((service as unknown as { $on: jest.Mock }).$on).not.toHaveBeenCalled();
    });

    it('subscribes to query events only when PRISMA_LOG_QUERIES=true', () => {
      process.env.PRISMA_LOG_QUERIES = 'true';
      const service = new PrismaService();
      expect(levelsOf(captured.options?.log)).toContain('query');
      expect((service as unknown as { $on: jest.Mock }).$on).toHaveBeenCalledWith(
        'query',
        expect.any(Function),
      );
    });
  });

  describe('attachPrismaQueryLogging', () => {
    const queryEvent = {
      query: 'SELECT * FROM "Invoice" WHERE "total" = $1 AND "taxId" = $2',
      params: '["1500.00","300-123-456"]',
      duration: 12,
    };

    it('does nothing by default', () => {
      const client = { $on: jest.fn() };
      expect(attachPrismaQueryLogging(client, 'primary', {})).toBe(false);
      expect(client.$on).not.toHaveBeenCalled();
    });

    it('logs SQL and duration but never parameters when only PRISMA_LOG_QUERIES is set', () => {
      const debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
      const client = { $on: jest.fn() };
      expect(attachPrismaQueryLogging(client, 'primary', { PRISMA_LOG_QUERIES: 'true' })).toBe(
        true,
      );

      const handler = client.$on.mock.calls[0][1] as (e: typeof queryEvent) => void;
      handler(queryEvent);

      const logged = String(debug.mock.calls[0][0]);
      expect(logged).toContain('SELECT * FROM "Invoice"');
      expect(logged).toContain('12ms');
      expect(logged).not.toContain('300-123-456');
      expect(logged).not.toContain('1500.00');
    });

    it('logs parameters only with the explicit second flag outside production', () => {
      const debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
      const client = { $on: jest.fn() };
      attachPrismaQueryLogging(client, 'primary', {
        PRISMA_LOG_QUERIES: 'true',
        PRISMA_LOG_QUERY_PARAMS: 'true',
        NODE_ENV: 'development',
      });
      (client.$on.mock.calls[0][1] as (e: typeof queryEvent) => void)(queryEvent);
      expect(String(debug.mock.calls[0][0])).toContain('300-123-456');

      debug.mockClear();
      const prodClient = { $on: jest.fn() };
      attachPrismaQueryLogging(prodClient, 'primary', {
        PRISMA_LOG_QUERIES: 'true',
        PRISMA_LOG_QUERY_PARAMS: 'true',
        NODE_ENV: 'production',
      });
      (prodClient.$on.mock.calls[0][1] as (e: typeof queryEvent) => void)(queryEvent);
      expect(String(debug.mock.calls[0][0])).not.toContain('300-123-456');
    });
  });
});
