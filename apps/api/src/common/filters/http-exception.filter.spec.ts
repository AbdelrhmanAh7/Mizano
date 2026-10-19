import { BadRequestException, HttpException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common/interfaces';
import { AllExceptionsFilter, ErrorResponse } from './http-exception.filter';
import { RegisterDto } from '../../modules/auth/dto/register.dto';
import { LoginDto } from '../../modules/auth/dto/login.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

describe('AllExceptionsFilter (auth error contract)', () => {
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

  function render(exception: unknown): { status: number; body: ErrorResponse } {
    let capturedStatus = 0;
    let capturedBody: ErrorResponse = {} as ErrorResponse;
    const host: ArgumentsHost = {
      switchToHttp: () => ({
        getRequest: () => ({ url: '/auth/test', method: 'POST', headers: {} }),
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

  it('falls back to error "Unauthorized" for a 401 that carries no error field', () => {
    const { status, body } = render(new HttpException({ message: 'Session expired' }, 401));
    expect(status).toBe(HttpStatus.UNAUTHORIZED);
    expect(body).toMatchObject({ message: 'Session expired', error: 'Unauthorized' });

    const plain = render(new HttpException('Session expired', 401));
    expect(plain.body).toMatchObject({ message: 'Session expired', error: 'Unauthorized' });

    const other = render(new HttpException({ message: 'Teapot' }, 418));
    expect(other.body).toMatchObject({ error: 'Error' });
  });
});
