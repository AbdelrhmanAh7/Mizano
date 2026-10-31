import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** The password rules of registration, shared by every route that sets a password. */
export function StrongPassword(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MinLength(8),
    MaxLength(128, { message: 'Password must not exceed 128 characters' }),
    Matches(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' }),
    Matches(/[a-z]/, { message: 'Password must contain at least one lowercase letter' }),
    Matches(/[0-9]/, { message: 'Password must contain at least one number' }),
  );
}

export const RESET_LOCALES = ['en', 'ar'] as const;
export type ResetLocale = (typeof RESET_LOCALES)[number];

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  email: string;

  @ApiPropertyOptional({ enum: RESET_LOCALES, description: 'Language of the email and link' })
  @IsOptional()
  @IsIn(RESET_LOCALES)
  locale?: ResetLocale;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'The token from the reset link' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token: string;

  @ApiProperty({ example: 'Password123' })
  @StrongPassword()
  password: string;
}

export class MemberResetLinkDto {
  @ApiPropertyOptional({ enum: RESET_LOCALES, description: 'Language of the reset page' })
  @IsOptional()
  @IsIn(RESET_LOCALES)
  locale?: ResetLocale;
}
