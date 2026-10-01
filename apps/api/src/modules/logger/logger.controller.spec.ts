import { Test, TestingModule } from '@nestjs/testing';
import { LoggerController } from './logger.controller';
import { LoggerService } from './logger.service';
import { LogLevel, LogSource, LogStatus } from '@mizano/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';

const ORG = 'org-1';
const USER = 'user-1';

describe('LoggerController', () => {
  let controller: LoggerController;
  let service: LoggerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LoggerController],
      // PermissionsGuard is constructed by Nest but never executed in these unit tests
      providers: [LoggerService, { provide: PrismaService, useValue: {} }],
    }).compile();

    controller = module.get<LoggerController>(LoggerController);
    service = module.get<LoggerService>(LoggerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('authentication and authorization', () => {
    const permissionsOf = (handler: keyof LoggerController): string[] | undefined =>
      Reflect.getMetadata(PERMISSIONS_KEY, LoggerController.prototype[handler]);

    it('guards the whole controller with JWT, organization and permission guards', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', LoggerController);
      expect(guards).toEqual([JwtAuthGuard, OrganizationGuard, PermissionsGuard]);
    });

    it('requires an admin-level settings permission on every read and management endpoint', () => {
      for (const handler of [
        'getLogs',
        'getStats',
        'getById',
        'updateStatus',
        'generatePrompt',
      ] as const) {
        expect(permissionsOf(handler)).toEqual(['settings.edit']);
      }
      expect(permissionsOf('clearLogs')).toEqual(['settings.delete']);
    });

    it('lets any signed-in user report an error but only into their own organization', () => {
      expect(permissionsOf('capture')).toBeUndefined();

      const entry = controller.capture('org-from-token', 'user-from-token', {
        level: LogLevel.ERROR,
        source: LogSource.FRONTEND,
        message: 'render failed',
      });
      expect(entry.organizationId).toBe('org-from-token');
      expect(entry.userId).toBe('user-from-token');
    });

    it('is rate limited tighter than the global default', () => {
      // @nestjs/throttler stores per-throttler limits as metadata on the class and handler
      const keys = (target: object): string[] =>
        Reflect.getMetadataKeys(target).filter((k: string) => String(k).startsWith('THROTTLER:'));
      expect(keys(LoggerController).length).toBeGreaterThan(0);
      expect(keys(LoggerController.prototype.capture).length).toBeGreaterThan(0);
    });
  });

  describe('tenant scoping', () => {
    it("never returns, updates or deletes another organization's entries", () => {
      const other = service.capture({
        organizationId: 'org-2',
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Other tenant failure',
      });

      expect(controller.getLogs(ORG)).toEqual([]);
      expect(controller.getStats(ORG).totalErrors).toBe(0);
      expect(controller.getById(ORG, other.id)).toBeUndefined();
      expect(controller.updateStatus(ORG, { ids: [other.id], status: LogStatus.FIXED })).toEqual({
        updated: 0,
      });
      expect(controller.clearLogs(ORG)).toEqual({ removed: 0 });
      expect(controller.clearLogs(ORG, { ids: [other.id] })).toEqual({ removed: 0 });
      expect(controller.generatePrompt(ORG, { logIds: [other.id] }).logCount).toBe(0);
      expect(controller.getLogs('org-2')).toHaveLength(1);
    });
  });

  describe('POST /logger/capture', () => {
    it('should capture a log entry', () => {
      const result = controller.capture(ORG, USER, {
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Test error',
      });

      expect(result).toBeDefined();
      expect(result.level).toBe(LogLevel.ERROR);
      expect(result.message).toBe('Test error');
    });

    it('never lets an HTTP client claim the trusted BACKEND source', () => {
      const result = controller.capture(ORG, USER, {
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Invoice 4471 total 1500.00',
      });

      expect(result.source).toBe(LogSource.FRONTEND);
    });
  });

  describe('GET /logger/logs', () => {
    it('should return all logs', () => {
      service.capture({
        organizationId: ORG,
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Error 1',
      });
      service.capture({
        organizationId: ORG,
        level: LogLevel.WARN,
        source: LogSource.FRONTEND,
        message: 'Warn 1',
      });

      const logs = controller.getLogs(ORG);
      expect(logs.length).toBe(2);
    });

    it('should filter logs by level', () => {
      service.capture({
        organizationId: ORG,
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Error 1',
      });
      service.capture({
        organizationId: ORG,
        level: LogLevel.WARN,
        source: LogSource.FRONTEND,
        message: 'Warn 1',
      });

      const logs = controller.getLogs(ORG, 'error');
      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe(LogLevel.ERROR);
    });

    it('should filter logs by source', () => {
      service.capture({
        organizationId: ORG,
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Error 1',
      });
      service.capture({
        organizationId: ORG,
        level: LogLevel.ERROR,
        source: LogSource.FRONTEND,
        message: 'Error 2',
      });

      const logs = controller.getLogs(ORG, undefined, 'frontend');
      expect(logs.length).toBe(1);
      expect(logs[0].source).toBe(LogSource.FRONTEND);
    });

    it('should search logs', () => {
      service.capture({
        organizationId: ORG,
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Database crash',
      });
      service.capture({
        organizationId: ORG,
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Auth failed',
      });

      const logs = controller.getLogs(ORG, undefined, undefined, undefined, undefined, 'database');
      expect(logs.length).toBe(1);
    });
  });

  describe('GET /logger/stats', () => {
    it('should return stats', () => {
      service.capture({
        organizationId: ORG,
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Error 1',
      });
      service.capture({
        organizationId: ORG,
        level: LogLevel.WARN,
        source: LogSource.FRONTEND,
        message: 'Warn 1',
      });

      const stats = controller.getStats(ORG);
      expect(stats.totalErrors).toBe(1);
      expect(stats.totalWarnings).toBe(1);
      expect(stats.openCount).toBe(2);
    });
  });

  describe('POST /logger/update-status', () => {
    it('should update log status', () => {
      const entry = service.capture({
        organizationId: ORG,
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Test error',
      });

      const result = controller.updateStatus(ORG, {
        ids: [entry.id],
        status: LogStatus.FIXED,
      });

      expect(result.updated).toBe(1);
    });
  });

  describe('DELETE /logger/clear', () => {
    it('should clear all logs', () => {
      service.capture({
        organizationId: ORG,
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Error 1',
      });
      service.capture({
        organizationId: ORG,
        level: LogLevel.WARN,
        source: LogSource.FRONTEND,
        message: 'Warn 1',
      });

      const result = controller.clearLogs(ORG);
      expect(result.removed).toBe(2);
    });

    it('should clear specific logs by ID', () => {
      const entry = service.capture({
        organizationId: ORG,
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Error 1',
      });
      service.capture({
        organizationId: ORG,
        level: LogLevel.WARN,
        source: LogSource.FRONTEND,
        message: 'Warn 1',
      });

      const result = controller.clearLogs(ORG, { ids: [entry.id] });
      expect(result.removed).toBe(1);
    });
  });

  describe('POST /logger/generate-prompt', () => {
    it('should generate a Claude prompt', () => {
      const e1 = service.capture({
        organizationId: ORG,
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'DB error',
        stack: 'Error: DB error',
      });

      const result = controller.generatePrompt(ORG, { logIds: [e1.id] });
      expect(result.logCount).toBe(1);
      expect(result.prompt).toContain('DB error');
      expect(result.prompt).toContain('Fix 1 error(s)');
    });
  });
});
