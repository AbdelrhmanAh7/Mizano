import { BadRequestException, ExecutionContext, PayloadTooLargeException } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { IntakeUploadLimitInterceptor } from './intake-upload-limit.interceptor';

describe('upload size repair', () => {
  const interceptor = new IntakeUploadLimitInterceptor();
  const context = {} as ExecutionContext;
  it('returns a localized split-file repair for a Multer 413', async () => {
    await expect(
      firstValueFrom(
        interceptor.intercept(context, {
          handle: () => throwError(() => new PayloadTooLargeException('File too large')),
        }),
      ),
    ).rejects.toThrow('INTAKE_TOO_LARGE');
  });
  it('preserves unrelated upload errors and successful responses', async () => {
    const error = new BadRequestException('invalid');
    await expect(
      firstValueFrom(interceptor.intercept(context, { handle: () => throwError(() => error) })),
    ).rejects.toBe(error);
    await expect(
      firstValueFrom(interceptor.intercept(context, { handle: () => of('ok') })),
    ).resolves.toBe('ok');
  });
});
