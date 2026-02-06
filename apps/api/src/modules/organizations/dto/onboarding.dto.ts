import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsIn,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ============================================
// STEP 1: COMPANY INFO
// ============================================

export class CompanyInfoStepDto {
  @ApiProperty({ description: 'Company name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Industry type' })
  @IsOptional()
  @IsString()
  @IsIn(['retail', 'services', 'construction', 'manufacturing', 'healthcare', 'technology', 'other'])
  industry?: string;

  @ApiPropertyOptional({ description: 'Logo URL (after upload)' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiProperty({ description: 'Base currency code' })
  @IsString()
  baseCurrency: string;

  @ApiPropertyOptional({ description: 'Company address' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Company phone' })
  @IsOptional()
  @IsString()
  phone?: string;
}

// ============================================
// STEP 2: CHART OF ACCOUNTS
// ============================================

export class ChartOfAccountsStepDto {
  @ApiProperty({ description: 'Selected COA template', enum: ['standard', 'retail', 'services', 'manufacturing', 'construction'] })
  @IsString()
  @IsIn(['standard', 'retail', 'services', 'manufacturing', 'construction'])
  template: string;

  @ApiPropertyOptional({ description: 'Apply template (creates accounts)', default: true })
  @IsOptional()
  @IsBoolean()
  applyTemplate?: boolean;
}

// ============================================
// STEP 3: TAX CONFIGURATION
// ============================================

export class TaxRateInputDto {
  @ApiProperty({ description: 'Tax rate name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Tax rate percentage' })
  @IsNumber()
  @Type(() => Number)
  rate: number;

  @ApiPropertyOptional({ description: 'Tax code' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: 'Set as default', default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class TaxConfigStepDto {
  @ApiProperty({ description: 'Tax rates to create', type: [TaxRateInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxRateInputDto)
  taxRates: TaxRateInputDto[];
}

// ============================================
// STEP 4: OPENING BALANCES
// ============================================

export class OpeningBalanceDto {
  @ApiProperty({ description: 'Account ID' })
  @IsString()
  accountId: string;

  @ApiProperty({ description: 'Opening balance amount' })
  @IsNumber()
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional({ description: 'Is debit (true) or credit (false)' })
  @IsOptional()
  @IsBoolean()
  isDebit?: boolean;
}

export class OpeningBalancesStepDto {
  @ApiProperty({ description: 'Opening balances', type: [OpeningBalanceDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningBalanceDto)
  balances: OpeningBalanceDto[];

  @ApiProperty({ description: 'Opening date' })
  @IsString()
  openingDate: string;
}

// ============================================
// STEP 5: IMPORT DATA
// ============================================

export class ImportDataStepDto {
  @ApiPropertyOptional({ description: 'Customers imported count' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  customersImported?: number;

  @ApiPropertyOptional({ description: 'Vendors imported count' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  vendorsImported?: number;

  @ApiPropertyOptional({ description: 'Items imported count' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  itemsImported?: number;

  @ApiPropertyOptional({ description: 'Skipped this step' })
  @IsOptional()
  @IsBoolean()
  skipped?: boolean;
}

// ============================================
// STEP 6: AI FEATURES
// ============================================

export class AiFeaturesStepDto {
  @ApiPropertyOptional({ description: 'Enable auto-categorization' })
  @IsOptional()
  @IsBoolean()
  categorizationEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable bank reconciliation AI' })
  @IsOptional()
  @IsBoolean()
  reconciliationEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable invoice OCR' })
  @IsOptional()
  @IsBoolean()
  ocrEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable demand forecasting' })
  @IsOptional()
  @IsBoolean()
  forecastingEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable anomaly detection' })
  @IsOptional()
  @IsBoolean()
  anomalyEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable lead scoring' })
  @IsOptional()
  @IsBoolean()
  leadScoringEnabled?: boolean;
}

// ============================================
// STEP 7: TOUR COMPLETED
// ============================================

export class TourCompletedStepDto {
  @ApiPropertyOptional({ description: 'Tour completed' })
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

// ============================================
// SKIP STEP
// ============================================

export class SkipStepDto {
  @ApiProperty({ description: 'Step to skip', enum: ['company_info', 'chart_of_accounts', 'tax_config', 'opening_balances', 'import_data', 'ai_features', 'tour'] })
  @IsString()
  @IsIn(['company_info', 'chart_of_accounts', 'tax_config', 'opening_balances', 'import_data', 'ai_features', 'tour'])
  step: string;
}

// ============================================
// ONBOARDING STATUS RESPONSE
// ============================================

export interface OnboardingStatusResponse {
  isComplete: boolean;
  completedSteps: number;
  totalSteps: number;
  steps: {
    companyInfo: { completed: boolean; skipped: boolean };
    chartOfAccounts: { completed: boolean; skipped: boolean };
    taxConfig: { completed: boolean; skipped: boolean };
    openingBalances: { completed: boolean; skipped: boolean };
    importData: { completed: boolean; skipped: boolean };
    aiFeatures: { completed: boolean; skipped: boolean };
    tour: { completed: boolean; skipped: boolean };
  };
  selectedIndustry: string | null;
  selectedCoaTemplate: string | null;
  completedAt: Date | null;
}

// ============================================
// COA TEMPLATES
// ============================================

export interface CoaTemplatePreview {
  id: string;
  name: string;
  description: string;
  accountCount: number;
  industries: string[];
  accounts: Array<{
    code: string;
    name: string;
    type: string;
  }>;
}
