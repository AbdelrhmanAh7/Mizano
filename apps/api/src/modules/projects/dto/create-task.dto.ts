import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TaskStatus, TaskPriority } from '@prisma/client';

export class CreateTaskDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @ApiProperty({ example: 'Design homepage mockup' })
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
  assigneeId?: string;

  @ApiProperty({ required: false, enum: TaskStatus, default: TaskStatus.TODO })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @ApiProperty({ required: false, enum: TaskPriority, default: TaskPriority.MEDIUM })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @ApiProperty({ required: false, example: '75.00' })
  @IsString()
  @IsOptional()
  ratePerHour?: string;

  @ApiProperty({ required: false, default: true })
  @IsBoolean()
  @IsOptional()
  isBillable?: boolean;

  @ApiProperty({ required: false, example: '40' })
  @IsString()
  @IsOptional()
  estimatedHours?: string;

  @ApiProperty({ required: false, example: '2026-03-15' })
  @IsString()
  @IsOptional()
  dueDate?: string;

  @ApiProperty({ required: false, default: [], type: [String] })
  @IsArray()
  @IsOptional()
  tags?: string[];
}
