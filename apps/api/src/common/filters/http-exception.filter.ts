import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { BusinessRuleException } from '../exceptions/business-rule.exception';
import { LoggerService } from '../../modules/logger/logger.service';
import { LogLevel, LogSource } from '@mizano/shared-types';
import { describeError, redactUrl, sanitizeStack } from '../utils/redact';
import { localizeError, localizeFieldMessage } from '../i18n/localize-error';
import { Locale, requestLocale } from '../i18n/request-locale';

export interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  error: string;
  details?: Record<string, unknown>;
  timestamp: string;
  path: string;
  requestId?: string;
}

/**
 * The English response before localization. `raw` marks diagnostic text (a non-production 500
 * or database error message) that is not a catalog message and must not be looked up.
 */
type DraftErrorResponse = Omit<ErrorResponse, 'code'> & { code?: string; raw?: boolean };

const VALIDATION_FAILED = 'Validation Failed';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(@Optional() @Inject(LoggerService) private readonly loggerService?: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const locale = requestLocale(request);
    const errorResponse = this.localize(
      this.buildErrorResponse(exception, request, locale),
      locale,
    );

    // Log the error
    this.logError(exception, errorResponse, request);

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  /**
   * Gives every response a stable `code` and its message in the request language, both from
   * the one error catalog (`common/i18n/error-catalog.ts`). A throw's own code is kept.
   */
  private localize(draft: DraftErrorResponse, locale: Locale): ErrorResponse {
    const { raw, ...response } = draft;
    const localized = localizeError({
      // Raw diagnostics are not catalog text: look up only the code and status.
      message: raw ? '' : response.message,
      code: response.code,
      status: response.statusCode,
      locale,
    });
    return {
      ...response,
      code: localized.code,
      message: raw && locale === 'en' ? response.message : localized.message,
    };
  }

  private buildErrorResponse(
    exception: unknown,
    request: Request,
    locale: Locale,
  ): DraftErrorResponse {
    const timestamp = new Date().toISOString();
    const path = request.url;
    const requestId = request.headers['x-request-id'] as string;

    // Handle Business Rule Exceptions
    if (exception instanceof BusinessRuleException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        error: 'Business Rule Violation',
        details: exception.details as Record<string, unknown>,
        timestamp,
        path,
        requestId,
      };
    }

    // Handle Prisma Errors
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.handlePrismaError(exception, timestamp, path, requestId);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      const isProduction = process.env.NODE_ENV === 'production';
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_ERROR',
        message: VALIDATION_FAILED,
        error: 'Bad Request',
        details: isProduction
          ? undefined
          : { prismaError: exception.message.split('\n').slice(-2).join(' ').trim() },
        timestamp,
        path,
        requestId,
      };
    }

    // Handle HTTP Exceptions
    if (exception instanceof HttpException) {
      return this.handleHttpException(exception, timestamp, path, locale, requestId);
    }

    // Handle generic errors
    if (exception instanceof Error) {
      const isProduction = process.env.NODE_ENV === 'production';
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_ERROR',
        message: isProduction ? 'An unexpected error occurred' : exception.message,
        raw: !isProduction,
        error: 'Internal Server Error',
        timestamp,
        path,
        requestId,
      };
    }

    // Unknown error type
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred',
      error: 'Internal Server Error',
      timestamp,
      path,
      requestId,
    };
  }

  private handlePrismaError(
    exception: Prisma.PrismaClientKnownRequestError,
    timestamp: string,
    path: string,
    requestId?: string,
  ): DraftErrorResponse {
    switch (exception.code) {
      case 'P2002': {
        // Unique constraint violation
        const target = (exception.meta?.target as string[])?.join(', ') || 'unknown';
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'UNIQUE_CONSTRAINT_VIOLATION',
          message: `A record with this ${target} already exists`,
          error: 'Conflict',
          details: { field: target, constraint: 'unique' },
          timestamp,
          path,
          requestId,
        };
      }
      case 'P2003': {
        // Foreign key constraint violation
        const field = (exception.meta?.field_name as string) || 'unknown';
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          code: 'FOREIGN_KEY_VIOLATION',
          message: `Invalid reference: ${field}`,
          error: 'Bad Request',
          details: { field, constraint: 'foreign_key' },
          timestamp,
          path,
          requestId,
        };
      }
      case 'P2025': {
        // Record not found
        return {
          statusCode: HttpStatus.NOT_FOUND,
          code: 'RECORD_NOT_FOUND',
          message: 'The requested record was not found',
          error: 'Not Found',
          timestamp,
          path,
          requestId,
        };
      }
      case 'P2014': {
        // Required relation violation
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          code: 'REQUIRED_RELATION_VIOLATION',
          message: 'A required relation is missing',
          error: 'Bad Request',
          timestamp,
          path,
          requestId,
        };
      }
      default: {
        const isProduction = process.env.NODE_ENV === 'production';
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          code: `PRISMA_${exception.code}`,
          message: isProduction ? 'A database error occurred' : exception.message,
          raw: !isProduction,
          error: 'Database Error',
          timestamp,
          path,
          requestId,
        };
      }
    }
  }

  private handleHttpException(
    exception: HttpException,
    timestamp: string,
    path: string,
    locale: Locale,
    requestId?: string,
  ): DraftErrorResponse {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let message: string = exception.message;
    // AC4: 401 responses consistently return 'Unauthorized' as error.
    let error: string = status === HttpStatus.UNAUTHORIZED ? 'Unauthorized' : 'Error';
    let details: Record<string, unknown> | undefined;
    let code: string | undefined;

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const responseObj = exceptionResponse as Record<string, unknown>;
      message = (responseObj.message as string) || exception.message;
      error =
        status === HttpStatus.UNAUTHORIZED
          ? 'Unauthorized'
          : (responseObj.error as string) || 'Error';
      code = responseObj.code as string | undefined;
      details = responseObj.details as Record<string, unknown> | undefined;

      // Handle validation errors from class-validator or explicit validation rejections
      const isValidationError =
        status === HttpStatus.BAD_REQUEST &&
        (Array.isArray(responseObj.message) ||
          code === 'VALIDATION_ERROR' ||
          responseObj.code === 'VALIDATION_ERROR' ||
          (typeof message === 'string' &&
            (message.trim().toLowerCase() === 'validation failed' ||
              message.trim().toLowerCase() === 'validation error')) ||
          (typeof responseObj.message === 'string' &&
            (responseObj.message.trim().toLowerCase() === 'validation failed' ||
              responseObj.message.trim().toLowerCase() === 'validation error')) ||
          (typeof responseObj.error === 'string' &&
            responseObj.error.trim().toLowerCase() === 'validation error'));

      if (isValidationError) {
        if (Array.isArray(responseObj.message)) {
          details = this.formatValidationErrors(responseObj.message, locale);
        } else if (responseObj.errors && typeof responseObj.errors === 'object') {
          // Limit errors field mapping strictly to validation errors only
          details = this.localizeDetails(responseObj.errors as Record<string, unknown>, locale);
        }
        message = VALIDATION_FAILED;
        code = 'VALIDATION_ERROR';
        error = 'Bad Request';
      }
    } else if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
      if (status === HttpStatus.UNAUTHORIZED) {
        error = 'Unauthorized';
      } else if (
        status === HttpStatus.BAD_REQUEST &&
        (message.trim().toLowerCase() === 'validation failed' ||
          message.trim().toLowerCase() === 'validation error')
      ) {
        message = VALIDATION_FAILED;
        code = 'VALIDATION_ERROR';
        error = 'Bad Request';
      }
    }

    return {
      statusCode: status,
      code,
      message,
      error,
      details,
      timestamp,
      path,
      requestId,
    };
  }

  private formatValidationErrors(errors: unknown[], locale: Locale): Record<string, string[]> {
    const formatted: Record<string, string[]> = {};

    for (const error of errors) {
      const text = String(error);
      // Try to extract field name from validation error and normalize initial letter to lowercase
      const match = text.match(/^(\w+)/);
      const field = match ? match[1].charAt(0).toLowerCase() + match[1].slice(1) : 'general';

      if (!formatted[field]) {
        formatted[field] = [];
      }
      formatted[field].push(localizeFieldMessage(text, locale));
    }

    return formatted;
  }

  /** Translates the string messages of an explicit `errors` map, keeping its field keys. */
  private localizeDetails(
    errors: Record<string, unknown>,
    locale: Locale,
  ): Record<string, unknown> {
    const localized: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(errors)) {
      if (typeof value === 'string') localized[field] = localizeFieldMessage(value, locale);
      else if (Array.isArray(value)) {
        localized[field] = value.map((item) =>
          typeof item === 'string' ? localizeFieldMessage(item, locale) : item,
        );
      } else localized[field] = value;
    }
    return localized;
  }

  /**
   * Log the failure without request bodies, headers, query secrets or
   * exception messages that may embed caller data (Prisma renders full query
   * arguments; JSON.parse quotes its input; a 4xx message can quote a customer
   * email or document number). Only ids, codes and a redacted, truncated 5xx
   * description reach stdout and the in-memory logger module.
   */
  private logError(exception: unknown, response: ErrorResponse, request: Request): void {
    const user = (request as { user?: { id?: string; organizationId?: string } }).user;
    const safePath = redactUrl(response.path) ?? '';
    const logContext = {
      statusCode: response.statusCode,
      code: response.code,
      path: safePath,
      method: request.method,
      requestId: response.requestId,
      userId: user?.id,
      organizationId: user?.organizationId,
    };

    if (response.statusCode >= 500) {
      const safeMessage = `${response.code}: ${describeError(exception)}`;
      const safeStack = sanitizeStack(exception);
      this.logger.error(safeMessage, safeStack, logContext);
      // Capture to logger module
      this.loggerService?.capture({
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        message: safeMessage,
        stack: safeStack,
        context: logContext,
        url: safePath,
        method: request.method,
        statusCode: response.statusCode,
        userAgent: request.headers['user-agent'],
        userId: user?.id,
        organizationId: user?.organizationId,
      });
    } else if (response.statusCode >= 400) {
      // The code names the error; the message is not logged (it can quote caller data).
      const safeMessage = `${response.code} (${response.statusCode})`;
      this.logger.warn(safeMessage, logContext);
      // Capture warnings to logger module
      this.loggerService?.capture({
        level: LogLevel.WARN,
        source: LogSource.BACKEND,
        message: safeMessage,
        context: logContext,
        url: safePath,
        method: request.method,
        statusCode: response.statusCode,
        userAgent: request.headers['user-agent'],
        userId: user?.id,
        organizationId: user?.organizationId,
      });
    }
  }
}
