import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { BusinessRuleException } from '../exceptions/business-rule.exception';

interface ErrorResponse {
  statusCode: number;
  code?: string;
  message: string;
  error: string;
  details?: Record<string, any>;
  timestamp: string;
  path: string;
  requestId?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

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
        details: exception.details,
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
        code: 'PRISMA_VALIDATION_ERROR',
        message: 'Database validation error',
        error: 'Validation Error',
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
        message: process.env.NODE_ENV === 'production'
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
        const field = exception.meta?.field_name as string || 'unknown';
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
          message: process.env.NODE_ENV === 'production'
            ? 'A database error occurred'
            : exception.message,
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
    let error: string = 'Error';
    let details: Record<string, any> | undefined;
    let code: string | undefined;

    if (typeof exceptionResponse === 'object') {
      const responseObj = exceptionResponse as Record<string, any>;
      message = responseObj.message || exception.message;
      error = responseObj.error || 'Error';
      code = responseObj.code;
      details = responseObj.details;

      // Handle validation errors from class-validator
      if (Array.isArray(responseObj.message)) {
        details = this.formatValidationErrors(responseObj.message);
        message = 'Validation failed';
        code = 'VALIDATION_ERROR';
      }
    } else if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
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
      // Try to extract field name from validation error
      const match = error.match(/^(\w+)/);
      const field = match ? match[1] : 'general';

      if (!formatted[field]) {
        formatted[field] = [];
      }
      formatted[field].push(error);
    }

    return formatted;
  }

  private logError(exception: unknown, response: ErrorResponse, request: Request) {
    const logContext = {
      statusCode: response.statusCode,
      code: response.code,
      path: response.path,
      method: request.method,
      requestId: response.requestId,
      userId: (request as any).user?.id,
      organizationId: (request as any).user?.organizationId,
    };

    if (response.statusCode >= 500) {
      this.logger.error(
        `${response.code || 'ERROR'}: ${response.message}`,
        exception instanceof Error ? exception.stack : undefined,
        logContext,
      );
    } else if (response.statusCode >= 400) {
      this.logger.warn(`${response.code || 'ERROR'}: ${response.message}`, logContext);
    }
  }
}
