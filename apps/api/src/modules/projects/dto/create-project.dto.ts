import { IsString, IsNotEmpty, IsOptional, IsEnum, IsArray, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ProjectStatus, BillingMethod } from '@prisma/client';

export class CreateProjectDto {
  @ApiProperty({ example: 'Website Redesign' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiProperty({ required: false, enum: ProjectStatus, default: ProjectStatus.PLANNING })
  @IsEnum(ProjectStatus)
  @IsOptional()
  status?: ProjectStatus;

  @ApiProperty({ required: false, enum: BillingMethod, default: BillingMethod.HOURLY })
  @IsEnum(BillingMethod)
  @IsOptional()
  billingMethod?: BillingMethod;

  @ApiProperty({ required: false, example: '150.00' })
  @IsString()
  @IsOptional()
  hourlyRate?: string;

  @ApiProperty({ required: false, example: '10000.00' })
  @IsString()
  @IsOptional()
  fixedPrice?: string;

  @ApiProperty({ required: false, example: '25000.00' })
  @IsString()
  @IsOptional()
  budget?: string;

  @ApiProperty({ required: false, example: '2026-01-01' })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ required: false, example: '2026-12-31' })
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({ required: false, default: '#3B82F6' })
  @IsString()
  @IsOptional()
  @MaxLength(7)
  color?: string;

  @ApiProperty({ required: false, default: [], type: [String] })
  @IsArray()
  @IsOptional()
  tags?: string[];
}
