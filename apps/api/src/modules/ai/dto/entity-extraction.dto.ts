import { IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Request DTOs

export class ExtractEntitiesDto {
  @ApiProperty({
    description: 'Text to extract entities from',
    example: 'Send payment of $5,000 to John Smith at Acme Corp by March 15, 2024',
  })
  @IsString()
  @MinLength(1)
  text: string;
}

// Response DTOs

export class ExtractedEntityDto {
  @ApiProperty({ description: 'Extracted text value', example: 'John Smith' })
  text: string;

  @ApiProperty({
    description: 'Entity type',
    example: 'person',
    enum: ['person', 'organization', 'date', 'place', 'money', 'email', 'phone'],
  })
  type: string;

  @ApiPropertyOptional({ description: 'Start position in original text', example: 28 })
  start?: number;

  @ApiPropertyOptional({ description: 'End position in original text', example: 38 })
  end?: number;
}

export class ExtractionResultDto {
  @ApiProperty({ description: 'People names found', type: [ExtractedEntityDto] })
  people: ExtractedEntityDto[];

  @ApiProperty({ description: 'Organization names found', type: [ExtractedEntityDto] })
  organizations: ExtractedEntityDto[];

  @ApiProperty({ description: 'Dates found', type: [ExtractedEntityDto] })
  dates: ExtractedEntityDto[];

  @ApiProperty({ description: 'Place names found', type: [ExtractedEntityDto] })
  places: ExtractedEntityDto[];

  @ApiProperty({ description: 'Monetary amounts found', type: [ExtractedEntityDto] })
  money: ExtractedEntityDto[];

  @ApiProperty({ description: 'Email addresses found', type: [ExtractedEntityDto] })
  emails: ExtractedEntityDto[];

  @ApiProperty({ description: 'Phone numbers found', type: [ExtractedEntityDto] })
  phones: ExtractedEntityDto[];
}

export class MatchResultDto {
  @ApiProperty({ description: 'Extracted entity', type: ExtractedEntityDto })
  entity: ExtractedEntityDto;

  @ApiProperty({ description: 'Matched database record name', example: 'Acme Corporation Ltd.' })
  matchedTo: string;

  @ApiProperty({
    description: 'Type of match (customer, vendor, employee, account)',
    example: 'vendor',
  })
  matchType: string;

  @ApiProperty({ description: 'Match confidence score (0-1)', example: 0.95 })
  confidence: number;
}
