import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsEmail,
  Min,
  Max,
  IsIn,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ============================================
// GENERAL SETTINGS
// ============================================

export class GeneralSettingsDto {
  @ApiPropertyOptional({ description: 'Organization name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Logo URL' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Company address' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ description: 'Company phone' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ description: 'Company email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Company website' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ description: 'Tax registration number (VAT/CR)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxRegistrationNumber?: string;

  @ApiPropertyOptional({ description: 'Industry type' })
  @IsOptional()
  @IsString()
  @IsIn([
    'retail',
    'services',
    'construction',
    'manufacturing',
    'healthcare',
    'technology',
    'other',
  ])
  industry?: string;

  @ApiPropertyOptional({ description: 'Base currency code' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  baseCurrency?: string;
}

// ============================================
// FINANCIAL SETTINGS
// ============================================

export class FinancialSettingsDto {
  @ApiPropertyOptional({ description: 'Fiscal year start month (1-12)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  @Type(() => Number)
  fiscalYearStartMonth?: number;

  @ApiPropertyOptional({ description: 'Transaction lock date' })
  @IsOptional()
  lockDate?: Date;

  @ApiPropertyOptional({ description: 'Default payment terms in days' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  @Type(() => Number)
  defaultPaymentTermsDays?: number;

  @ApiPropertyOptional({ description: 'Default tax rate ID' })
  @IsOptional()
  @IsString()
  defaultTaxRateId?: string;
}

// ============================================
// INVOICE SETTINGS
// ============================================

export class InvoiceSettingsDto {
  @ApiPropertyOptional({ description: 'Invoice number prefix' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  invoicePrefix?: string;

  @ApiPropertyOptional({ description: 'Next invoice number' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  invoiceNextNumber?: number;

  @ApiPropertyOptional({ description: 'Default invoice notes' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  invoiceDefaultNotes?: string;

  @ApiPropertyOptional({ description: 'Default invoice terms' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  invoiceDefaultTerms?: string;

  @ApiPropertyOptional({ description: 'Auto-send invoice on creation' })
  @IsOptional()
  @IsBoolean()
  invoiceAutoSend?: boolean;

  @ApiPropertyOptional({ description: 'Bank details for payment' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bankDetails?: string;

  @ApiPropertyOptional({ description: 'Quote number prefix' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  quotePrefix?: string;

  @ApiPropertyOptional({ description: 'Next quote number' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quoteNextNumber?: number;

  @ApiPropertyOptional({ description: 'Bill number prefix' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  billPrefix?: string;

  @ApiPropertyOptional({ description: 'Next bill number' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  billNextNumber?: number;
}

// ============================================
// INVENTORY SETTINGS
// ============================================

export class InventorySettingsDto {
  @ApiPropertyOptional({ description: 'Default inventory valuation method' })
  @IsOptional()
  @IsString()
  @IsIn(['FIFO', 'LIFO', 'WEIGHTED_AVG'])
  defaultValuationMethod?: string;

  @ApiPropertyOptional({ description: 'Enable multi-warehouse support' })
  @IsOptional()
  @IsBoolean()
  enableMultiWarehouse?: boolean;

  @ApiPropertyOptional({ description: 'Enable product bundles/kits' })
  @IsOptional()
  @IsBoolean()
  enableBundles?: boolean;
}

// ============================================
// AI SETTINGS
// ============================================

export class AiSettingsDto {
  @ApiPropertyOptional({ description: 'Enable auto-categorization' })
  @IsOptional()
  @IsBoolean()
  aiCategorizationEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable bank reconciliation AI' })
  @IsOptional()
  @IsBoolean()
  aiReconciliationEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable invoice OCR' })
  @IsOptional()
  @IsBoolean()
  aiOcrEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable demand forecasting' })
  @IsOptional()
  @IsBoolean()
  aiForecastingEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable anomaly detection' })
  @IsOptional()
  @IsBoolean()
  aiAnomalyEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable lead scoring' })
  @IsOptional()
  @IsBoolean()
  aiLeadScoringEnabled?: boolean;

  @ApiPropertyOptional({ description: 'AI model retraining frequency' })
  @IsOptional()
  @IsString()
  @IsIn(['daily', 'weekly', 'monthly'])
  aiRetrainingFrequency?: string;

  @ApiPropertyOptional({ description: 'Anomaly detection sensitivity (Z-score threshold)' })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(4)
  @Type(() => Number)
  anomalySensitivity?: number;
}

// ============================================
// EMAIL SETTINGS
// ============================================

export class EmailSettingsDto {
  @ApiPropertyOptional({ description: 'SMTP server host' })
  @IsOptional()
  @IsString()
  smtpHost?: string;

  @ApiPropertyOptional({ description: 'SMTP server port' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  @Type(() => Number)
  smtpPort?: number;

  @ApiPropertyOptional({ description: 'SMTP username' })
  @IsOptional()
  @IsString()
  smtpUser?: string;

  @ApiPropertyOptional({ description: 'SMTP password' })
  @IsOptional()
  @IsString()
  smtpPassword?: string;

  @ApiPropertyOptional({ description: 'From email address' })
  @IsOptional()
  @IsEmail()
  smtpFromEmail?: string;

  @ApiPropertyOptional({ description: 'From name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  smtpFromName?: string;
}

// ============================================
// LOCALIZATION SETTINGS
// ============================================

export class LocalizationSettingsDto {
  @ApiPropertyOptional({ description: 'Date format' })
  @IsOptional()
  @IsString()
  @IsIn(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'])
  dateFormat?: string;

  @ApiPropertyOptional({ description: 'Number format' })
  @IsOptional()
  @IsString()
  @IsIn(['1,000.00', '1.000,00', '1 000,00'])
  numberFormat?: string;

  @ApiPropertyOptional({ description: 'Timezone' })
  @IsOptional()
  @IsString()
  timezone?: string;
}

// ============================================
// BRANDING SETTINGS
// ============================================

export class BrandingSettingsDto {
  @ApiPropertyOptional({ description: 'Logo URL' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Primary brand color (hex)' })
  @IsOptional()
  @IsString()
  primaryColor?: string;

  @ApiPropertyOptional({ description: 'PDF footer text' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  footerText?: string;
}

// ============================================
// COMBINED SETTINGS UPDATE DTO
// ============================================

export class UpdateAllSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  general?: GeneralSettingsDto;

  @ApiPropertyOptional()
  @IsOptional()
  financial?: FinancialSettingsDto;

  @ApiPropertyOptional()
  @IsOptional()
  invoice?: InvoiceSettingsDto;

  @ApiPropertyOptional()
  @IsOptional()
  inventory?: InventorySettingsDto;

  @ApiPropertyOptional()
  @IsOptional()
  ai?: AiSettingsDto;

  @ApiPropertyOptional()
  @IsOptional()
  email?: EmailSettingsDto;

  @ApiPropertyOptional()
  @IsOptional()
  localization?: LocalizationSettingsDto;

  @ApiPropertyOptional()
  @IsOptional()
  branding?: BrandingSettingsDto;
}

// ============================================
// RESPONSE TYPES
// ============================================

export interface AllSettingsResponse {
  general: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    taxRegistrationNumber: string | null;
    industry: string | null;
    baseCurrency: string;
  };
  financial: {
    fiscalYearStartMonth: number;
    lockDate: Date | null;
    defaultPaymentTermsDays: number;
    defaultTaxRateId: string | null;
  };
  invoice: {
    invoicePrefix: string;
    invoiceNextNumber: number;
    invoiceDefaultNotes: string | null;
    invoiceDefaultTerms: string | null;
    invoiceAutoSend: boolean;
    bankDetails: string | null;
    quotePrefix: string;
    quoteNextNumber: number;
    billPrefix: string;
    billNextNumber: number;
  };
  inventory: {
    defaultValuationMethod: string;
    enableMultiWarehouse: boolean;
    enableBundles: boolean;
  };
  ai: {
    aiCategorizationEnabled: boolean;
    aiReconciliationEnabled: boolean;
    aiOcrEnabled: boolean;
    aiForecastingEnabled: boolean;
    aiAnomalyEnabled: boolean;
    aiLeadScoringEnabled: boolean;
    aiRetrainingFrequency: string;
    anomalySensitivity: number;
  };
  email: {
    smtpHost: string | null;
    smtpPort: number | null;
    smtpUser: string | null;
    smtpFromEmail: string | null;
    smtpFromName: string | null;
    isConfigured: boolean;
  };
  localization: {
    dateFormat: string;
    numberFormat: string;
    timezone: string;
  };
  branding: {
    logoUrl: string | null;
    primaryColor: string | null;
    footerText: string | null;
  };
  accounts: {
    defaultArAccountId: string | null;
    defaultRevenueAccountId: string | null;
    defaultVatPayableAccountId: string | null;
    defaultApAccountId: string | null;
    defaultVatReceivableAccountId: string | null;
    defaultBankAccountId: string | null;
    defaultCashAccountId: string | null;
    defaultSalesReturnsAccountId: string | null;
  };
}
