import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class BulkIdsDto {
  @ApiProperty({
    description: 'Array of record IDs to perform the bulk action on',
    example: ['clxxxxxxxxxxxxxxxxx1', 'clxxxxxxxxxxxxxxxxx2'],
    type: [String],
    minItems: 1,
    maxItems: 100,
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  ids: string[];
}
