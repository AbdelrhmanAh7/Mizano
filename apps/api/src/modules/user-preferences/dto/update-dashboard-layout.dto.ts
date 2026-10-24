import { IsArray, IsInt, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsStrictBoolean } from '../../../common/dto/strict-boolean';

class DashboardWidgetDto {
  @ApiProperty({ example: 'ai-pulse', description: 'Widget identifier' })
  @IsString()
  id: string;

  @ApiProperty({ example: true, description: 'Whether widget is visible' })
  @IsStrictBoolean()
  visible: boolean;

  @ApiProperty({ example: 0, description: 'Display order position' })
  @IsInt()
  order: number;
}

export class UpdateDashboardLayoutDto {
  @ApiProperty({
    type: [DashboardWidgetDto],
    description: 'Array of dashboard widget configurations',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardWidgetDto)
  widgets: DashboardWidgetDto[];
}
