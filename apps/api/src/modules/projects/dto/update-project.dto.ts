import { IsString, IsOptional, IsEnum, IsArray, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ProjectStatus, BillingMethod } from '@prisma/client';

export class UpdateProjectDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiProperty({ required: false, enum: ProjectStatus })
  @IsEnum(ProjectStatus)
  @IsOptional()
  status?: ProjectStatus;

  @ApiProperty({ required: false, enum: BillingMethod })
  @IsEnum(BillingMethod)
  @IsOptional()
  billingMethod?: BillingMethod;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  hourlyRate?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  fixedPrice?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  budget?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(7)
  color?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsArray()
  @IsOptional()
  tags?: string[];
}
