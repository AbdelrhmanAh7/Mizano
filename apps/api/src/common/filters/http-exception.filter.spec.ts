import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common/interfaces';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter, ErrorResponse } from './http-exception.filter';
import { RegisterDto } from '../../modules/auth/dto/register.dto';
import { LoginDto } from '../../modules/auth/dto/login.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { BusinessRuleException } from '../exceptions/business-rule.exception';

describe('AllExceptionsFilter (auth and validation error contract)', () => {
  let filter: AllExceptionsFilter;
  let pipe: ValidationPipe;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });
  });

  const register: RegisterDto = {
    email: 'test@example.com',
    password: 'alllowercase1', // missing uppercase letter
    firstName: 'Test',
    lastName: 'User',
    organizationName: 'Test Org',
  };

  async function rejection(dto: unknown, metatype: unknown = RegisterDto): Promise<unknown> {
    try {
      await pipe.transform(dto, { type: 'body', metatype: metatype as never });
      return null;
    } catch (error) {
      return error;
    }
  }

  /** Renders through the filter; `acceptLanguage` defaults to English, `null` sends none. */
  function render(
    exception: unknown,
    acceptLanguage: string | null = 'en',
  ): { status: number; body: ErrorResponse } {
    let capturedStatus = 0;
    let capturedBody: ErrorResponse = {} as ErrorResponse;
    const headers = acceptLanguage === null ? {} : { 'accept-language': acceptLanguage };
    const host: ArgumentsHost = {
      switchToHttp: () => ({
        getRequest: () => ({ url: '/auth/test', method: 'POST', headers }),
        getResponse: () => ({
          status: (code: number) => {
            capturedStatus = code;
            return {
              json: (data: ErrorResponse) => {
                capturedBody = data;
              },
            };
          },
        }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(exception, host);
    return { status: capturedStatus, body: capturedBody };
  }

  it('renders a weak password as VALIDATION_ERROR with Title Case message and normalized details', async () => {
    const error = await rejection(register);
    expect(error).toBeInstanceOf(BadRequestException);

    const { status, body } = render(error);
    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation Failed',
      error: 'Bad Request',
    });
    expect(body.details).toEqual({
      password: ['Password must contain at least one uppercase letter'],
    });
  });

  it('names the email rule with normalized details key for malformed email', async () => {
    const { status, body } = render(
      await rejection({ ...register, email: 'not-an-email', password: 'Strong1Password' }),
    );
    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toBe('Validation Failed');
    expect(body.details).toEqual({ email: ['email must be an email'] });
  });

  it('renders an invalid login body as VALIDATION_ERROR with Title Case message', async () => {
    const error = await rejection({ email: 'not-an-email', password: 'password123' }, LoginDto);
    expect(error).toBeInstanceOf(BadRequestException);
    const { status, body } = render(error);
    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation Failed',
      error: 'Bad Request',
    });
    expect(JSON.stringify(body.details)).toMatch(/email/i);
  });

  it('normalizes direct non-class-validator validation errors to Validation Failed and VALIDATION_ERROR', () => {
    const stringEx = render(new BadRequestException('Validation failed'));
    expect(stringEx.status).toBe(HttpStatus.BAD_REQUEST);
    expect(stringEx.body.code).toBe('VALIDATION_ERROR');
    expect(stringEx.body.message).toBe('Validation Failed');
    expect(stringEx.body.error).toBe('Bad Request');

    const stringEx2 = render(new BadRequestException('Validation error'));
    expect(stringEx2.status).toBe(HttpStatus.BAD_REQUEST);
    expect(stringEx2.body.code).toBe('VALIDATION_ERROR');
    expect(stringEx2.body.message).toBe('Validation Failed');
    expect(stringEx2.body.error).toBe('Bad Request');

    const objEx = render(
      new BadRequestException({
        message: 'Validation failed',
        errors: { amount: ['Amount must be positive'] },
      }),
    );
    expect(objEx.status).toBe(HttpStatus.BAD_REQUEST);
    expect(objEx.body.code).toBe('VALIDATION_ERROR');
    expect(objEx.body.message).toBe('Validation Failed');
    expect(objEx.body.error).toBe('Bad Request');
    expect(objEx.body.details).toEqual({ amount: ['Amount must be positive'] });

    const objEx2 = render(
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid entity data',
        errors: { code: ['Code is required'] },
      }),
    );
    expect(objEx2.status).toBe(HttpStatus.BAD_REQUEST);
    expect(objEx2.body.code).toBe('VALIDATION_ERROR');
    expect(objEx2.body.message).toBe('Validation Failed');
    expect(objEx2.body.details).toEqual({ code: ['Code is required'] });

    const codeEx = render(
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Field does not meet requirements',
      }),
    );
    expect(codeEx.status).toBe(HttpStatus.BAD_REQUEST);
    expect(codeEx.body.code).toBe('VALIDATION_ERROR');
    expect(codeEx.body.message).toBe('Validation Failed');
    expect(codeEx.body.error).toBe('Bad Request');
  });

  it('normalizes Prisma validation errors to Validation Failed and VALIDATION_ERROR', () => {
    const prismaError = new Prisma.PrismaClientValidationError(
      'Invalid `prisma.user.create()` invocation:\nSome detail',
      { clientVersion: '5.8.1' },
    );
    const rendered = render(prismaError);
    expect(rendered.status).toBe(HttpStatus.BAD_REQUEST);
    expect(rendered.body.code).toBe('VALIDATION_ERROR');
    expect(rendered.body.message).toBe('Validation Failed');
    expect(rendered.body.error).toBe('Bad Request');
  });

  it('preserves unrelated 400 messages and does not leak errors on non-validation exceptions', () => {
    const custom400 = render(new BadRequestException('Transfer exceeds limit'));
    expect(custom400.status).toBe(HttpStatus.BAD_REQUEST);
    expect(custom400.body.message).toBe('Transfer exceeds limit');
    // Every response carries a code now: one derived from the status when the throw had none.
    expect(custom400.body.code).toBe('BAD_REQUEST');

    const nonValidationWithErrors = render(
      new BadRequestException({
        message: 'Invalid credit rating',
        errors: { query: 'SELECT * FROM internal' },
      }),
    );
    expect(nonValidationWithErrors.body.message).toBe('Invalid credit rating');
    expect(nonValidationWithErrors.body.details).toBeUndefined();
  });

  it('renders a missing or invalid JWT as 401 Unauthorized', () => {
    const guard = new JwtAuthGuard({} as never);
    let thrown: unknown;
    try {
      guard.handleRequest(null, false, new Error('jwt malformed'));
    } catch (error) {
      thrown = error;
    }

    const { status, body } = render(thrown);
    expect(status).toBe(HttpStatus.UNAUTHORIZED);
    expect(body).toMatchObject({
      statusCode: 401,
      message: 'Invalid or expired token',
      error: 'Unauthorized',
    });
    expect(body.details).toBeUndefined();
  });

  it('consistently returns error "Unauthorized" and normalizes any 401 response error property to "Unauthorized"', () => {
    // 401 with custom error property is normalized to 'Unauthorized' (AC4)
    const customError401 = render(
      new HttpException({ message: 'Session expired', error: 'CustomUnauthorized' }, 401),
    );
    expect(customError401.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(customError401.body.error).toBe('Unauthorized');
    expect(customError401.body.message).toBe('Session expired');

    // 401 with no error property gets fallback 'Unauthorized'
    const fallback401 = render(new HttpException({ message: 'Session expired' }, 401));
    expect(fallback401.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(fallback401.body.error).toBe('Unauthorized');

    // 401 string exception gets fallback 'Unauthorized'
    const plain401 = render(new HttpException('Session expired', 401));
    expect(plain401.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(plain401.body.error).toBe('Unauthorized');

    // Non-401 does not get normalized to 'Unauthorized'
    const teapot = render(new HttpException({ message: 'Teapot' }, 418));
    expect(teapot.body.error).toBe('Error');
  });

  describe('request language', () => {
    it('answers an Arabic request with the catalog Arabic message and code', () => {
      const { status, body } = render(new NotFoundException('Invoice not found'), 'ar');
      expect(status).toBe(HttpStatus.NOT_FOUND);
      expect(body.code).toBe('INVOICE_NOT_FOUND');
      expect(body.message).toBe('الفاتورة غير موجودة.');
    });

    it('answers in Arabic when the request names no language', () => {
      const { body } = render(new NotFoundException('Invoice not found'), null);
      expect(body.code).toBe('INVOICE_NOT_FOUND');
      expect(body.message).toBe('الفاتورة غير موجودة.');
    });

    it('answers an English request with the English message and the same code', () => {
      const { body } = render(new NotFoundException('Invoice not found'), 'en-US,en;q=0.9');
      expect(body.code).toBe('INVOICE_NOT_FOUND');
      expect(body.message).toBe('Invoice not found');
    });

    it('fills the parameters of a patterned message into the Arabic text', () => {
      const { body } = render(
        new BadRequestException('Invoice INV-0042 is not open for payment'),
        'ar',
      );
      expect(body.code).toBe('INVOICE_NOT_OPEN_FOR_PAYMENT');
      expect(body.message).toBe('الفاتورة INV-0042 غير مفتوحة للسداد.');
    });

    it('keeps a business rule code and localizes its message', () => {
      const { status, body } = render(
        BusinessRuleException.periodLocked('2026-01-15', '2026-01-31'),
        'ar',
      );
      expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(body.code).toBe('PERIOD_LOCKED');
      expect(body.message).toBe('لا يمكن تعديل العمليات قبل تاريخ الإقفال 2026-01-31.');
    });

    it('keeps the code a throw already carries', () => {
      const { body } = render(
        new BadRequestException({
          code: 'accountRequired',
          message: 'All bill lines must have an expense account assigned before approval',
        }),
        'ar',
      );
      expect(body.code).toBe('accountRequired');
      expect(body.message).toBe('يجب تحديد حساب مصروف لكل بنود فاتورة المورد قبل الاعتماد.');
    });

    it('falls back to the generic message for its status when the text is not catalogued', () => {
      const ar = render(new ConflictException('Something the catalog never heard of'), 'ar');
      expect(ar.body.code).toBe('CONFLICT');
      expect(ar.body.message).toBe(
        'تم تعديل هذا السجل أو أنه موجود مسبقًا. حدّث الصفحة وحاول مرة أخرى.',
      );

      // English keeps the original English text, which is already in the request language.
      const en = render(new ConflictException('Something the catalog never heard of'), 'en');
      expect(en.body.code).toBe('CONFLICT');
      expect(en.body.message).toBe('Something the catalog never heard of');
    });

    it('logs a catalog miss once, with a hash and never the text', () => {
      // setup.ts already spies on warn: reuse that spy, but count only this test's calls.
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      warn.mockClear();
      try {
        const text = 'Customer secret-customer@example.com is unknown to the catalog';
        render(new BadRequestException(text), 'ar');
        render(new BadRequestException(text), 'ar');
        const misses = warn.mock.calls
          .map((call) => String(call[0]))
          .filter((line) => line.includes('missing from the catalog'));
        expect(misses).toHaveLength(1);
        expect(misses[0]).toMatch(/status=400, code=-, hash=[0-9a-f]{12}/);
        expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-customer');
      } finally {
        warn.mockClear();
      }
    });

    it('translates class-validator details and keeps them keyed by field', async () => {
      const { body } = render(
        await rejection({ ...register, email: 'not-an-email', password: 'Strong1Password' }),
        'ar',
      );
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('بعض البيانات المدخلة غير صحيحة. راجِع الحقول المحددة.');
      expect(body.details).toEqual({
        email: ['يجب أن تكون قيمة email بريدًا إلكترونيًا صحيحًا.'],
      });
    });

    it('translates the custom password rules and unknown properties', async () => {
      const { body } = render(await rejection({ ...register, extra: 'x' }), 'ar');
      expect(body.details).toEqual({
        password: ['يجب أن تحتوي كلمة المرور على حرف إنجليزي كبير واحد على الأقل.'],
        property: ['الحقل extra غير مسموح به.'],
      });
    });

    it('localizes a Prisma unique violation with the field name', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.8.1',
        meta: { target: ['email'] },
      });
      const { status, body } = render(error, 'ar');
      expect(status).toBe(HttpStatus.CONFLICT);
      expect(body.code).toBe('UNIQUE_CONSTRAINT_VIOLATION');
      expect(body.message).toBe('يوجد سجل آخر بالقيمة نفسها في email.');
    });

    it('answers a 401 and an unexpected error in Arabic', () => {
      const unauthorized = render(new UnauthorizedException(), 'ar');
      expect(unauthorized.body.code).toBe('UNAUTHORIZED');
      expect(unauthorized.body.message).toBe('سجّل الدخول للمتابعة.');

      const crash = render(new Error('db password=hunter2 leaked'), 'ar');
      expect(crash.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(crash.body.code).toBe('INTERNAL_ERROR');
      expect(crash.body.message).toBe('حدث خطأ غير متوقع. حاول مرة أخرى لاحقًا.');
    });
  });
});
