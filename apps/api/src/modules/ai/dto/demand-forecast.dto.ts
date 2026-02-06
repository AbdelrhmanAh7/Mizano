import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ForecastParamsDto {
  @ApiPropertyOptional({
    description: 'Number of months to forecast',
    default: 6,
    minimum: 1,
    maximum: 24,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(24)
  horizon?: number;

  @ApiPropertyOptional({
    description: 'Level smoothing parameter (alpha)',
    default: 0.3,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  alpha?: number;

  @ApiPropertyOptional({
    description: 'Trend smoothing parameter (beta)',
    default: 0.1,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  beta?: number;

  @ApiPropertyOptional({
    description: 'Seasonal smoothing parameter (gamma)',
    default: 0.3,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  gamma?: number;

  @ApiPropertyOptional({
    description: 'Season length in periods',
    default: 12,
  })
  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(52)
  seasonLength?: number;
}

export class HolidayConfigItemDto {
  @ApiProperty({ description: 'Holiday name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Month (1-12)' })
  @IsNumber()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({ description: 'Demand multiplier (e.g., 1.5 for 50% increase)' })
  @IsNumber()
  @Min(0)
  @Max(5)
  multiplier: number;

  @ApiPropertyOptional({ description: 'Item categories affected' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];
}

class RamadanConfigDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(5)
  multiplier: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];
}

class EidConfigDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(5)
  multiplier: number;
}

export class HolidayConfigDto {
  @ApiPropertyOptional({ description: 'Ramadan configuration' })
  @IsOptional()
  @ValidateNested()
  @Type(() => RamadanConfigDto)
  ramadan?: RamadanConfigDto;

  @ApiPropertyOptional({ description: 'Eid configuration' })
  @IsOptional()
  @ValidateNested()
  @Type(() => EidConfigDto)
  eid?: EidConfigDto;

  @ApiPropertyOptional({ description: 'Custom holidays' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HolidayConfigItemDto)
  customHolidays?: HolidayConfigItemDto[];
}

// Response DTOs
export class ForecastPointResponse {
  @ApiProperty({ description: 'Forecast date' })
  date: Date;

  @ApiProperty({ description: 'Predicted demand quantity' })
  predicted: number;

  @ApiProperty({ description: 'Lower bound (80% confidence)' })
  lowerBound: number;

  @ApiProperty({ description: 'Upper bound (80% confidence)' })
  upperBound: number;

  @ApiProperty({ description: 'Seasonal index for this period' })
  seasonalIndex: number;
}

export class DemandForecastResponse {
  @ApiProperty({ type: [ForecastPointResponse] })
  forecasts: ForecastPointResponse[];

  @ApiProperty({
    description: 'Model parameters',
    example: { level: 100, trend: 2.5, mape: 12.3 },
  })
  model: {
    level: number;
    trend: number;
    seasonalIndices: number[];
    mape: number;
  };

  @ApiProperty({ description: 'Number of historical data points used' })
  dataPoints: number;

  @ApiProperty({
    description: 'Confidence level',
    enum: ['high', 'medium', 'low'],
  })
  confidence: 'high' | 'medium' | 'low';

  @ApiProperty({
    description: 'Forecasting method used',
    enum: ['holt-winters', 'double-exponential', 'simple-exponential'],
  })
  method: 'holt-winters' | 'double-exponential' | 'simple-exponential';
}

export class SeasonalityResponse {
  @ApiProperty({
    description: 'Pattern type',
    enum: ['seasonal', 'trending', 'stable', 'volatile'],
  })
  pattern: 'seasonal' | 'trending' | 'stable' | 'volatile';

  @ApiProperty({ description: 'Seasonality strength (0-1)' })
  seasonalStrength: number;

  @ApiProperty({ description: 'Trend strength (0-1)' })
  trendStrength: number;

  @ApiProperty({ description: 'Monthly indices (12 values)' })
  monthlyIndices: number[];

  @ApiProperty({ description: 'Peak months (1-12)' })
  peakMonths: number[];

  @ApiProperty({ description: 'Low months (1-12)' })
  lowMonths: number[];
}

export class TrendResponse {
  @ApiProperty({
    description: 'Trend direction',
    enum: ['up', 'down', 'flat'],
  })
  direction: 'up' | 'down' | 'flat';

  @ApiProperty({ description: 'Trend magnitude (% change per period)' })
  magnitude: number;

  @ApiProperty({ description: 'Statistical confidence (R-squared)' })
  confidence: number;
}

export class ForecastDashboardResponse {
  @ApiProperty({ description: 'Total inventory items' })
  totalItems: number;

  @ApiProperty({ description: 'Items with active forecasts' })
  itemsWithForecasts: number;

  @ApiProperty({ description: 'Items with high confidence forecasts' })
  highConfidenceCount: number;

  @ApiProperty({ description: 'Average MAPE across all forecasts' })
  avgMAPE: number;

  @ApiProperty({ description: 'Top growing items by trend' })
  topGrowingItems: Array<{
    itemId: string;
    itemName: string;
    growthRate: number;
  }>;

  @ApiProperty({ description: 'Top declining items by trend' })
  topDecliningItems: Array<{
    itemId: string;
    itemName: string;
    declineRate: number;
  }>;
}

export class RecalculateResponse {
  @ApiProperty({ description: 'Number of items processed' })
  processed: number;

  @ApiProperty({ description: 'Number of items skipped (insufficient data)' })
  skipped: number;

  @ApiProperty({ description: 'Error messages' })
  errors: string[];
}
