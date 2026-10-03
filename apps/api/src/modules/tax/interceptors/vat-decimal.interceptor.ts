import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { Observable, map } from 'rxjs';

/** Format money at the HTTP boundary, retaining Decimal inside the financial command. */
function serialize(value: unknown): unknown {
  if (Decimal.isDecimal(value)) return value.toFixed(4);
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(serialize);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serialize(entry)]));
}

@Injectable()
export class VatDecimalInterceptor implements NestInterceptor<unknown, unknown> {
  intercept(_context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    return next.handle().pipe(map(serialize));
  }
}
