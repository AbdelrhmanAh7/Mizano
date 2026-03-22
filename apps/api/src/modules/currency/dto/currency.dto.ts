import { IsString, IsNumber, IsOptional, IsDateString, IsEnum, Min, Length } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============ Enums ============

export enum CurrencySource {
  MANUAL = 'MANUAL',
  AUTO = 'AUTO',
}

// Common currency codes
export const SUPPORTED_CURRENCIES = [
  'SAR',
  'USD',
  'EUR',
  'GBP',
  'AED',
  'KWD',
  'BHD',
  'OMR',
  'QAR',
  'EGP',
  'JOD',
  'LBP',
  'MAD',
  'TND',
  'IQD',
  'SYP',
  'YER',
  'INR',
  'PKR',
  'CNY',
  'JPY',
  'TRY',
  'CHF',
  'AUD',
  'CAD',
];

// ============ Exchange Rate DTOs ============

export class CreateExchangeRateDto {
  @ApiProperty({ description: 'Source currency ISO code', example: 'USD' })
  @IsString()
  @Length(3, 3)
  fromCurrency: string;

  @ApiProperty({ description: 'Target currency ISO code', example: 'SAR' })
  @IsString()
  @Length(3, 3)
  toCurrency: string;

  @ApiProperty({ description: 'Exchange rate value', example: 3.75 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  rate: number;

  @ApiProperty({ description: 'Rate effective date' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ enum: CurrencySource, default: CurrencySource.MANUAL })
  @IsOptional()
  @IsEnum(CurrencySource)
  source?: CurrencySource = CurrencySource.MANUAL;
}

export class UpdateExchangeRateDto {
  @ApiProperty({ description: 'Exchange rate value' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  rate: number;

  @ApiPropertyOptional({ enum: CurrencySource })
  @IsOptional()
  @IsEnum(CurrencySource)
  source?: CurrencySource;
}

export class ExchangeRateQueryDto {
  @ApiPropertyOptional({ description: 'Source currency' })
  @IsOptional()
  @IsString()
  fromCurrency?: string;

  @ApiPropertyOptional({ description: 'Target currency' })
  @IsOptional()
  @IsString()
  toCurrency?: string;

  @ApiPropertyOptional({ description: 'Start date' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 50;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  offset?: number = 0;
}

// ============ Conversion DTOs ============

export class ConvertAmountDto {
  @ApiProperty({ description: 'Amount to convert' })
  @Type(() => Number)
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Source currency ISO code', example: 'USD' })
  @IsString()
  @Length(3, 3)
  fromCurrency: string;

  @ApiProperty({ description: 'Target currency ISO code', example: 'SAR' })
  @IsString()
  @Length(3, 3)
  toCurrency: string;

  @ApiPropertyOptional({ description: 'Date for the rate (defaults to today)' })
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class ConversionResultDto {
  @ApiProperty()
  originalAmount: number;

  @ApiProperty()
  convertedAmount: number;

  @ApiProperty()
  fromCurrency: string;

  @ApiProperty()
  toCurrency: string;

  @ApiProperty()
  rate: number;

  @ApiProperty()
  rateDate: Date;

  @ApiProperty()
  rateSource: string;
}

// ============ Gain/Loss DTOs ============

export class GainLossCalculationDto {
  @ApiProperty({ description: 'Original amount in foreign currency' })
  @Type(() => Number)
  @IsNumber()
  originalAmount: number;

  @ApiProperty({ description: 'Original exchange rate at transaction date' })
  @Type(() => Number)
  @IsNumber()
  originalRate: number;

  @ApiProperty({ description: 'Current exchange rate' })
  @Type(() => Number)
  @IsNumber()
  currentRate: number;

  @ApiProperty({ description: 'Transaction type (receivable or payable)' })
  @IsEnum(['receivable', 'payable'])
  transactionType: 'receivable' | 'payable';
}

export class GainLossResultDto {
  @ApiProperty()
  originalBaseAmount: number;

  @ApiProperty()
  currentBaseAmount: number;

  @ApiProperty({ description: 'Positive = gain, Negative = loss' })
  gainLoss: number;

  @ApiProperty()
  isGain: boolean;

  @ApiProperty({ description: 'Percentage change' })
  percentageChange: number;
}

// ============ Response DTOs ============

export class ExchangeRateResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  fromCurrency: string;

  @ApiProperty()
  toCurrency: string;

  @ApiProperty()
  rate: number;

  @ApiProperty()
  date: Date;

  @ApiProperty()
  source: string;

  @ApiProperty()
  createdAt: Date;
}

export class ExchangeRateListResponse {
  @ApiProperty({ type: [ExchangeRateResponse] })
  data: ExchangeRateResponse[];

  @ApiProperty()
  total: number;
}

export class CurrencyInfoResponse {
  @ApiProperty()
  baseCurrency: string;

  @ApiProperty({ type: [String] })
  supportedCurrencies: string[];

  @ApiProperty({ type: [ExchangeRateResponse] })
  latestRates: ExchangeRateResponse[];
}
