import { IsNotEmpty, IsString, MaxLength, IsOptional, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateDemoRequestDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  name: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsString()
  @MaxLength(160)
  contact: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @IsIn(['accountant', 'owner'])
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  businessType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  preferredTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ar', 'en'])
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
