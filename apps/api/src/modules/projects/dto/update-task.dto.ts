import { IsString, IsOptional, IsEnum, IsBoolean, IsArray, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TaskStatus, TaskPriority } from '@prisma/client';

export class UpdateTaskDto {
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
  assigneeId?: string;

  @ApiProperty({ required: false, enum: TaskStatus })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @ApiProperty({ required: false, enum: TaskPriority })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  ratePerHour?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isBillable?: boolean;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  estimatedHours?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  dueDate?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsArray()
  @IsOptional()
  tags?: string[];
}
