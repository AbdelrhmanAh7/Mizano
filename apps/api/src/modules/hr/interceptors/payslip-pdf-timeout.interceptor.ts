import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Observable, TimeoutError, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

export const PAYSLIP_PDF_TIMEOUT_MS = 5000;

@Injectable()
export class PayslipPdfTimeoutInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PayslipPdfTimeoutInterceptor.name);

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(PAYSLIP_PDF_TIMEOUT_MS),
      catchError((err: unknown) => {
        if (err instanceof TimeoutError) {
          this.logger.warn(`Payslip PDF generation timed out after ${PAYSLIP_PDF_TIMEOUT_MS}ms`);
          return throwError(
            () => new ServiceUnavailableException('Payslip PDF generation timed out'),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
