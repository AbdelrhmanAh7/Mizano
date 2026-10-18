import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { RegisterDto } from '../../modules/auth/dto/register.dto';
import { LoginDto } from '../../modules/auth/dto/login.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AllExceptionsFilter } from './http-exception.filter';

/**
 * The error contract the e2e-army stable gate (mz-auth.3, #219) asserts on: a class-validator
 * rejection keeps the generic message and carries the constraint texts in `details`; an
 * unauthenticated request is a 401 with error 'Unauthorized'.
 */
describe('AllExceptionsFilter error contract', () => {
  // Same options as main.ts and the e2e app helper.
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const filter = new AllExceptionsFilter();
  const register = {
    email: 'weak@mizano.test',
    password: 'alllowercase1',
    firstName: 'A',
    lastName: 'B',
    organizationName: 'Weak Org',
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  function render(exception: unknown): { status: number; body: Record<string, unknown> } {
    const out = { status: 0, body: {} as Record<string, unknown> };
    const response = {
      status: (code: number) => {
        out.status = code;
        return response;
      },
      json: (body: Record<string, unknown>) => {
        out.body = body;
        return response;
      },
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ url: '/api/auth/register', method: 'POST', headers: {} }),
      }),
    } as unknown as ArgumentsHost;
    filter.catch(exception, host);
    return out;
  }

  async function rejection(body: Record<string, unknown>): Promise<unknown> {
    try {
      await pipe.transform(body, { type: 'body', metatype: RegisterDto });
    } catch (error) {
      return error;
    }
    throw new Error('expected the register body to be rejected');
  }

  it('renders a weak password as VALIDATION_ERROR with the uppercase rule in details', async () => {
    const error = await rejection(register);
    expect(error).toBeInstanceOf(BadRequestException);

    const { status, body } = render(error);
    expect(status).toBe(400);
    expect(body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      error: 'Bad Request',
    });
    expect(body.details).toEqual({
      Password: ['Password must contain at least one uppercase letter'],
    });
  });

  it('names the email rule, not the password rules, for a malformed email', async () => {
    const { status, body } = render(
      await rejection({ ...register, email: 'not-an-email', password: 'Strong1Password' }),
    );
    expect(status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual({ email: ['email must be an email'] });
  });

  it('renders an invalid login body as VALIDATION_ERROR', async () => {
    let error: unknown;
    try {
      await pipe.transform(
        { email: 'not-an-email', password: 'password123' },
        { type: 'body', metatype: LoginDto },
      );
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    const { status, body } = render(error);
    expect(status).toBe(400);
    expect(body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      error: 'Bad Request',
    });
    expect(JSON.stringify(body.details)).toMatch(/email/i);
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
    expect(status).toBe(401);
    expect(body).toMatchObject({
      statusCode: 401,
      message: 'Invalid or expired token',
      error: 'Unauthorized',
    });
    expect(body.details).toBeUndefined();
  });

  it('falls back to error "Unauthorized" for a 401 that carries no error field', () => {
    const { status, body } = render(new HttpException({ message: 'Session expired' }, 401));
    expect(status).toBe(401);
    expect(body).toMatchObject({ message: 'Session expired', error: 'Unauthorized' });

    const plain = render(new HttpException('Session expired', 401));
    expect(plain.body).toMatchObject({ message: 'Session expired', error: 'Unauthorized' });

    const other = render(new HttpException({ message: 'Teapot' }, 418));
    expect(other.body).toMatchObject({ error: 'Error' });
  });
});
