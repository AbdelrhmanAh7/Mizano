import { IsInt, IsOptional } from 'class-validator';
import { IsStrictBoolean } from '../../../common/dto/strict-boolean';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTourProgressDto {
  @ApiProperty({ example: true, description: 'Whether the tour was completed' })
  @IsStrictBoolean()
  completed: boolean;

  @ApiProperty({
    example: 5,
    description: 'Current step number in the tour',
    required: false,
  })
  @IsInt()
  @IsOptional()
  currentStep?: number;
}
