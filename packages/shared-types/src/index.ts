// ============================================
// MIZANO ERP - Shared Types & Interfaces
// ============================================
//
// This package is the single source of truth for all
// TypeScript types shared between frontend and backend.
//
// Organization:
//   src/enums/      - All enums (synced with Prisma schema)
//   src/entities/   - Entity interfaces organized by domain
//   src/logger.types.ts - Logger-specific types
//
// Usage:
//   import { InvoiceStatus, Invoice, PaginatedResponse } from '@mizano/shared-types';
//

// --- Enums (Single Source of Truth, synced with Prisma) ---
export * from './enums';

// --- Entity Interfaces (organized by domain) ---
export * from './entities';

// --- Logger Types ---
export * from './logger.types';

// ============================================
// Backward Compatibility Aliases
// ============================================
// These aliases map old *Response/*Dto names to the new
// interface names. They allow existing code to continue
// working without immediate migration.

import type {
  // Auth
  User,
  Organization,
  Role,
  RolePermission,
  LoginRequest,
  RegisterRequest,
  RefreshTokenRequest,
  CreateUserRequest,
  UpdateUserRequest,
  CreateRoleRequest,
  UpdateOrganizationRequest,
  // Accounting
  Account,
  Journal,
  JournalLine,
  RecurringProfile,
  CreateAccountRequest,
  UpdateAccountRequest,
  CreateJournalRequest,
  CreateRecurringProfileRequest,
  // Sales
  Customer,
  Address,
  Quote,
  QuoteLine,
  Invoice,
  InvoiceLine,
  CreditNote,
  PaymentReceived,
  PaymentAllocation,
  CreateCustomerRequest,
  CreateQuoteRequest,
  CreateInvoiceRequest,
  CreateCreditNoteRequest,
  CreatePaymentReceivedRequest,
  // Purchases
  Vendor,
  Bill,
  BillLine,
  Expense,
  VendorCredit,
  PaymentMade,
  BillAllocation,
  CreateVendorRequest,
  CreateBillRequest,
  CreateExpenseRequest,
  CreateVendorCreditRequest,
  CreatePaymentMadeRequest,
  // Inventory
  Item,
  CompositeItem,
  CompositeItemComponent,
  Warehouse,
  Adjustment,
  PriceList,
  PriceListItem,
  CreateItemRequest,
  UpdateItemRequest,
  CreateCompositeItemRequest,
  CreateWarehouseRequest,
  CreateAdjustmentRequest,
  CreatePriceListRequest,
  // Banking
  BankAccount,
  BankTransaction,
  BankRule,
  BankRuleCondition,
  BankRuleAction,
  Reconciliation,
  CreateBankAccountRequest,
  CreateBankTransactionRequest,
  CreateBankRuleRequest,
  CreateReconciliationRequest,
  UpdateReconciliationRequest,
  // HR
  Employee,
  Attendance,
  PayrollRun,
  Payslip,
  CreateEmployeeRequest,
  CreateAttendanceRequest,
  CreatePayrollRunRequest,
  // Manufacturing
  BOM,
  BOMItem,
  WorkOrder,
  MaterialRequirement,
  ProductionEntry,
  CreateBOMRequest,
  CreateWorkOrderRequest,
  CreateProductionEntryRequest,
  // Projects
  Project,
  Task,
  TimesheetEntry,
  CreateProjectRequest,
  CreateTaskRequest,
  UpdateTaskRequest,
  CreateTimesheetEntryRequest,
  // Tax
  TaxRate,
  VATReturn,
  VATPayment,
  ExchangeRate,
  CreateTaxRateRequest,
  CreateVATReturnRequest,
  CreateVATPaymentRequest,
  // CRM
  Lead,
  Deal,
  ActivityLog,
  CreateLeadRequest,
  CreateDealRequest,
  CreateActivityRequest,
  // Assets
  Asset,
  DepreciationScheduleItem,
  CreateAssetRequest,
  DisposeAssetRequest,
  // AI
  AIInsight,
  // Reports
  ProfitLossReport,
  BalanceSheetReport,
  AgingReport,
  AgingBucket,
  CashFlowReport,
  CashFlowSection,
  CashFlowItem,
  ReportSection,
  ReportLineItem,
  DashboardStats,
  DashboardChartData,
  // System
  AuditLog,
  Notification,
  GlobalSearchResult,
  GlobalSearchGroup,
  GlobalSearchResponse,
  SearchHistoryEntry,
} from './entities';

// Auth aliases
/** @deprecated Use `LoginRequest` instead */
export type LoginDto = LoginRequest;
/** @deprecated Use `RegisterRequest` instead */
export type RegisterDto = RegisterRequest;
/** @deprecated Use `RefreshTokenRequest` instead */
export type RefreshTokenDto = RefreshTokenRequest;
/** @deprecated Use `User` instead */
export type UserResponse = User;
/** @deprecated Use `CreateUserRequest` instead */
export type CreateUserDto = CreateUserRequest;
/** @deprecated Use `UpdateUserRequest` instead */
export type UpdateUserDto = UpdateUserRequest;
/** @deprecated Use `Organization` instead */
export type OrganizationResponse = Organization;
/** @deprecated Use `UpdateOrganizationRequest` instead */
export type UpdateOrganizationDto = UpdateOrganizationRequest;
/** @deprecated Use `Role` instead */
export type RoleResponse = Role;
/** @deprecated Use `RolePermission` instead */
export type PermissionResponse = RolePermission;
/** @deprecated Use `CreateRoleRequest` instead */
export type CreateRoleDto = CreateRoleRequest;
/** @deprecated Use `{ module: string; actions: Permission[] }` instead */
export type CreatePermissionDto = { module: string; actions: import('./enums').Permission[] };

// Accounting aliases
/** @deprecated Use `Account` instead */
export type AccountResponse = Account;
/** @deprecated Use `CreateAccountRequest` instead */
export type CreateAccountDto = CreateAccountRequest;
/** @deprecated Use `UpdateAccountRequest` instead */
export type UpdateAccountDto = UpdateAccountRequest;
/** @deprecated Use `Journal` instead */
export type JournalResponse = Journal;
/** @deprecated Use `JournalLine` instead */
export type JournalLineResponse = JournalLine;
/** @deprecated Use `CreateJournalRequest` instead */
export type CreateJournalDto = CreateJournalRequest;
/** @deprecated Use `{ accountId: string; debit?: string; credit?: string; description?: string }` instead */
export type CreateJournalLineDto = {
  accountId: string;
  debit?: string;
  credit?: string;
  description?: string;
};
/** @deprecated Use `RecurringProfile` instead */
export type RecurringProfileResponse = RecurringProfile;
/** @deprecated Use `CreateRecurringProfileRequest` instead */
export type CreateRecurringProfileDto = CreateRecurringProfileRequest;

// Sales aliases
/** @deprecated Use `Customer` instead */
export type CustomerResponse = Customer;
/** @deprecated Use `Address` instead */
export type AddressResponse = Address;
/** @deprecated Use `Address` instead */
export type AddressDto = Address;
/** @deprecated Use `CreateCustomerRequest` instead */
export type CreateCustomerDto = CreateCustomerRequest;
/** @deprecated Use `Partial<CreateCustomerRequest>` instead */
export type UpdateCustomerDto = Partial<CreateCustomerRequest>;
/** @deprecated Use `Quote` instead */
export type QuoteResponse = Quote;
/** @deprecated Use `QuoteLine` instead */
export type QuoteLineResponse = QuoteLine;
/** @deprecated Use `CreateQuoteRequest` instead */
export type CreateQuoteDto = CreateQuoteRequest;
/** @deprecated Use inline type instead */
export type CreateQuoteLineDto = {
  itemId?: string;
  description: string;
  quantity: string;
  rate: string;
  discount?: string;
  taxRate?: string;
};
/** @deprecated Use `Invoice` instead */
export type InvoiceResponse = Invoice;
/** @deprecated Use `InvoiceLine` instead */
export type InvoiceLineResponse = InvoiceLine;
/** @deprecated Use `CreateInvoiceRequest` instead */
export type CreateInvoiceDto = CreateInvoiceRequest;
/** @deprecated Use inline type instead */
export type CreateInvoiceLineDto = {
  itemId?: string;
  description: string;
  quantity: string;
  rate: string;
  discount?: string;
  taxRate?: string;
};
/** @deprecated Use `CreditNote` instead */
export type CreditNoteResponse = CreditNote;
/** @deprecated Use `CreateCreditNoteRequest` instead */
export type CreateCreditNoteDto = CreateCreditNoteRequest;
/** @deprecated Use `PaymentReceived` instead */
export type PaymentReceivedResponse = PaymentReceived;
/** @deprecated Use `PaymentAllocation` instead */
export type PaymentAllocationResponse = PaymentAllocation;
/** @deprecated Use `CreatePaymentReceivedRequest` instead */
export type CreatePaymentReceivedDto = CreatePaymentReceivedRequest;
/** @deprecated Use inline type instead */
export type CreatePaymentAllocationDto = { invoiceId: string; amount: string };

// Purchases aliases
/** @deprecated Use `Vendor` instead */
export type VendorResponse = Vendor;
/** @deprecated Use `CreateVendorRequest` instead */
export type CreateVendorDto = CreateVendorRequest;
/** @deprecated Use `Partial<CreateVendorRequest>` instead */
export type UpdateVendorDto = Partial<CreateVendorRequest>;
/** @deprecated Use `Expense` instead */
export type ExpenseResponse = Expense;
/** @deprecated Use `CreateExpenseRequest` instead */
export type CreateExpenseDto = CreateExpenseRequest;
/** @deprecated Use `Bill` instead */
export type BillResponse = Bill;
/** @deprecated Use `BillLine` instead */
export type BillLineResponse = BillLine;
/** @deprecated Use `CreateBillRequest` instead */
export type CreateBillDto = CreateBillRequest;
/** @deprecated Use inline type instead */
export type CreateBillLineDto = {
  itemId?: string;
  accountId?: string;
  description: string;
  quantity: string;
  rate: string;
  taxRate?: string;
};
/** @deprecated Use `VendorCredit` instead */
export type VendorCreditResponse = VendorCredit;
/** @deprecated Use `CreateVendorCreditRequest` instead */
export type CreateVendorCreditDto = CreateVendorCreditRequest;
/** @deprecated Use `PaymentMade` instead */
export type PaymentMadeResponse = PaymentMade;
/** @deprecated Use `BillAllocation` instead */
export type BillAllocationResponse = BillAllocation;
/** @deprecated Use `CreatePaymentMadeRequest` instead */
export type CreatePaymentMadeDto = CreatePaymentMadeRequest;
/** @deprecated Use inline type instead */
export type CreateBillAllocationDto = { billId: string; amount: string };

// Inventory aliases
/** @deprecated Use `Item` instead */
export type ItemResponse = Item;
/** @deprecated Use `CreateItemRequest` instead */
export type CreateItemDto = CreateItemRequest;
/** @deprecated Use `UpdateItemRequest` instead */
export type UpdateItemDto = UpdateItemRequest;
/** @deprecated Use `CompositeItem` instead */
export type CompositeItemResponse = CompositeItem;
/** @deprecated Use `CompositeItemComponent` instead */
export type CompositeItemComponentResponse = CompositeItemComponent;
/** @deprecated Use `CreateCompositeItemRequest` instead */
export type CreateCompositeItemDto = CreateCompositeItemRequest;
/** @deprecated Use inline type instead */
export type CreateCompositeItemComponentDto = { itemId: string; quantity: number };
/** @deprecated Use `Warehouse` instead */
export type WarehouseResponse = Warehouse;
/** @deprecated Use `CreateWarehouseRequest` instead */
export type CreateWarehouseDto = CreateWarehouseRequest;
/** @deprecated Use `Adjustment` instead */
export type InventoryAdjustmentResponse = Adjustment;
/** @deprecated Use `CreateAdjustmentRequest` instead */
export type CreateInventoryAdjustmentDto = CreateAdjustmentRequest;
/** @deprecated Use `PriceList` instead */
export type PriceListResponse = PriceList;
/** @deprecated Use `PriceListItem` instead */
export type PriceListItemResponse = PriceListItem;
/** @deprecated Use `CreatePriceListRequest` instead */
export type CreatePriceListDto = CreatePriceListRequest;
/** @deprecated Use inline type instead */
export type CreatePriceListItemDto = { itemId: string; customPrice: string };

// Banking aliases
/** @deprecated Use `BankAccount` instead */
export type BankAccountResponse = BankAccount;
/** @deprecated Use `CreateBankAccountRequest` instead */
export type CreateBankAccountDto = CreateBankAccountRequest;
/** @deprecated Use `BankTransaction` instead */
export type BankTransactionResponse = BankTransaction;
/** @deprecated Use `CreateBankTransactionRequest` instead */
export type CreateBankTransactionDto = CreateBankTransactionRequest;
/** @deprecated Use `BankRule` instead */
export type BankRuleResponse = BankRule;
/** @deprecated Use `CreateBankRuleRequest` instead */
export type CreateBankRuleDto = CreateBankRuleRequest;
/** @deprecated Use `Reconciliation` instead */
export type ReconciliationResponse = Reconciliation;
/** @deprecated Use `CreateReconciliationRequest` instead */
export type CreateReconciliationDto = CreateReconciliationRequest;
/** @deprecated Use `UpdateReconciliationRequest` instead */
export type UpdateReconciliationDto = UpdateReconciliationRequest;

// HR aliases
/** @deprecated Use `Employee` instead */
export type EmployeeResponse = Employee;
/** @deprecated Use `CreateEmployeeRequest` instead */
export type CreateEmployeeDto = CreateEmployeeRequest;
/** @deprecated Use `Attendance` instead */
export type AttendanceResponse = Attendance;
/** @deprecated Use `CreateAttendanceRequest` instead */
export type CreateAttendanceDto = CreateAttendanceRequest;
/** @deprecated Use `PayrollRun` instead */
export type PayrollRunResponse = PayrollRun;
/** @deprecated Use `Payslip` instead */
export type PayslipResponse = Payslip;
/** @deprecated Use `CreatePayrollRunRequest` instead */
export type CreatePayrollRunDto = CreatePayrollRunRequest;

// Manufacturing aliases
/** @deprecated Use `BOM` instead */
export type BOMResponse = BOM;
/** @deprecated Use `BOMItem` instead */
export type BOMItemResponse = BOMItem;
/** @deprecated Use `CreateBOMRequest` instead */
export type CreateBOMDto = CreateBOMRequest;
/** @deprecated Use inline type instead */
export type CreateBOMItemDto = { itemId: string; quantity: number };
/** @deprecated Use `WorkOrder` instead */
export type WorkOrderResponse = WorkOrder;
/** @deprecated Use `MaterialRequirement` instead */
export type MaterialRequirementResponse = MaterialRequirement;
/** @deprecated Use `CreateWorkOrderRequest` instead */
export type CreateWorkOrderDto = CreateWorkOrderRequest;
/** @deprecated Use `ProductionEntry` instead */
export type ProductionEntryResponse = ProductionEntry;
/** @deprecated Use `CreateProductionEntryRequest` instead */
export type CreateProductionEntryDto = CreateProductionEntryRequest;

// Projects aliases
/** @deprecated Use `Project` instead */
export type ProjectResponse = Project;
/** @deprecated Use `CreateProjectRequest` instead */
export type CreateProjectDto = CreateProjectRequest;
/** @deprecated Use `Task` instead */
export type TaskResponse = Task;
/** @deprecated Use `CreateTaskRequest` instead */
export type CreateTaskDto = CreateTaskRequest;
/** @deprecated Use `UpdateTaskRequest` instead */
export type UpdateTaskDto = UpdateTaskRequest;
/** @deprecated Use `TimesheetEntry` instead */
export type TimesheetEntryResponse = TimesheetEntry;
/** @deprecated Use `CreateTimesheetEntryRequest` instead */
export type CreateTimesheetEntryDto = CreateTimesheetEntryRequest;

// Tax aliases
/** @deprecated Use `TaxRate` instead */
export type TaxRateResponse = TaxRate;
/** @deprecated Use `CreateTaxRateRequest` instead */
export type CreateTaxRateDto = CreateTaxRateRequest;
/** @deprecated Use `VATReturn` instead */
export type VATReturnResponse = VATReturn;
/** @deprecated Use `CreateVATReturnRequest` instead */
export type CreateVATReturnDto = CreateVATReturnRequest;
/** @deprecated Use `VATPayment` instead */
export type VATPaymentResponse = VATPayment;
/** @deprecated Use `CreateVATPaymentRequest` instead */
export type CreateVATPaymentDto = CreateVATPaymentRequest;

// CRM aliases
/** @deprecated Use `Lead` instead */
export type LeadResponse = Lead;
/** @deprecated Use `CreateLeadRequest` instead */
export type CreateLeadDto = CreateLeadRequest;
/** @deprecated Use `Deal` instead */
export type DealResponse = Deal;
/** @deprecated Use `CreateDealRequest` instead */
export type CreateDealDto = CreateDealRequest;

// Assets aliases
/** @deprecated Use `Asset` instead */
export type AssetResponse = Asset;
/** @deprecated Use `CreateAssetRequest` instead */
export type CreateAssetDto = CreateAssetRequest;
/** @deprecated Use `DepreciationScheduleItem` instead */
export type DepreciationScheduleResponse = DepreciationScheduleItem;

// AI aliases
/** @deprecated Use `AIInsight` instead */
export type AIInsightResponse = AIInsight;

// Reports aliases
/** @deprecated Use `ProfitLossReport` instead */
export type ProfitLossReportResponse = ProfitLossReport;
/** @deprecated Use `BalanceSheetReport` instead */
export type BalanceSheetReportResponse = BalanceSheetReport;
/** @deprecated Use `AgingReport` instead */
export type AgingReportResponse = AgingReport;
/** @deprecated Use `CashFlowReport` instead */
export type CashFlowReportResponse = CashFlowReport;

// System aliases
/** @deprecated Use `AuditLog` instead */
export type AuditLogResponse = AuditLog;
/** @deprecated Use `Notification` instead */
export type NotificationResponse = Notification;
/** @deprecated Use `SearchHistoryEntry` instead */
export type SearchHistoryResponse = { data: SearchHistoryEntry[] };
