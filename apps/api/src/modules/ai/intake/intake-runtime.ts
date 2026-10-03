import { ConfigService } from '@nestjs/config';

/** One document at a time. Exactly 2 opts into two; every other value is one, never more. */
export function intakeConcurrency(config: ConfigService): number {
  return String(config.get('INTAKE_CONCURRENCY')) === '2' ? 2 : 1;
}

/** Total wall-clock budget for one document, including process start, OCR and PDF tools. */
export function intakeDeadlineMs(config: ConfigService): number {
  const value = Number(config.get<string>('INTAKE_JOB_DEADLINE_MS') ?? 120_000);
  if (!Number.isInteger(value) || value < 100 || value > 600_000) {
    throw new Error('INTAKE_JOB_DEADLINE_MS must be between 100 and 600000');
  }
  return value;
}

export class IntakeRuntimeError extends Error {
  constructor(readonly code: 'INTAKE_TIMEOUT' | 'INTAKE_RESOURCE_LIMIT' | 'INTAKE_WORKER_FAILED') {
    super(code);
    this.name = code;
  }
}

export function intakeErrorMessage(code: string | null, language = 'en'): string | null {
  const arabic = language.toLowerCase().startsWith('ar');
  switch (code) {
    case 'INTAKE_TIMEOUT':
      return arabic
        ? 'انتهت مهلة معالجة المستند. يمكنك إعادة المحاولة أو تقسيم المستند.'
        : 'Document processing timed out. Retry or split the document.';
    case 'INTAKE_RESOURCE_LIMIT':
      return arabic
        ? 'تجاوز المستند حد موارد المعالجة. يمكنك إعادة المحاولة أو تقسيم المستند.'
        : 'Document processing exceeded its resource limit. Retry or split the document.';
    case 'INTAKE_WORKER_FAILED':
      return arabic
        ? 'تعذرت معالجة المستند. يرجى إعادة المحاولة.'
        : 'Document processing failed. Please retry.';
    default:
      return code;
  }
}
