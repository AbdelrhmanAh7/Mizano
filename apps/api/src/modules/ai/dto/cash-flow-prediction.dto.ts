import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsDate,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum WhatIfScenarioType {
  DELAY_CUSTOMER = 'delay_customer',
  EARLY_PAYMENT = 'early_payment',
  NEW_EXPENSE = 'new_expense',
  REVENUE_CHANGE = 'revenue_change',
}

export class WhatIfScenarioDto {
  @ApiProperty({
    description: 'Scenario type',
    enum: WhatIfScenarioType,
  })
  @IsEnum(WhatIfScenarioType)
  type: WhatIfScenarioType;

  @ApiPropertyOptional({ description: 'Customer ID for delay scenario' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Number of days to delay' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(90)
  delayDays?: number;

  @ApiPropertyOptional({ description: 'Bill ID for early payment scenario' })
  @IsOptional()
  @IsString()
  billId?: string;

  @ApiPropertyOptional({ description: 'New expense amount' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  expenseAmount?: number;

  @ApiPropertyOptional({ description: 'New expense date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expenseDate?: Date;

  @ApiPropertyOptional({
    description: 'Revenue change percentage (positive or negative)',
  })
  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  revenueChange?: number;
}

export class ForecastQueryDto {
  @ApiPropertyOptional({
    description: 'Forecast horizon in days',
    default: 90,
    minimum: 7,
    maximum: 365,
  })
  @IsOptional()
  @IsNumber()
  @Min(7)
  @Max(365)
  @Type(() => Number)
  horizon?: number;
}

// Response DTOs
export class CashFlowForecastPointResponse {
  @ApiProperty({ description: 'Forecast date' })
  date: Date;

  @ApiProperty({ description: 'Opening balance' })
  openingBalance: number;

  @ApiProperty({ description: 'Expected inflows' })
  inflows: {
    ar: number;
    other: number;
  };

  @ApiProperty({ description: 'Expected outflows' })
  outflows: {
    ap: number;
    payroll: number;
    recurring: number;
  };

  @ApiProperty({ description: 'Closing balance percentiles' })
  closingBalance: {
    p10: number;
    p50: number;
    p90: number;
  };

  @ApiProperty({ description: 'Alerts for this day' })
  alerts: string[];
}

export class CashFlowPredictionResponse {
  @ApiProperty({ type: [CashFlowForecastPointResponse] })
  forecasts: CashFlowForecastPointResponse[];

  @ApiProperty({ description: 'Summary statistics' })
  summary: {
    currentCash: number;
    lowestPoint: {
      date: Date;
      amount: number;
    };
    daysUntilNegative: number | null;
    totalExpectedInflows: number;
    totalExpectedOutflows: number;
  };

  @ApiProperty({
    description: 'Confidence level',
    enum: ['high', 'medium', 'low'],
  })
  confidence: 'high' | 'medium' | 'low';

  @ApiProperty({
    description: 'Prediction method used',
    enum: ['ML', 'RULE_BASED', 'HYBRID'],
  })
  predictionMethod: 'ML' | 'RULE_BASED' | 'HYBRID';
}

export class QuickForecastResponse {
  @ApiProperty({ description: 'Next 7 days forecast' })
  next7Days: {
    low: number;
    expected: number;
    high: number;
  };

  @ApiProperty({ description: 'Next 30 days forecast' })
  next30Days: {
    low: number;
    expected: number;
    high: number;
  };

  @ApiProperty({ description: 'Next 90 days forecast' })
  next90Days: {
    low: number;
    expected: number;
    high: number;
  };

  @ApiProperty({ description: 'Critical dates requiring attention' })
  criticalDates: Array<{
    date: Date;
    reason: string;
    impact: number;
  }>;
}

export class CashFlowScenarioResponse {
  @ApiProperty({ description: 'Scenario name' })
  name: string;

  @ApiProperty({ description: 'Daily balance forecasts' })
  forecasts: Array<{
    date: Date;
    balance: number;
  }>;

  @ApiProperty({ description: 'Lowest balance point' })
  lowestPoint: {
    date: Date;
    amount: number;
  };

  @ApiProperty({ description: 'Days until negative balance' })
  daysUntilNegative: number | null;
}

export class ScenariosResponse {
  @ApiProperty({ type: CashFlowScenarioResponse })
  optimistic: CashFlowScenarioResponse;

  @ApiProperty({ type: CashFlowScenarioResponse })
  expected: CashFlowScenarioResponse;

  @ApiProperty({ type: CashFlowScenarioResponse })
  pessimistic: CashFlowScenarioResponse;
}

export class CashFlowAlertResponse {
  @ApiProperty({
    description: 'Alert type',
    enum: ['warning', 'critical'],
  })
  type: 'warning' | 'critical';

  @ApiProperty({ description: 'Alert date' })
  date: Date;

  @ApiProperty({ description: 'Alert message' })
  message: string;

  @ApiProperty({ description: 'Suggested action' })
  suggestedAction: string;
}

export class WhatIfResultResponse {
  @ApiProperty({ type: [CashFlowForecastPointResponse] })
  baseline: CashFlowForecastPointResponse[];

  @ApiProperty({ type: [CashFlowForecastPointResponse] })
  adjusted: CashFlowForecastPointResponse[];

  @ApiProperty({ description: 'Impact analysis' })
  impact: {
    totalChange: number;
    daysUntilNegativeChange: number | null;
  };
}

export class RecalculateResultResponse {
  @ApiProperty({ description: 'Number of forecasts updated' })
  updated: number;
}
