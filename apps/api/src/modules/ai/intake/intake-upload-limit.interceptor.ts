import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  HttpException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Observable, catchError, throwError } from 'rxjs';
import { IntakeFormatError } from './format-error';

/** Multer rejects oversized uploads before a job exists; offer the same repair path. */
@Injectable()
export class IntakeUploadLimitInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpException && error.getStatus() === 413) {
          return throwError(
            () => new PayloadTooLargeException(new IntakeFormatError('TOO_LARGE').message),
          );
        }
        return throwError(() => error);
      }),
    );
  }
}
