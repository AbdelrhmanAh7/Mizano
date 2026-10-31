import { ApiProperty } from '@nestjs/swagger';
import { ActivityType } from '@prisma/client';
import { IsEnum, IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CrmListQueryDto } from './crm-list-query.dto';

/** The quick log routes (log-call, log-email, log-meeting, log-note): the route sets the type. */
export class LogActivityDto {
  @ApiProperty({ required: false, description: 'A live lead of the same organization' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  leadId?: string;

  @ApiProperty({ required: false, description: 'A live deal of the same organization' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  dealId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;

  @ApiProperty({ required: false, example: '2026-10-31T10:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  date?: string;
}

export class CreateActivityDto extends LogActivityDto {
  @ApiProperty({ enum: ActivityType })
  @IsEnum(ActivityType)
  type: ActivityType;
}

export class ActivityQueryDto extends CrmListQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  leadId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  dealId?: string;

  @ApiProperty({ required: false, enum: ActivityType })
  @IsOptional()
  @IsEnum(ActivityType)
  type?: ActivityType;
}
