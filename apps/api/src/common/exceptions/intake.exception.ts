import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Exception for intake queue unavailable - thrown when REDIS_URL is not configured
 * and no local handler is registered. The intake feature requires either Redis
 * or a local processor in the same process.
 */
export class IntakeQueueUnavailableException extends HttpException {
  constructor(
    message = 'Intake queue unavailable: REDIS_URL must be configured or a local processor must be registered',
  ) {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'INTAKE_QUEUE_UNAVAILABLE',
        message,
        error: 'Service Unavailable',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
