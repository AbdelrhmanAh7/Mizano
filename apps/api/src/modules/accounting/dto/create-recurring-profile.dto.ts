import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsEnum,
  IsBoolean,
  IsObject,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RecurringFrequency } from '@prisma/client';

export class CreateRecurringProfileDto {
  @ApiProperty({ example: 'Monthly Rent' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: RecurringFrequency })
  @IsEnum(RecurringFrequency)
  frequency: RecurringFrequency;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  autoPost?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  autoSend?: boolean;

  @ApiProperty({ description: 'Template data for creating the entity' })
  @IsObject()
  templateData: Record<string, any>;

  @ApiProperty({ example: 'journal', description: 'Entity type: journal, invoice, bill, expense' })
  @IsString()
  @IsNotEmpty()
  entityType: string;

  @ApiProperty({ required: false, description: 'Recurring type (overrides entityType mapping)' })
  @IsString()
  @IsOptional()
  type?: string;
}
