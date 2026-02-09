import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SearchResultDto {
  @ApiProperty({ description: 'Entity ID' })
  id!: string;

  @ApiProperty({ description: 'Entity type (customer, invoice, item, etc.)' })
  type!: string;

  @ApiProperty({ description: 'Display title (e.g., customer name, invoice number)' })
  title!: string;

  @ApiPropertyOptional({ description: 'Display subtitle (e.g., email, customer name)' })
  subtitle?: string;

  @ApiProperty({ description: 'Navigation path to the entity' })
  href!: string;

  @ApiProperty({ description: 'Fuzzy match relevance score (0.0–1.0)', example: 0.85 })
  score!: number;
}

export class SearchGroupDto {
  @ApiProperty({ description: 'Entity type key', example: 'customer' })
  type!: string;

  @ApiProperty({ description: 'Display label', example: 'Customers' })
  label!: string;

  @ApiProperty({ description: 'Results in this group', type: [SearchResultDto] })
  results!: SearchResultDto[];
}

export class SearchResponseDto {
  @ApiProperty({ description: 'Flat list of all results sorted by score', type: [SearchResultDto] })
  data!: SearchResultDto[];

  @ApiProperty({ description: 'Results grouped by entity type', type: [SearchGroupDto] })
  groups!: SearchGroupDto[];

  @ApiProperty({ description: 'Original search query' })
  query!: string;

  @ApiProperty({ description: 'Total number of results' })
  totalResults!: number;
}
