import { Test, TestingModule } from '@nestjs/testing';
import { LoggerController } from './logger.controller';
import { LoggerService } from './logger.service';
import { LogLevel, LogSource, LogStatus } from '@mizano/shared-types';

describe('LoggerController', () => {
  let controller: LoggerController;
  let service: LoggerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LoggerController],
      providers: [LoggerService],
    }).compile();

    controller = module.get<LoggerController>(LoggerController);
    service = module.get<LoggerService>(LoggerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /logger/capture', () => {
    it('should capture a log entry', () => {
      const result = controller.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Test error',
      });

      expect(result).toBeDefined();
      expect(result.level).toBe(LogLevel.ERROR);
      expect(result.message).toBe('Test error');
    });
  });

  describe('GET /logger/logs', () => {
    it('should return all logs', () => {
      service.capture({ level: LogLevel.ERROR, source: LogSource.BACKEND, message: 'Error 1' });
      service.capture({ level: LogLevel.WARN, source: LogSource.FRONTEND, message: 'Warn 1' });

      const logs = controller.getLogs();
      expect(logs.length).toBe(2);
    });

    it('should filter logs by level', () => {
      service.capture({ level: LogLevel.ERROR, source: LogSource.BACKEND, message: 'Error 1' });
      service.capture({ level: LogLevel.WARN, source: LogSource.FRONTEND, message: 'Warn 1' });

      const logs = controller.getLogs('error');
      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe(LogLevel.ERROR);
    });

    it('should filter logs by source', () => {
      service.capture({ level: LogLevel.ERROR, source: LogSource.BACKEND, message: 'Error 1' });
      service.capture({ level: LogLevel.ERROR, source: LogSource.FRONTEND, message: 'Error 2' });

      const logs = controller.getLogs(undefined, 'frontend');
      expect(logs.length).toBe(1);
      expect(logs[0].source).toBe(LogSource.FRONTEND);
    });

    it('should search logs', () => {
      service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Database crash',
      });
      service.capture({ level: LogLevel.ERROR, source: LogSource.BACKEND, message: 'Auth failed' });

      const logs = controller.getLogs(undefined, undefined, undefined, undefined, 'database');
      expect(logs.length).toBe(1);
    });
  });

  describe('GET /logger/stats', () => {
    it('should return stats', () => {
      service.capture({ level: LogLevel.ERROR, source: LogSource.BACKEND, message: 'Error 1' });
      service.capture({ level: LogLevel.WARN, source: LogSource.FRONTEND, message: 'Warn 1' });

      const stats = controller.getStats();
      expect(stats.totalErrors).toBe(1);
      expect(stats.totalWarnings).toBe(1);
      expect(stats.openCount).toBe(2);
    });
  });

  describe('POST /logger/update-status', () => {
    it('should update log status', () => {
      const entry = service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Test error',
      });

      const result = controller.updateStatus({
        ids: [entry.id],
        status: LogStatus.FIXED,
      });

      expect(result.updated).toBe(1);
    });
  });

  describe('DELETE /logger/clear', () => {
    it('should clear all logs', () => {
      service.capture({ level: LogLevel.ERROR, source: LogSource.BACKEND, message: 'Error 1' });
      service.capture({ level: LogLevel.WARN, source: LogSource.FRONTEND, message: 'Warn 1' });

      const result = controller.clearLogs();
      expect(result.removed).toBe(2);
    });

    it('should clear specific logs by ID', () => {
      const entry = service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'Error 1',
      });
      service.capture({ level: LogLevel.WARN, source: LogSource.FRONTEND, message: 'Warn 1' });

      const result = controller.clearLogs({ ids: [entry.id] });
      expect(result.removed).toBe(1);
    });
  });

  describe('POST /logger/generate-prompt', () => {
    it('should generate a Claude prompt', () => {
      const e1 = service.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: 'DB error',
        stack: 'Error: DB error',
      });

      const result = controller.generatePrompt({ logIds: [e1.id] });
      expect(result.logCount).toBe(1);
      expect(result.prompt).toContain('DB error');
      expect(result.prompt).toContain('Fix 1 error(s)');
    });
  });
});
