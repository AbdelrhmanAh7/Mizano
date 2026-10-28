import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { INTEGRATION_SCOPES, WEBHOOK_EVENT_TYPES } from '../integration-catalog';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'FlowLine' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiProperty({ isArray: true, enum: INTEGRATION_SCOPES })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(INTEGRATION_SCOPES, { each: true })
  scopes: string[];

  @ApiProperty({ required: false, description: 'Requests per minute (default 120)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1200)
  rateLimitPerMinute?: number;

  @ApiProperty({ required: false, description: 'ISO date-time; omit for no expiry' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class CreateWebhookEndpointDto {
  @ApiProperty({ example: 'FlowLine – overdue reminders' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'https://flowline.example/api/public/webhooks/<endpoint uuid>' })
  @IsString()
  @MaxLength(2000)
  url: string;

  @ApiProperty({
    description: 'Signing secret shown by FlowLine for this webhook trigger (whsec_…)',
  })
  @IsString()
  @MinLength(16)
  @MaxLength(200)
  @Matches(/^\S+$/, { message: 'secret must not contain spaces' })
  secret: string;

  @ApiProperty({ isArray: true, enum: WEBHOOK_EVENT_TYPES })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(WEBHOOK_EVENT_TYPES, { each: true })
  eventTypes: string[];
}

export class UpdateWebhookEndpointDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) url?: string;

  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(200)
  @Matches(/^\S+$/, { message: 'secret must not contain spaces' })
  secret?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(WEBHOOK_EVENT_TYPES, { each: true })
  eventTypes?: string[];

  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class DeliveryQueryDto {
  @IsOptional() @IsString() endpointId?: string;
  @IsOptional() @IsIn(['PENDING', 'DELIVERING', 'SUCCEEDED', 'FAILED']) status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}
