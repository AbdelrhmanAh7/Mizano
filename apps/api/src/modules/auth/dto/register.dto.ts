import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StrongPassword } from './password.dto';
import { SIGN_UP_COUNTRIES, type SignUpCountry } from '../organization-region';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Password123' })
  @StrongPassword()
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  lastName: string;

  @ApiProperty({ example: 'Acme Corporation' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  organizationName: string;

  @ApiPropertyOptional({
    enum: SIGN_UP_COUNTRIES,
    description: 'Country of the organization; sets its base currency and time zone',
  })
  @IsOptional()
  @IsIn(SIGN_UP_COUNTRIES)
  country?: SignUpCountry;
}
