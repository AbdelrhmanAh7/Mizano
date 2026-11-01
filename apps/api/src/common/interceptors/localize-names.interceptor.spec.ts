import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { LocalizeNamesInterceptor } from './localize-names.interceptor';

const body = { data: [{ id: 'r1', name: 'Admin', nameEn: 'Admin', nameAr: 'مدير النظام' }] };

function run(acceptLanguage: string | undefined): Promise<unknown> {
  const context = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'accept-language': acceptLanguage } }),
    }),
  } as unknown as ExecutionContext;
  const next: CallHandler = { handle: () => of(body) };
  return lastValueFrom(new LocalizeNamesInterceptor().intercept(context, next));
}

describe('LocalizeNamesInterceptor', () => {
  it('answers system names in the request language, Arabic by default', async () => {
    expect(await run('en-US,en;q=0.9')).toEqual({
      data: [expect.objectContaining({ name: 'Admin' })],
    });
    expect(await run('ar')).toEqual({ data: [expect.objectContaining({ name: 'مدير النظام' })] });
    expect(await run(undefined)).toEqual({
      data: [expect.objectContaining({ name: 'مدير النظام' })],
    });
    // The cached, language-neutral body is never changed in place.
    expect(body.data[0].name).toBe('Admin');
  });
});
