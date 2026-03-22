import { ApiProperty } from '@nestjs/swagger';

export class MonthlyDataPointDto {
  @ApiProperty({ description: 'Month in YYYY-MM format' })
  month: string;

  @ApiProperty({ description: 'Value for the month' })
  value: number;
}

export class ResourceTrendDto {
  @ApiProperty({ description: 'Resource category (e.g., revenue, expenses, payroll)' })
  category: string;

  @ApiProperty({
    description: 'Monthly data points for the category',
    type: [MonthlyDataPointDto],
  })
  monthlyData: MonthlyDataPointDto[];

  @ApiProperty({ description: 'Trend direction description' })
  trend: string;

  @ApiProperty({
    description: 'Trend direction indicator',
    enum: ['up', 'down', 'stable'],
  })
  trendDirection: 'up' | 'down' | 'stable';
}

export class ForecastDataPointDto {
  @ApiProperty({ description: 'Month in YYYY-MM format' })
  month: string;

  @ApiProperty({ description: 'Value for the month (actual or predicted)' })
  value: number;
}

export class ResourceForecastDto {
  @ApiProperty({
    description: 'Historical data points',
    type: [ForecastDataPointDto],
  })
  historical: ForecastDataPointDto[];

  @ApiProperty({
    description: 'Forecasted data points',
    type: [ForecastDataPointDto],
  })
  forecast: ForecastDataPointDto[];
}

export class OptimizationOpportunityDto {
  @ApiProperty({ description: 'Type of optimization opportunity' })
  type: string;

  @ApiProperty({ description: 'Resource category this opportunity relates to' })
  category: string;

  @ApiProperty({ description: 'Description of the optimization opportunity' })
  description: string;

  @ApiProperty({ description: 'Potential monetary savings' })
  potentialSavings: number;

  @ApiProperty({
    description: 'Priority level of the opportunity',
    enum: ['LOW', 'MEDIUM', 'HIGH'],
  })
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
}

export class CategoryEfficiencyDto {
  @ApiProperty({ description: 'Category name' })
  category: string;

  @ApiProperty({ description: 'Efficiency score for the category (0-100)' })
  efficiency: number;
}

export class EfficiencyMetricsDto {
  @ApiProperty({ description: 'Revenue to expense ratio' })
  revenueToExpense: number;

  @ApiProperty({ description: 'Revenue per employee' })
  revenuePerEmployee: number;

  @ApiProperty({
    description: 'Efficiency breakdown by category',
    type: [CategoryEfficiencyDto],
  })
  categoryEfficiency: CategoryEfficiencyDto[];

  @ApiProperty({
    description: 'Overall efficiency trend direction',
    enum: ['improving', 'declining', 'stable'],
  })
  trend: 'improving' | 'declining' | 'stable';
}
