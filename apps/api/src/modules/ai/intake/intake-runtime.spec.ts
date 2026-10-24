import { ConfigService } from '@nestjs/config';
import { intakeConcurrency, intakeDeadlineMs, intakeErrorMessage } from './intake-runtime';

describe('Pi worker configuration', () => {
  it.each([undefined, '', '0', '-1', '3', '4', '100', '1.5', 'invalid', '1'])(
    'bounds concurrency %s to one',
    (value) => {
      expect(intakeConcurrency(new ConfigService({ INTAKE_CONCURRENCY: value }))).toBe(1);
    },
  );
  it('allows exactly two when explicitly configured', () => {
    expect(intakeConcurrency(new ConfigService({ INTAKE_CONCURRENCY: '2' }))).toBe(2);
    expect(intakeConcurrency(new ConfigService({ INTAKE_CONCURRENCY: 2 }))).toBe(2);
  });
  it('defaults to a finite total deadline', () => {
    expect(intakeDeadlineMs(new ConfigService())).toBe(120000);
  });
  it.each(['0', '-1', 'NaN', 'Infinity', '600001', '100.5'])(
    'rejects unsafe deadlines %s',
    (value) => {
      expect(() =>
        intakeDeadlineMs(new ConfigService({ INTAKE_JOB_DEADLINE_MS: value })),
      ).toThrow();
    },
  );
  it.each(['INTAKE_TIMEOUT', 'INTAKE_RESOURCE_LIMIT', 'INTAKE_WORKER_FAILED'])(
    'localizes %s with a retry action',
    (code) => {
      expect(intakeErrorMessage(code, 'en')).toMatch(/retry/i);
      expect(intakeErrorMessage(code, 'ar-EG')).toContain('إعادة المحاولة');
      expect(intakeErrorMessage(code, 'ar')).not.toBe(intakeErrorMessage(code, 'en'));
    },
  );
});
