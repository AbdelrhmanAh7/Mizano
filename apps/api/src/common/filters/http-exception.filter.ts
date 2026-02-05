import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';
    let details: Record<string, string[]> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as Record<string, any>;
        message = responseObj.message || exception.message;
        error = responseObj.error || 'Error';

        // Handle validation errors
        if (Array.isArray(responseObj.message)) {
          details = this.formatValidationErrors(responseObj.message);
          message = 'Validation failed';
        }
      } else {
        message = exceptionResponse;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      details,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
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
}
