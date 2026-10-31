import { BadRequestException, Type, ValidationPipe } from '@nestjs/common';

/** Keep aligned with the global pipe in main.ts, including implicit conversion. */
export const APP_VALIDATION_OPTIONS = {
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
  transformOptions: { enableImplicitConversion: true },
};

const pipe = new ValidationPipe(APP_VALIDATION_OPTIONS);

/**
 * Run a body or query through the app's ValidationPipe. Resolves to the class-validator
 * messages ([] when the input is accepted); any other failure is rethrown.
 */
export async function pipeErrors(
  metatype: Type<unknown>,
  value: unknown,
  type: 'body' | 'query' = 'body',
): Promise<string[]> {
  try {
    await pipe.transform(value, { type, metatype });
    return [];
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    const { message } = error.getResponse() as { message: string | string[] };
    return Array.isArray(message) ? message : [message];
  }
}

/** The transformed value the handler would receive. */
export async function pipeTransform<T>(
  metatype: Type<T>,
  value: unknown,
  type: 'body' | 'query' = 'body',
): Promise<T> {
  return (await pipe.transform(value, { type, metatype })) as T;
}
