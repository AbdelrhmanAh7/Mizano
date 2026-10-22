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
import { describeError, redactText, redactUrl, sanitizeStack } from '../utils/redact';

export interface ErrorResponse {
  statusCode: number;
  code?: string;
  message: string;
  error: string;
  details?: Record<string, unknown>;
  timestamp: string;
  path: string;
  requestId?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(@Optional() @Inject(LoggerService) private readonly loggerService?: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorResponse = this.buildErrorResponse(exception, request);

    // Log the error
    this.logError(exception, errorResponse, request);

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private buildErrorResponse(exception: unknown, request: Request): ErrorResponse {
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
        message: 'Validation Failed',
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
      return this.handleHttpException(exception, timestamp, path, requestId);
    }

    // Handle generic errors
    if (exception instanceof Error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_ERROR',
        message:
          process.env.NODE_ENV === 'production'
            ? 'An unexpected error occurred'
            : exception.message,
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
  ): ErrorResponse {
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
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          code: `PRISMA_${exception.code}`,
          message:
            process.env.NODE_ENV === 'production' ? 'A database error occurred' : exception.message,
          error: 'Database Error',
          timestamp,
          path,
          requestId,
        };
    }
  }

  private handleHttpException(
    exception: HttpException,
    timestamp: string,
    path: string,
    requestId?: string,
  ): ErrorResponse {
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
          details = this.formatValidationErrors(responseObj.message);
        } else if (responseObj.errors && typeof responseObj.errors === 'object') {
          // Limit errors field mapping strictly to validation errors only
          details = responseObj.errors as Record<string, unknown>;
        }
        message = 'Validation Failed';
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
        message = 'Validation Failed';
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

  private formatValidationErrors(errors: string[]): Record<string, string[]> {
    const formatted: Record<string, string[]> = {};

    for (const error of errors) {
      // Try to extract field name from validation error and normalize initial letter to lowercase
      const match = error.match(/^(\w+)/);
      const field = match ? match[1].charAt(0).toLowerCase() + match[1].slice(1) : 'general';

      if (!formatted[field]) {
        formatted[field] = [];
      }
      formatted[field].push(error);
    }

    return formatted;
  }

  /**
   * Log the failure without request bodies, headers, query secrets or
   * exception messages that may embed caller data (Prisma renders full query
   * arguments; JSON.parse quotes its input). Only ids, codes and a redacted,
   * truncated message reach stdout and the in-memory logger module.
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
      const safeMessage = `${response.code || 'ERROR'}: ${describeError(exception)}`;
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
      const safeMessage = `${response.code || 'ERROR'}: ${redactText(String(response.message), 300)}`;
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
