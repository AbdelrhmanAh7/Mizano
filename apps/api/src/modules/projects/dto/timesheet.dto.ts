import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { TimesheetStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { IsStrictBoolean } from '../../../common/dto/strict-boolean';

/** Hours are Decimal(10, 2): at most 8 integer digits and 2 decimals, sent as a string. */
const HOURS_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;
const HOURS_MESSAGE =
  'hours must be a non-negative decimal string with at most 8 integer digits and 2 decimal places';

/**
 * These were TypeScript interfaces, which erase at runtime: the global ValidationPipe saw
 * `Object` and validated nothing, so a missing date or a made-up project reached Prisma and
 * came back as a 500.
 */
export class CreateTimesheetDto {
  @ApiProperty({ description: 'A live project of the same organization' })
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @ApiProperty({ required: false, description: 'A live task of that project' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  taskId?: string;

  @ApiProperty({ example: '2026-10-31' })
  @IsISO8601()
  date: string;

  @ApiProperty({ example: '7.50' })
  @IsString()
  @Matches(HOURS_PATTERN, { message: HOURS_MESSAGE })
  hours: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsStrictBoolean()
  isBillable?: boolean;
}

/** The project and task of an entry are fixed once it is logged. */
export class UpdateTimesheetDto extends PartialType(
  OmitType(CreateTimesheetDto, ['projectId', 'taskId'] as const),
) {}

export class StartTimerDto {
  @ApiProperty({ description: 'A live project of the same organization' })
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @ApiProperty({ required: false, description: 'A live task of that project' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  taskId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class TimesheetQueryDto extends PaginationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiProperty({ required: false, example: '2026-10-01' })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiProperty({ required: false, example: '2026-10-31' })
  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @ApiProperty({ required: false, enum: TimesheetStatus })
  @IsOptional()
  @IsEnum(TimesheetStatus)
  status?: TimesheetStatus;

  /** Read from the raw query: implicit conversion would turn "false" into `true`. */
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return raw;
  })
  @IsBoolean()
  isBilled?: boolean;
}

export class WeeklySummaryQueryDto {
  @ApiProperty({ required: false, example: '2026-10-26' })
  @IsOptional()
  @IsISO8601()
  weekStart?: string;

  @ApiProperty({ required: false, description: 'Alias of weekStart' })
  @IsOptional()
  @IsISO8601()
  weekStartDate?: string;
}

export class TimesheetReportQueryDto {
  @ApiProperty({ example: '2026-10-01' })
  @IsISO8601()
  startDate: string;

  @ApiProperty({ example: '2026-10-31' })
  @IsISO8601()
  endDate: string;

  @ApiProperty({ required: false, enum: ['user', 'project'], default: 'user' })
  @IsOptional()
  @IsIn(['user', 'project'])
  groupBy?: 'user' | 'project';
}
