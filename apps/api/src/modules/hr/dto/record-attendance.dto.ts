import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';

export class RecordAttendanceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @ApiProperty({ example: '2024-01-15' })
  @IsDateString()
  date: string;

  @ApiProperty({ required: false, example: '2024-01-15T09:00:00Z' })
  @IsDateString()
  @IsOptional()
  checkIn?: string;

  @ApiProperty({ required: false, example: '2024-01-15T17:00:00Z' })
  @IsDateString()
  @IsOptional()
  checkOut?: string;

  @ApiProperty({ required: false, enum: AttendanceStatus, default: AttendanceStatus.PRESENT })
  @IsEnum(AttendanceStatus)
  @IsOptional()
  status?: AttendanceStatus;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
