import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { NOTE_ENTITY_TYPES } from '../integration-catalog';

export class IntegrationListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 25;
}

export class IntegrationCustomerQueryDto extends IntegrationListQueryDto {
  @ApiProperty({ required: false, description: 'Exact e-mail match (case-insensitive)' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false, description: 'Name / e-mail / phone contains' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class IntegrationInvoiceQueryDto extends IntegrationListQueryDto {
  @IsOptional()
  @IsIn(['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'])
  status?: string;

  @IsOptional() @IsString() customerId?: string;
}

export class CreateIntegrationNoteDto {
  @ApiProperty({ enum: NOTE_ENTITY_TYPES })
  @IsIn(NOTE_ENTITY_TYPES)
  entityType: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  entityId: string;

  @ApiProperty({ example: 'تم إرسال تذكير بالدفع عبر واتساب' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;
}

export class IntegrationNoteQueryDto extends IntegrationListQueryDto {
  @IsIn(NOTE_ENTITY_TYPES) entityType: string;
  @IsString() @MaxLength(100) entityId: string;
}
