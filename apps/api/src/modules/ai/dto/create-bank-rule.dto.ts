import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsObject,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RuleConditionDto {
  @ApiProperty({
    description: 'Field to check',
    enum: ['description', 'reference', 'payee', 'amount', 'type'],
    example: 'description',
  })
  @IsString()
  @IsNotEmpty()
  field: string;

  @ApiProperty({
    description: 'Comparison operator',
    enum: ['contains', 'equals', 'startsWith', 'endsWith', 'greaterThan', 'lessThan'],
    example: 'contains',
  })
  @IsString()
  @IsNotEmpty()
  operator: string;

  @ApiProperty({
    description: 'Value to compare against',
    example: 'SPOTIFY',
  })
  @IsString()
  @IsNotEmpty()
  value: string;
}

export class RuleActionDto {
  @ApiProperty({
    description: 'Action type',
    enum: ['categorize', 'createExpense', 'createIncome', 'match'],
    example: 'categorize',
  })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiPropertyOptional({
    description: 'Account ID for categorization',
    example: 'clx123...',
  })
  @IsString()
  @IsOptional()
  accountId?: string;

  @ApiPropertyOptional({
    description: 'Vendor ID for auto-matching',
    example: 'clx456...',
  })
  @IsString()
  @IsOptional()
  vendorId?: string;

  @ApiPropertyOptional({
    description: 'Customer ID for auto-matching',
    example: 'clx789...',
  })
  @IsString()
  @IsOptional()
  customerId?: string;
}

export class CreateBankRuleDto {
  @ApiProperty({
    description: 'Name of the rule',
    example: 'Auto-categorize Spotify payments',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Bank account ID (applies to specific account, or all if not specified)',
    example: 'clx123...',
  })
  @IsString()
  @IsOptional()
  bankAccountId?: string;

  @ApiProperty({
    description: 'Conditions that must all be met',
    type: [RuleConditionDto],
    example: [{ field: 'description', operator: 'contains', value: 'SPOTIFY' }],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  conditions: RuleConditionDto[];

  @ApiProperty({
    description: 'Action to take when conditions match',
    type: RuleActionDto,
    example: { type: 'categorize', accountId: 'clx123...' },
  })
  @IsObject()
  @ValidateNested()
  @Type(() => RuleActionDto)
  action: RuleActionDto;
}

export class UpdateBankRuleDto {
  @ApiPropertyOptional({
    description: 'Name of the rule',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Conditions that must all be met',
    type: [RuleConditionDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  @IsOptional()
  conditions?: RuleConditionDto[];

  @ApiPropertyOptional({
    description: 'Action to take when conditions match',
    type: RuleActionDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => RuleActionDto)
  @IsOptional()
  action?: RuleActionDto;

  @ApiPropertyOptional({
    description: 'Whether the rule is active',
  })
  @IsOptional()
  isActive?: boolean;
}
