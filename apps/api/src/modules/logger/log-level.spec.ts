import { Logger } from '@nestjs/common';
import { defaultLogLevel, parseLogLevel, resolveLogLevels } from './log-level';

describe('LOG_LEVEL', () => {
  describe('resolveLogLevels', () => {
    it.each([
      ['verbose', ['fatal', 'error', 'warn', 'log', 'debug', 'verbose']],
      ['debug', ['fatal', 'error', 'warn', 'log', 'debug']],
      ['info', ['fatal', 'error', 'warn', 'log']],
      ['log', ['fatal', 'error', 'warn', 'log']],
      ['warn', ['fatal', 'error', 'warn']],
      ['error', ['fatal', 'error']],
      ['fatal', ['fatal']],
      ['silent', []],
      ['off', []],
    ])('maps %s to its level set', (raw, expected) => {
      expect(resolveLogLevels(raw)).toEqual(expected);
    });

    it('is case-insensitive and ignores surrounding whitespace', () => {
      expect(resolveLogLevels('  WARN ')).toEqual(['fatal', 'error', 'warn']);
      expect(resolveLogLevels('Debug')).toEqual(['fatal', 'error', 'warn', 'log', 'debug']);
    });

    it('falls back to info in production and debug elsewhere when unset', () => {
      expect(resolveLogLevels(undefined, 'production')).toEqual(['fatal', 'error', 'warn', 'log']);
      expect(resolveLogLevels(undefined, 'development')).toEqual([
        'fatal',
        'error',
        'warn',
        'log',
        'debug',
      ]);
      expect(resolveLogLevels('', undefined)).toEqual(['fatal', 'error', 'warn', 'log', 'debug']);
    });

    it('never silences logging for an unrecognised value', () => {
      expect(resolveLogLevels('loud', 'production')).toEqual(['fatal', 'error', 'warn', 'log']);
      expect(resolveLogLevels('loud', 'development')).toContain('debug');
    });

    it('an explicit LOG_LEVEL beats the NODE_ENV default', () => {
      expect(resolveLogLevels('error', 'development')).toEqual(['fatal', 'error']);
      expect(resolveLogLevels('debug', 'production')).toContain('debug');
    });
  });

  it('parseLogLevel returns undefined for junk', () => {
    expect(parseLogLevel(undefined)).toBeUndefined();
    expect(parseLogLevel('nope')).toBeUndefined();
    expect(parseLogLevel('info')).toBe('log');
  });

  it('defaultLogLevel depends on NODE_ENV', () => {
    expect(defaultLogLevel('production')).toBe('info');
    expect(defaultLogLevel('development')).toBe('debug');
    expect(defaultLogLevel(undefined)).toBe('debug');
  });

  describe('applied to the Nest logger', () => {
    afterEach(() => {
      Logger.overrideLogger(['log', 'error', 'warn', 'debug', 'verbose', 'fatal']);
      jest.restoreAllMocks();
    });

    it('LOG_LEVEL=warn suppresses log/debug output and keeps warn/error', () => {
      // test/setup.ts silences Logger.prototype; restore the real implementation for this check
      jest.restoreAllMocks();
      const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const writeErr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

      Logger.overrideLogger(resolveLogLevels('warn'));
      const logger = new Logger('LogLevelSpec');
      logger.debug('debug-line');
      logger.log('log-line');
      logger.warn('warn-line');
      logger.error('error-line');

      const output = [...write.mock.calls, ...writeErr.mock.calls]
        .map((c) => String(c[0]))
        .join('');
      expect(output).not.toContain('debug-line');
      expect(output).not.toContain('log-line');
      expect(output).toContain('warn-line');
      expect(output).toContain('error-line');
    });
  });
});
