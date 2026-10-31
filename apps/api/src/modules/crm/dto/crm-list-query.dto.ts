import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Offset paging shared by the CRM lists (leads, deals, activities). */
export class CrmListQueryDto {
  @ApiProperty({ required: false, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiProperty({ required: false, description: 'Used when offset is not sent' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

/** The `take`/`skip` of a CRM list, from offset or page (default 50 rows). */
export function crmPage(query: CrmListQueryDto): { take: number; skip: number } {
  const take = query.limit || 50;
  const skip = query.offset ?? ((query.page ?? 1) - 1) * take;
  return { take, skip };
}

/** `?limit=` of the per-record activity lists. */
export class CrmLimitQueryDto {
  @ApiProperty({ required: false, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
