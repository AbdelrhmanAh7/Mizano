import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * The AI features an organization can turn on (all off by default; see
 * docs/plans/ai-own-accounts.md). Each one runs only with a connected provider, an admin's
 * consent naming that provider, and the feature enabled.
 */
export const AI_FEATURES = ['documents', 'categorization', 'summary'] as const;
export type AiFeatureKey = (typeof AI_FEATURES)[number];

/** Error codes the web translates (messages/{en,ar}/settings.json → aiErrors). */
export type AiErrorCode =
  | 'AI_NOT_ENABLED'
  | 'AI_NOT_CONFIGURED'
  | 'AI_CONSENT_REQUIRED'
  | 'AI_LIMIT_REACHED'
  | 'AI_KEY_INVALID'
  | 'AI_KEY_NO_CREDIT'
  | 'AI_RATE_LIMITED'
  | 'AI_MODEL_UNAVAILABLE'
  | 'AI_PROVIDER_ERROR'
  | 'AI_TIMEOUT'
  | 'AI_INVALID_OUTPUT'
  | 'AI_INPUT_UNSUPPORTED'
  | 'AI_OAUTH_STATE_INVALID'
  | 'AI_SETTINGS_CHANGED';

const STATUS: Record<AiErrorCode, HttpStatus> = {
  AI_NOT_ENABLED: HttpStatus.CONFLICT,
  AI_NOT_CONFIGURED: HttpStatus.SERVICE_UNAVAILABLE,
  AI_CONSENT_REQUIRED: HttpStatus.CONFLICT,
  AI_LIMIT_REACHED: HttpStatus.PAYMENT_REQUIRED,
  AI_KEY_INVALID: HttpStatus.BAD_REQUEST,
  AI_KEY_NO_CREDIT: HttpStatus.PAYMENT_REQUIRED,
  AI_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  AI_MODEL_UNAVAILABLE: HttpStatus.BAD_REQUEST,
  AI_PROVIDER_ERROR: HttpStatus.BAD_GATEWAY,
  AI_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  AI_INVALID_OUTPUT: HttpStatus.BAD_GATEWAY,
  AI_INPUT_UNSUPPORTED: HttpStatus.BAD_REQUEST,
  AI_OAUTH_STATE_INVALID: HttpStatus.BAD_REQUEST,
  AI_SETTINGS_CHANGED: HttpStatus.CONFLICT,
};

/** A typed AI failure; the response carries the code, never provider text or document data. */
export class AiError extends HttpException {
  constructor(
    readonly code: AiErrorCode,
    message: string,
  ) {
    super({ statusCode: STATUS[code], code, message, error: code }, STATUS[code]);
  }
}
