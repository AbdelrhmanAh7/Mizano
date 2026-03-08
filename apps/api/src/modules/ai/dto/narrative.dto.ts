import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NarrativeMetricDto {
  @ApiProperty({ description: 'Metric label' })
  label: string;

  @ApiProperty({ description: 'Metric value' })
  value: string;

  @ApiPropertyOptional({
    description: 'Trend direction',
    enum: ['up', 'down', 'stable'],
  })
  trend?: 'up' | 'down' | 'stable';
}

export class NarrativeSectionDto {
  @ApiProperty({ description: 'Section identifier' })
  id: string;

  @ApiProperty({ description: 'Section title' })
  title: string;

  @ApiProperty({ description: 'Section content text' })
  content: string;

  @ApiPropertyOptional({
    description: 'Optional metrics for the section',
    type: [NarrativeMetricDto],
  })
  metrics?: NarrativeMetricDto[];
}

export class NarrativeAlertDto {
  @ApiProperty({
    description: 'Alert type',
    enum: ['warning', 'info', 'opportunity'],
  })
  type: 'warning' | 'info' | 'opportunity';

  @ApiProperty({ description: 'Alert message' })
  message: string;
}

export class GeneratedNarrativeResponse {
  @ApiProperty({ description: 'Narrative title' })
  title: string;

  @ApiProperty({ description: 'Period covered by the narrative' })
  period: string;

  @ApiProperty({ description: 'When the narrative was generated' })
  generatedAt: Date;

  @ApiProperty({
    description: 'Narrative sections',
    type: [NarrativeSectionDto],
  })
  sections: NarrativeSectionDto[];

  @ApiProperty({
    description: 'Alerts and warnings',
    type: [NarrativeAlertDto],
  })
  alerts: NarrativeAlertDto[];

  @ApiProperty({
    description: 'Actionable recommendations',
    type: [String],
  })
  recommendations: string[];

  @ApiPropertyOptional({ description: 'Brief summary of the narrative' })
  summary?: string;
}

export class QueryParameterDto {
  @ApiProperty({ description: 'Parameter name' })
  name: string;

  @ApiProperty({
    description: 'Parameter type',
    enum: ['date-range', 'number', 'currency', 'string'],
  })
  type: 'date-range' | 'number' | 'currency' | 'string';

  @ApiPropertyOptional({ description: 'Default value' })
  default?: unknown;
}

export class QueryTemplateResponse {
  @ApiProperty({ description: 'Unique query identifier' })
  id: string;

  @ApiProperty({ description: 'Human-readable question' })
  question: string;

  @ApiPropertyOptional({ description: 'Description of the query' })
  description?: string;

  @ApiProperty({
    description: 'Query category',
    enum: [
      'sales',
      'accounts-receivable',
      'expenses',
      'profitability',
      'inventory',
      'cash-flow',
      'accounts-payable',
    ],
  })
  category: string;

  @ApiPropertyOptional({
    description: 'Query parameters',
    type: [QueryParameterDto],
  })
  parameters?: QueryParameterDto[];

  @ApiPropertyOptional({
    description: 'Suggested chart type for visualization',
    enum: ['bar', 'line', 'pie', 'table'],
  })
  chartType?: string;
}

export class QueryResultResponse {
  @ApiProperty({ description: 'Natural language answer' })
  answer: string;

  @ApiProperty({ description: 'Raw data from the query' })
  data: unknown;

  @ApiPropertyOptional({
    description: 'Suggested chart type for visualization',
    enum: ['bar', 'line', 'pie', 'table'],
  })
  chartType?: 'bar' | 'line' | 'pie' | 'table';
}
