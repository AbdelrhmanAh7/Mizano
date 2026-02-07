import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class KnowledgeSearchResultDto {
  @ApiProperty({
    description: 'Title of the knowledge article or document',
    example: 'How to create a journal entry',
  })
  title: string;

  @ApiProperty({
    description: 'Brief description or excerpt of the content',
    example: 'Journal entries are used to record financial transactions...',
  })
  description: string;

  @ApiProperty({
    description: 'Relevance score of the result (0-1)',
    example: 0.87,
  })
  relevanceScore: number;

  @ApiProperty({
    description: 'Source module or category of the knowledge',
    example: 'accounting',
  })
  source: string;

  @ApiProperty({
    description: 'When the knowledge article was created',
    example: '2026-01-15T08:00:00.000Z',
  })
  createdAt: string;
}

export class KnowledgeSearchResponseDto {
  @ApiProperty({
    description: 'List of matching knowledge results',
    type: [KnowledgeSearchResultDto],
  })
  results: KnowledgeSearchResultDto[];

  @ApiProperty({
    description: 'Total number of matching results',
    example: 42,
  })
  totalResults: number;
}

export class KnowledgeSuggestionDto {
  @ApiProperty({
    description: 'Title of the suggested knowledge article',
    example: 'Understanding double-entry bookkeeping',
  })
  title: string;

  @ApiProperty({
    description: 'Brief description of the suggestion',
    example: 'Learn the fundamentals of double-entry accounting...',
  })
  description: string;

  @ApiProperty({
    description: 'How relevant this suggestion is to the current context (0-1)',
    example: 0.75,
  })
  relevance: number;
}

export class IndexResultDto {
  @ApiProperty({
    description: 'Number of documents successfully indexed',
    example: 156,
  })
  indexed: number;

  @ApiProperty({
    description: 'Total number of documents processed',
    example: 160,
  })
  totalDocuments: number;
}
