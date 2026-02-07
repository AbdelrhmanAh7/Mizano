import { IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Request DTOs

export class AnalyzeContractDto {
  @ApiProperty({ description: 'Contract text to analyze', example: 'This agreement is entered into between Party A and Party B...' })
  @IsString()
  @MinLength(1)
  text: string;
}

// Response DTOs

export class ContractClauseDto {
  @ApiProperty({ description: 'Clause type', example: 'termination' })
  type: string;

  @ApiProperty({ description: 'Clause text content' })
  text: string;

  @ApiProperty({
    description: 'Risk level of the clause',
    enum: ['low', 'medium', 'high'],
    example: 'medium',
  })
  risk: 'low' | 'medium' | 'high';
}

export class ContractDeadlineDto {
  @ApiProperty({ description: 'Deadline description' })
  description: string;

  @ApiProperty({ description: 'Deadline date' })
  date: string;
}

export class ContractDatesDto {
  @ApiPropertyOptional({ description: 'Contract start date', example: '2024-01-01' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'Contract end date', example: '2025-01-01' })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Contract renewal date', example: '2024-12-01' })
  renewalDate?: string;

  @ApiProperty({
    description: 'Key deadlines found in the contract',
    type: [ContractDeadlineDto],
  })
  deadlines: ContractDeadlineDto[];
}

export class ContractAnalysisResultDto {
  @ApiProperty({ description: 'Parties involved in the contract', type: [String], example: ['Party A', 'Party B'] })
  parties: string[];

  @ApiProperty({ description: 'Contract dates information', type: ContractDatesDto })
  dates: ContractDatesDto;

  @ApiProperty({ description: 'Key terms identified', type: [String], example: ['net-30 payment', 'auto-renewal'] })
  keyTerms: string[];

  @ApiProperty({ description: 'Contract clauses analyzed', type: [ContractClauseDto] })
  clauses: ContractClauseDto[];

  @ApiProperty({ description: 'Overall risk score (0-100)', example: 45 })
  riskScore: number;

  @ApiProperty({ description: 'Risk factors identified', type: [String], example: ['Auto-renewal clause', 'No liability cap'] })
  riskFactors: string[];
}

export class ContractObligationsDto {
  @ApiProperty({ description: 'Party responsible' })
  party: string;

  @ApiProperty({ description: 'Obligation description' })
  obligation: string;

  @ApiPropertyOptional({ description: 'Due date for the obligation' })
  dueDate?: string;

  @ApiProperty({
    description: 'Priority level',
    enum: ['low', 'medium', 'high'],
  })
  priority: 'low' | 'medium' | 'high';
}

export class ContractRiskAnalysisDto {
  @ApiProperty({ description: 'Overall risk score (0-100)', example: 55 })
  riskScore: number;

  @ApiProperty({
    description: 'Risk level',
    enum: ['low', 'medium', 'high', 'critical'],
    example: 'medium',
  })
  riskLevel: 'low' | 'medium' | 'high' | 'critical';

  @ApiProperty({ description: 'Risk factors identified', type: [String] })
  riskFactors: string[];

  @ApiProperty({ description: 'Recommendations to mitigate risks', type: [String] })
  recommendations: string[];
}
