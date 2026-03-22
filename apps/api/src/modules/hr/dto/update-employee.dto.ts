import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEmail,
  IsObject,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';

export class UpdateEmployeeDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  dateOfJoining?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  department?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  jobTitle?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  basicSalary?: string;

  @ApiProperty({ required: false, type: Object })
  @IsObject()
  @IsOptional()
  allowances?: Prisma.InputJsonValue;

  @ApiProperty({ required: false, type: Object })
  @IsObject()
  @IsOptional()
  deductions?: Prisma.InputJsonValue;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  bankAccount?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
