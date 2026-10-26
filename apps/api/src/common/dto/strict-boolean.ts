import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

/**
 * A JSON boolean that must really be one. The global ValidationPipe runs with
 * `enableImplicitConversion`, which turns any non-empty string ("maybe", "false") into `true`
 * before `@IsBoolean()` looks at it, so a bad value was accepted and stored. This decorator
 * restores the raw body value so only `true` / `false` pass. Use it on request-body DTOs only;
 * query strings keep their own "true"/"false" transforms.
 */
export function IsStrictBoolean(): PropertyDecorator {
  return applyDecorators(
    Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key]),
    IsBoolean(),
  );
}
