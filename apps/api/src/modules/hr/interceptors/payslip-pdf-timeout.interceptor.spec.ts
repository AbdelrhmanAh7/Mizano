import { CallHandler, ExecutionContext, Logger, ServiceUnavailableException } from '@nestjs/common';
import { lastValueFrom, Observable, throwError } from 'rxjs';
import {
  PAYSLIP_PDF_TIMEOUT_MS,
  PayslipPdfTimeoutInterceptor,
} from './payslip-pdf-timeout.interceptor';

describe('PayslipPdfTimeoutInterceptor', () => {
  let interceptor: PayslipPdfTimeoutInterceptor;
  const mockContext = {} as ExecutionContext;

  beforeEach(() => {
    jest.useFakeTimers();
    interceptor = new PayslipPdfTimeoutInterceptor();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('defines the timeout limit constant as exactly 5000 ms', () => {
    expect(PAYSLIP_PDF_TIMEOUT_MS).toBe(5000);
  });

  it('passes through the response when generation resolves within 5000 ms', async () => {
    const expectedData = Buffer.from('%PDF-1.4 mock content');
    const handler: CallHandler = {
      handle: () =>
        new Observable((subscriber) => {
          const timer = setTimeout(() => {
            subscriber.next(expectedData);
            subscriber.complete();
          }, 4900);
          return () => clearTimeout(timer);
        }),
    };

    const promise = lastValueFrom(interceptor.intercept(mockContext, handler));
    jest.advanceTimersByTime(4900);
    const result = await promise;

    expect(result).toBe(expectedData);
  });

  it('throws ServiceUnavailableException when generation takes 5000 ms or longer', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const handler: CallHandler = {
      handle: () =>
        new Observable((subscriber) => {
          const timer = setTimeout(() => {
            subscriber.next(Buffer.from('%PDF-1.4 late'));
            subscriber.complete();
          }, 6000);
          return () => clearTimeout(timer);
        }),
    };

    const promise = lastValueFrom(interceptor.intercept(mockContext, handler));
    jest.advanceTimersByTime(5000);

    await expect(promise).rejects.toThrow(ServiceUnavailableException);
    await expect(promise).rejects.toThrow('Payslip PDF generation timed out');

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('timed out after 5000ms'));
  });

  it('passes non-timeout errors through unchanged without converting to 503', async () => {
    const customError = new Error('Database connection failed');
    const handler: CallHandler = {
      handle: () => throwError(() => customError),
    };

    const promise = lastValueFrom(interceptor.intercept(mockContext, handler));

    await expect(promise).rejects.toBe(customError);
  });
});
