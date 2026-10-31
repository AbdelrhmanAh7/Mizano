import { ApiProperty, PartialType } from '@nestjs/swagger';
import { LeadSource, LeadStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { CrmListQueryDto } from './crm-list-query.dto';
import { IsDecimalString } from '../../../common/dto/decimal-string';
import { IsStrictBoolean } from '../../../common/dto/strict-boolean';

/**
 * These were TypeScript interfaces, which erase at runtime: the global ValidationPipe saw
 * `Object` and validated nothing, so an unknown source or a malformed email reached Prisma
 * and came back as a 500.
 */
export class CreateLeadDto {
  @ApiProperty({ example: 'Sara Ahmed' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  leadName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiProperty({ required: false, enum: LeadSource })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @ApiProperty({ required: false, enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;

  @ApiProperty({ required: false, description: 'A user of the same organization' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  assignedToId?: string;
}

export class UpdateLeadDto extends PartialType(CreateLeadDto) {}

export class LeadQueryDto extends CrmListQueryDto {
  @ApiProperty({ required: false, enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiProperty({ required: false, enum: LeadSource })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;
}

export class ConvertLeadDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsStrictBoolean()
  createDeal?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  dealName?: string;

  @ApiProperty({ required: false, example: '5000.00' })
  @IsOptional()
  @IsString()
  @IsDecimalString()
  expectedAmount?: string;
}

/** Assign a lead or a deal to a user of the same organization. */
export class AssignCrmRecordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  assignedToId: string;
}

export class BulkAssignLeadsDto extends AssignCrmRecordDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  leadIds: string[];
}

/** The leads table filters by status and source on top of the cursor paging. */
export class LeadCursorQueryDto extends CursorPaginationDto {
  @ApiProperty({ required: false, enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiProperty({ required: false, enum: LeadSource })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;
}
