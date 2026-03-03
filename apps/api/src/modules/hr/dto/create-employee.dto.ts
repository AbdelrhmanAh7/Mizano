import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsEmail,
  IsObject,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';

export class CreateEmployeeDto {
  @ApiProperty({ required: false, example: 'EMP-001' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  employeeId?: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  dateOfJoining?: string;

  /** @deprecated Use dateOfJoining */
  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  hireDate?: string;

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

  /** @deprecated Use jobTitle */
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  position?: string;

  @ApiProperty({ required: false, default: '0', example: '5000.00' })
  @IsString()
  @IsOptional()
  basicSalary?: string;

  /** @deprecated Use basicSalary */
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  baseSalary?: string;

  @ApiProperty({ required: false, default: {}, type: Object })
  @IsObject()
  @IsOptional()
  allowances?: Prisma.InputJsonValue;

  @ApiProperty({ required: false, default: {}, type: Object })
  @IsObject()
  @IsOptional()
  deductions?: Prisma.InputJsonValue;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  bankAccount?: string;

  /** @deprecated Use bankAccount */
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  bankAccountNumber?: string;

  @ApiProperty({ required: false, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
