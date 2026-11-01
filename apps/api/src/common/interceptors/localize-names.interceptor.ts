import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { localizeDeep } from '../i18n/localize';
import { requestLocale } from '../i18n/request-locale';

/**
 * Answers system data (seeded accounts, tax rates, roles) in the request language. It is the
 * outermost interceptor, so the server-side response cache keeps the language-neutral rows and
 * every request is localized on the way out.
 */
@Injectable()
export class LocalizeNamesInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const locale = requestLocale(context.switchToHttp().getRequest<Request>());
    return next.handle().pipe(map((body: unknown) => localizeDeep(body, locale)));
  }
}
