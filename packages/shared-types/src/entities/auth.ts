// ============================================
// Auth, User, Role & Organization Types
// ============================================

import { UserStatus, Permission } from '../enums';
import { BaseEntity } from './base';

// --- Auth ---

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  organization: Organization;
  tokens: AuthTokens;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// --- User ---

export interface User extends BaseEntity {
  email: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  status: UserStatus;
  roleId: string;
  role?: Role;
  organizationId: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  roleId: string;
}

export interface UpdateUserRequest {
  email?: string;
  name?: string;
  roleId?: string;
  status?: UserStatus;
}

// --- User Preferences ---

export interface UserPreferences extends BaseEntity {
  userId: string;
  tourProgress?: Record<string, unknown> | null;
  tourDismissed: string[];
  lastTourSeenAt?: string | null;
  theme?: string | null;
  sidebarCollapsed: boolean;
  dashboardLayout?: Record<string, unknown> | null;
  notificationPrefs?: Record<string, unknown> | null;
}

// --- Role ---

export interface Role extends BaseEntity {
  name: string;
  description?: string | null;
  permissions: RolePermission[];
  isDefault: boolean;
  organizationId: string;
}

export interface RolePermission {
  id: string;
  module: string;
  actions: Permission[];
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  permissions: { module: string; actions: Permission[] }[];
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  permissions?: { module: string; actions: Permission[] }[];
}

// --- Organization ---

export interface Organization {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  currency: string;
  taxId?: string | null;
  lockDate?: string | null;
  baseCurrency: string;
  website?: string | null;
  taxRegistrationNumber?: string | null;
  industry?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateOrganizationRequest {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  currency?: string;
  taxId?: string;
}

// --- Organization Settings ---

export interface GeneralSettings {
  name?: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  taxRegistrationNumber?: string;
  industry?: string;
  baseCurrency?: string;
}

export interface FinancialSettings {
  fiscalYearStartMonth?: number;
  lockDate?: string;
  defaultPaymentTermsDays?: number;
  defaultTaxRateId?: string;
}

export interface InvoiceSettings {
  invoicePrefix?: string;
  invoiceNextNumber?: number;
  invoiceDefaultNotes?: string;
  invoiceDefaultTerms?: string;
  invoiceAutoSend?: boolean;
  bankDetails?: string;
  quotePrefix?: string;
  quoteNextNumber?: number;
  billPrefix?: string;
  billNextNumber?: number;
}

export interface InventorySettings {
  defaultValuationMethod?: string;
  enableMultiWarehouse?: boolean;
  enableBundles?: boolean;
}

export interface AiSettings {
  aiCategorizationEnabled?: boolean;
  aiReconciliationEnabled?: boolean;
  aiOcrEnabled?: boolean;
  aiForecastingEnabled?: boolean;
  aiAnomalyEnabled?: boolean;
  aiLeadScoringEnabled?: boolean;
  aiRetrainingFrequency?: string;
  anomalySensitivity?: number;
}

export interface EmailSettings {
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpFromEmail?: string;
  smtpFromName?: string;
}

export interface LocalizationSettings {
  dateFormat?: string;
  numberFormat?: string;
  timezone?: string;
}

export interface BrandingSettings {
  logoUrl?: string;
  primaryColor?: string;
  footerText?: string;
}

export interface AccountSettings {
  defaultArAccountId?: string;
  defaultRevenueAccountId?: string;
  defaultVatPayableAccountId?: string;
  defaultApAccountId?: string;
  defaultVatReceivableAccountId?: string;
  defaultBankAccountId?: string;
  defaultCashAccountId?: string;
  defaultSalesReturnsAccountId?: string;
}

export interface AllSettings {
  general: GeneralSettings;
  financial: FinancialSettings;
  invoice: InvoiceSettings;
  inventory: InventorySettings;
  ai: AiSettings;
  email: EmailSettings;
  localization: LocalizationSettings;
  branding: BrandingSettings;
  accounts: AccountSettings;
}

// --- Onboarding ---

export interface OrganizationOnboarding {
  id: string;
  organizationId: string;
  companyInfoCompleted: boolean;
  chartOfAccountsCompleted: boolean;
  taxConfigCompleted: boolean;
  openingBalancesCompleted: boolean;
  importDataCompleted: boolean;
  aiFeaturesCompleted: boolean;
  tourCompleted: boolean;
  selectedIndustry?: string | null;
  selectedCoaTemplate?: string | null;
  skippedSteps: string[];
  completedAt?: string | null;
}
