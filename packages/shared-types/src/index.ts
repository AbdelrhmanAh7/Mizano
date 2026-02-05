// ============================================
// MIZANO ERP - Shared Types & Interfaces
// ============================================

// ============================================
// ENUMS
// ============================================

// Account Types (Chart of Accounts)
export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

// User & Role
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export enum DefaultRole {
  ADMIN = 'ADMIN',
  ACCOUNTANT = 'ACCOUNTANT',
  SALES_REP = 'SALES_REP',
  STORE_KEEPER = 'STORE_KEEPER',
  MANAGER = 'MANAGER',
}

export enum Permission {
  VIEW = 'view',
  CREATE = 'create',
  EDIT = 'edit',
  DELETE = 'delete',
  EXPORT = 'export',
}

// Quote Status
export enum QuoteStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  ACCEPTED = 'ACCEPTED',
  INVOICED = 'INVOICED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
}

// Invoice Status
export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  VOID = 'VOID',
}

// Bill Status
export enum BillStatus {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  VOID = 'VOID',
}

// Payment Mode
export enum PaymentMode {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
  CHEQUE = 'CHEQUE',
  ONLINE = 'ONLINE',
  OTHER = 'OTHER',
}

// Item Type
export enum ItemType {
  GOODS = 'GOODS',
  SERVICE = 'SERVICE',
  DIGITAL = 'DIGITAL',
}

// Inventory Adjustment Type
export enum AdjustmentType {
  INCREASE = 'INCREASE',
  DECREASE = 'DECREASE',
}

export enum AdjustmentReason {
  DAMAGED = 'DAMAGED',
  STOLEN = 'STOLEN',
  STOCKTAKE = 'STOCKTAKE',
  RETURNED = 'RETURNED',
  EXPIRED = 'EXPIRED',
  OTHER = 'OTHER',
}

// Bank Account Type
export enum BankAccountType {
  BANK = 'BANK',
  CREDIT_CARD = 'CREDIT_CARD',
  PETTY_CASH = 'PETTY_CASH',
}

// Bank Transaction Type
export enum BankTransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
}

// Reconciliation Status
export enum ReconciliationStatus {
  PENDING = 'PENDING',
  MATCHED = 'MATCHED',
  CREATED = 'CREATED',
  RECONCILED = 'RECONCILED',
}

// Attendance Status
export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LEAVE = 'LEAVE',
  HALF_DAY = 'HALF_DAY',
}

// Payroll Status
export enum PayrollStatus {
  DRAFT = 'DRAFT',
  PROCESSED = 'PROCESSED',
  PAID = 'PAID',
}

// Work Order Status
export enum WorkOrderStatus {
  DRAFT = 'DRAFT',
  IN_PROCESS = 'IN_PROCESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

// Project Billing Method
export enum BillingMethod {
  FIXED = 'FIXED',
  HOURLY = 'HOURLY',
  PROJECT_HOURLY = 'PROJECT_HOURLY',
  TASK_HOURLY = 'TASK_HOURLY',
  STAFF_HOURLY = 'STAFF_HOURLY',
}

// Project Status
export enum ProjectStatus {
  PLANNING = 'PLANNING',
  ACTIVE = 'ACTIVE',
  IN_PROGRESS = 'IN_PROGRESS',
  ON_HOLD = 'ON_HOLD',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

// Timesheet Status
export enum TimesheetStatus {
  UNBILLED = 'UNBILLED',
  INVOICED = 'INVOICED',
}

// VAT Return Status
export enum VATReturnStatus {
  DRAFT = 'DRAFT',
  CALCULATED = 'CALCULATED',
  GENERATED = 'GENERATED',
  SUBMITTED = 'SUBMITTED',
  FILED = 'FILED',
}

// Tax Type
export enum TaxType {
  SALES = 'SALES',
  PURCHASES = 'PURCHASES',
  BOTH = 'BOTH',
}

// Recurring Frequency
export enum RecurringFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

// Lead Status (CRM)
export enum LeadStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  QUALIFIED = 'QUALIFIED',
  JUNK = 'JUNK',
}

// Lead Source (CRM)
export enum LeadSource {
  WEBSITE = 'WEBSITE',
  FACEBOOK_ADS = 'FACEBOOK_ADS',
  GOOGLE_ADS = 'GOOGLE_ADS',
  REFERRAL = 'REFERRAL',
  COLD_CALL = 'COLD_CALL',
  OTHER = 'OTHER',
}

// Deal Stage (CRM)
export enum DealStage {
  NEW = 'NEW',
  MEETING_SCHEDULED = 'MEETING_SCHEDULED',
  PROPOSAL_SENT = 'PROPOSAL_SENT',
  NEGOTIATION = 'NEGOTIATION',
  WON = 'WON',
  LOST = 'LOST',
}

// Audit Action
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

// Depreciation Method
export enum DepreciationMethod {
  STRAIGHT_LINE = 'STRAIGHT_LINE',
  DECLINING_BALANCE = 'DECLINING_BALANCE',
}

// Asset Status
export enum AssetStatus {
  ACTIVE = 'ACTIVE',
  DISPOSED = 'DISPOSED',
  SOLD = 'SOLD',
}

// Credit Note Type
export enum CreditNoteType {
  REFUND = 'REFUND',
  APPLY_TO_INVOICE = 'APPLY_TO_INVOICE',
}

// Task Status
export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  REVIEW = 'REVIEW',
  DONE = 'DONE',
}

// Task Priority
export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

// Price List Type
export enum PriceListType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
}

// Challan Type
export enum ChallanType {
  SUPPLY = 'SUPPLY',
  JOB_WORK = 'JOB_WORK',
}

// ============================================
// BASE INTERFACES
// ============================================

export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SoftDeleteEntity extends BaseEntity {
  deletedAt?: Date | null;
}

export interface OrganizationEntity extends BaseEntity {
  organizationId: string;
}

// ============================================
// PAGINATION
// ============================================

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

// ============================================
// AUTH
// ============================================

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  name: string;
  organizationName: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: UserResponse;
  organization: OrganizationResponse;
  tokens: AuthTokens;
}

export interface RefreshTokenDto {
  refreshToken: string;
}

// ============================================
// ORGANIZATION
// ============================================

export interface OrganizationResponse {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  currency: string;
  taxId?: string;
  lockDate?: Date;
  createdAt: Date;
}

export interface UpdateOrganizationDto {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  currency?: string;
  taxId?: string;
  lockDate?: Date;
}

// ============================================
// USER
// ============================================

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  roleId: string;
  role?: RoleResponse;
  organizationId: string;
  createdAt: Date;
}

export interface CreateUserDto {
  email: string;
  password: string;
  name: string;
  roleId: string;
}

export interface UpdateUserDto {
  email?: string;
  name?: string;
  roleId?: string;
  status?: UserStatus;
}

// ============================================
// ROLE & PERMISSIONS
// ============================================

export interface RoleResponse {
  id: string;
  name: string;
  description?: string;
  permissions: PermissionResponse[];
  isDefault: boolean;
  organizationId: string;
}

export interface PermissionResponse {
  id: string;
  module: string;
  actions: Permission[];
}

export interface CreateRoleDto {
  name: string;
  description?: string;
  permissions: CreatePermissionDto[];
}

export interface CreatePermissionDto {
  module: string;
  actions: Permission[];
}

// ============================================
// CHART OF ACCOUNTS
// ============================================

export interface AccountResponse {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentId?: string;
  parent?: AccountResponse;
  children?: AccountResponse[];
  currency: string;
  description?: string;
  isActive: boolean;
  organizationId: string;
  createdAt: Date;
}

export interface CreateAccountDto {
  code: string;
  name: string;
  type: AccountType;
  parentId?: string;
  currency?: string;
  description?: string;
}

export interface UpdateAccountDto {
  code?: string;
  name?: string;
  parentId?: string;
  currency?: string;
  description?: string;
  isActive?: boolean;
}

// ============================================
// JOURNAL ENTRIES
// ============================================

export interface JournalResponse {
  id: string;
  journalNumber: string;
  date: Date;
  reference?: string;
  notes?: string;
  lines: JournalLineResponse[];
  totalDebit: string;
  totalCredit: string;
  isPosted: boolean;
  organizationId: string;
  createdAt: Date;
}

export interface JournalLineResponse {
  id: string;
  accountId: string;
  account?: AccountResponse;
  debit: string;
  credit: string;
  description?: string;
}

export interface CreateJournalDto {
  date: Date;
  reference?: string;
  notes?: string;
  lines: CreateJournalLineDto[];
}

export interface CreateJournalLineDto {
  accountId: string;
  debit: string;
  credit: string;
  description?: string;
}

// ============================================
// RECURRING PROFILE
// ============================================

export interface RecurringProfileResponse {
  id: string;
  name: string;
  frequency: RecurringFrequency;
  startDate: Date;
  endDate?: Date;
  nextRunDate: Date;
  isActive: boolean;
  autoPost: boolean;
  templateData: Record<string, unknown>;
  entityType: string;
  organizationId: string;
}

export interface CreateRecurringProfileDto {
  name: string;
  frequency: RecurringFrequency;
  startDate: Date;
  endDate?: Date;
  autoPost?: boolean;
  templateData: Record<string, unknown>;
  entityType: string;
}

// ============================================
// CUSTOMER
// ============================================

export interface CustomerResponse {
  id: string;
  name: string;
  displayName?: string;
  email?: string;
  phone?: string;
  currency: string;
  taxId?: string;
  billingAddress?: AddressResponse;
  shippingAddress?: AddressResponse;
  paymentTerms: number;
  priceListId?: string;
  outstandingBalance: string;
  organizationId: string;
  createdAt: Date;
}

export interface AddressResponse {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface CreateCustomerDto {
  name: string;
  displayName?: string;
  email?: string;
  phone?: string;
  currency?: string;
  taxId?: string;
  billingAddress?: AddressDto;
  shippingAddress?: AddressDto;
  paymentTerms?: number;
  priceListId?: string;
}

export interface AddressDto {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface UpdateCustomerDto extends Partial<CreateCustomerDto> {}

// ============================================
// QUOTE
// ============================================

export interface QuoteResponse {
  id: string;
  quoteNumber: string;
  customerId: string;
  customer?: CustomerResponse;
  date: Date;
  expiryDate: Date;
  status: QuoteStatus;
  lines: QuoteLineResponse[];
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  grandTotal: string;
  notes?: string;
  terms?: string;
  organizationId: string;
  createdAt: Date;
}

export interface QuoteLineResponse {
  id: string;
  itemId?: string;
  item?: ItemResponse;
  description: string;
  quantity: string;
  rate: string;
  discount: string;
  taxRate: string;
  amount: string;
}

export interface CreateQuoteDto {
  customerId: string;
  date: Date;
  expiryDate: Date;
  lines: CreateQuoteLineDto[];
  notes?: string;
  terms?: string;
}

export interface CreateQuoteLineDto {
  itemId?: string;
  description: string;
  quantity: string;
  rate: string;
  discount?: string;
  taxRate?: string;
}

// ============================================
// INVOICE
// ============================================

export interface InvoiceResponse {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customer?: CustomerResponse;
  quoteId?: string;
  date: Date;
  dueDate: Date;
  status: InvoiceStatus;
  lines: InvoiceLineResponse[];
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  shippingAmount: string;
  grandTotal: string;
  balanceDue: string;
  notes?: string;
  terms?: string;
  projectId?: string;
  organizationId: string;
  createdAt: Date;
}

export interface InvoiceLineResponse {
  id: string;
  itemId?: string;
  item?: ItemResponse;
  description: string;
  quantity: string;
  rate: string;
  discount: string;
  taxRate: string;
  amount: string;
}

export interface CreateInvoiceDto {
  customerId: string;
  quoteId?: string;
  date: Date;
  dueDate: Date;
  lines: CreateInvoiceLineDto[];
  shippingAmount?: string;
  notes?: string;
  terms?: string;
  projectId?: string;
}

export interface CreateInvoiceLineDto {
  itemId?: string;
  description: string;
  quantity: string;
  rate: string;
  discount?: string;
  taxRate?: string;
}

// ============================================
// CREDIT NOTE
// ============================================

export interface CreditNoteResponse {
  id: string;
  creditNoteNumber: string;
  customerId: string;
  customer?: CustomerResponse;
  invoiceId: string;
  invoice?: InvoiceResponse;
  date: Date;
  reason: string;
  amount: string;
  type: CreditNoteType;
  appliedToInvoiceId?: string;
  refundedAt?: Date;
  organizationId: string;
  createdAt: Date;
}

export interface CreateCreditNoteDto {
  customerId: string;
  invoiceId: string;
  date: Date;
  reason: string;
  amount: string;
  type: CreditNoteType;
  appliedToInvoiceId?: string;
}

// ============================================
// PAYMENT RECEIVED
// ============================================

export interface PaymentReceivedResponse {
  id: string;
  paymentNumber: string;
  customerId: string;
  customer?: CustomerResponse;
  date: Date;
  amount: string;
  paymentMode: PaymentMode;
  depositToAccountId: string;
  reference?: string;
  notes?: string;
  allocations: PaymentAllocationResponse[];
  organizationId: string;
  createdAt: Date;
}

export interface PaymentAllocationResponse {
  invoiceId: string;
  invoice?: InvoiceResponse;
  amount: string;
}

export interface CreatePaymentReceivedDto {
  customerId: string;
  date: Date;
  amount: string;
  paymentMode: PaymentMode;
  depositToAccountId: string;
  reference?: string;
  notes?: string;
  allocations: CreatePaymentAllocationDto[];
}

export interface CreatePaymentAllocationDto {
  invoiceId: string;
  amount: string;
}

// ============================================
// VENDOR
// ============================================

export interface VendorResponse {
  id: string;
  name: string;
  displayName?: string;
  email?: string;
  phone?: string;
  currency: string;
  taxId?: string;
  billingAddress?: AddressResponse;
  paymentTerms: number;
  outstandingBalance: string;
  organizationId: string;
  createdAt: Date;
}

export interface CreateVendorDto {
  name: string;
  displayName?: string;
  email?: string;
  phone?: string;
  currency?: string;
  taxId?: string;
  billingAddress?: AddressDto;
  paymentTerms?: number;
}

export interface UpdateVendorDto extends Partial<CreateVendorDto> {}

// ============================================
// EXPENSE
// ============================================

export interface ExpenseResponse {
  id: string;
  date: Date;
  accountId: string;
  account?: AccountResponse;
  vendorId?: string;
  vendor?: VendorResponse;
  amount: string;
  taxAmount: string;
  taxInclusive: boolean;
  paidThroughAccountId: string;
  description?: string;
  reference?: string;
  receiptUrl?: string;
  projectId?: string;
  organizationId: string;
  createdAt: Date;
}

export interface CreateExpenseDto {
  date: Date;
  accountId: string;
  vendorId?: string;
  amount: string;
  taxRate?: string;
  taxInclusive?: boolean;
  paidThroughAccountId: string;
  description?: string;
  reference?: string;
  projectId?: string;
}

// ============================================
// BILL
// ============================================

export interface BillResponse {
  id: string;
  billNumber: string;
  vendorId: string;
  vendor?: VendorResponse;
  date: Date;
  dueDate: Date;
  status: BillStatus;
  lines: BillLineResponse[];
  subtotal: string;
  taxAmount: string;
  grandTotal: string;
  balanceDue: string;
  notes?: string;
  projectId?: string;
  organizationId: string;
  createdAt: Date;
}

export interface BillLineResponse {
  id: string;
  itemId?: string;
  item?: ItemResponse;
  accountId?: string;
  account?: AccountResponse;
  description: string;
  quantity: string;
  rate: string;
  taxRate: string;
  amount: string;
}

export interface CreateBillDto {
  billNumber: string;
  vendorId: string;
  date: Date;
  dueDate: Date;
  lines: CreateBillLineDto[];
  notes?: string;
  projectId?: string;
}

export interface CreateBillLineDto {
  itemId?: string;
  accountId?: string;
  description: string;
  quantity: string;
  rate: string;
  taxRate?: string;
}

// ============================================
// VENDOR CREDIT
// ============================================

export interface VendorCreditResponse {
  id: string;
  creditNumber: string;
  vendorId: string;
  vendor?: VendorResponse;
  billId: string;
  bill?: BillResponse;
  date: Date;
  reason: string;
  amount: string;
  appliedToBillId?: string;
  refundedAt?: Date;
  organizationId: string;
  createdAt: Date;
}

export interface CreateVendorCreditDto {
  vendorId: string;
  billId: string;
  date: Date;
  reason: string;
  amount: string;
  appliedToBillId?: string;
}

// ============================================
// PAYMENT MADE
// ============================================

export interface PaymentMadeResponse {
  id: string;
  paymentNumber: string;
  vendorId: string;
  vendor?: VendorResponse;
  date: Date;
  amount: string;
  paymentMode: PaymentMode;
  paidFromAccountId: string;
  reference?: string;
  notes?: string;
  allocations: BillAllocationResponse[];
  organizationId: string;
  createdAt: Date;
}

export interface BillAllocationResponse {
  billId: string;
  bill?: BillResponse;
  amount: string;
}

export interface CreatePaymentMadeDto {
  vendorId: string;
  date: Date;
  amount: string;
  paymentMode: PaymentMode;
  paidFromAccountId: string;
  reference?: string;
  notes?: string;
  allocations: CreateBillAllocationDto[];
}

export interface CreateBillAllocationDto {
  billId: string;
  amount: string;
}

// ============================================
// ITEM / PRODUCT
// ============================================

export interface ItemResponse {
  id: string;
  name: string;
  sku: string;
  type: ItemType;
  unit?: string;
  sellingPrice: string;
  salesAccountId?: string;
  costPrice: string;
  purchaseAccountId?: string;
  inventoryAccountId?: string;
  description?: string;
  reorderPoint?: number;
  currentStock: number;
  isActive: boolean;
  organizationId: string;
  createdAt: Date;
}

export interface CreateItemDto {
  name: string;
  sku: string;
  type: ItemType;
  unit?: string;
  sellingPrice: string;
  salesAccountId?: string;
  costPrice: string;
  purchaseAccountId?: string;
  inventoryAccountId?: string;
  description?: string;
  reorderPoint?: number;
  openingStock?: number;
}

export interface UpdateItemDto extends Partial<CreateItemDto> {
  isActive?: boolean;
}

// ============================================
// COMPOSITE ITEM / BUNDLE
// ============================================

export interface CompositeItemResponse {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  description?: string;
  components: CompositeItemComponentResponse[];
  organizationId: string;
  createdAt: Date;
}

export interface CompositeItemComponentResponse {
  id: string;
  itemId: string;
  item?: ItemResponse;
  quantity: number;
}

export interface CreateCompositeItemDto {
  name: string;
  sku: string;
  sellingPrice: string;
  description?: string;
  components: CreateCompositeItemComponentDto[];
}

export interface CreateCompositeItemComponentDto {
  itemId: string;
  quantity: number;
}

// ============================================
// WAREHOUSE
// ============================================

export interface WarehouseResponse {
  id: string;
  name: string;
  code: string;
  address?: AddressResponse;
  isDefault: boolean;
  isActive: boolean;
  organizationId: string;
  createdAt: Date;
}

export interface CreateWarehouseDto {
  name: string;
  code: string;
  address?: AddressDto;
  isDefault?: boolean;
}

// ============================================
// INVENTORY ADJUSTMENT
// ============================================

export interface InventoryAdjustmentResponse {
  id: string;
  adjustmentNumber: string;
  date: Date;
  warehouseId: string;
  warehouse?: WarehouseResponse;
  itemId: string;
  item?: ItemResponse;
  type: AdjustmentType;
  quantity: number;
  reason: AdjustmentReason;
  accountId: string;
  notes?: string;
  organizationId: string;
  createdAt: Date;
}

export interface CreateInventoryAdjustmentDto {
  date: Date;
  warehouseId: string;
  itemId: string;
  type: AdjustmentType;
  quantity: number;
  reason: AdjustmentReason;
  accountId: string;
  notes?: string;
}

// ============================================
// PRICE LIST
// ============================================

export interface PriceListResponse {
  id: string;
  name: string;
  description?: string;
  type: 'PERCENTAGE' | 'FIXED';
  adjustment: string;
  isActive: boolean;
  items: PriceListItemResponse[];
  organizationId: string;
  createdAt: Date;
}

export interface PriceListItemResponse {
  itemId: string;
  item?: ItemResponse;
  customPrice: string;
}

export interface CreatePriceListDto {
  name: string;
  description?: string;
  type: 'PERCENTAGE' | 'FIXED';
  adjustment: string;
  items?: CreatePriceListItemDto[];
}

export interface CreatePriceListItemDto {
  itemId: string;
  customPrice: string;
}

// ============================================
// BANK ACCOUNT
// ============================================

export interface BankAccountResponse {
  id: string;
  name: string;
  accountNumber?: string;
  currency: string;
  type: BankAccountType;
  systemBalance: string;
  bankBalance: string;
  linkedAccountId: string;
  isActive: boolean;
  organizationId: string;
  createdAt: Date;
}

export interface CreateBankAccountDto {
  name: string;
  accountNumber?: string;
  currency?: string;
  type: BankAccountType;
  openingBalance?: string;
  linkedAccountId: string;
}

// ============================================
// BANK TRANSACTION
// ============================================

export interface BankTransactionResponse {
  id: string;
  bankAccountId: string;
  date: Date;
  type: BankTransactionType;
  amount: string;
  description?: string;
  reference?: string;
  payee?: string;
  status: ReconciliationStatus;
  matchedEntityType?: string;
  matchedEntityId?: string;
  confidence?: number;
  organizationId: string;
  createdAt: Date;
}

export interface CreateBankTransactionDto {
  bankAccountId: string;
  date: Date;
  type: BankTransactionType;
  amount: string;
  description?: string;
  reference?: string;
  payee?: string;
}

// ============================================
// BANK RULE
// ============================================

export interface BankRuleResponse {
  id: string;
  name: string;
  bankAccountId?: string;
  conditions: BankRuleCondition[];
  action: BankRuleAction;
  isActive: boolean;
  organizationId: string;
}

export interface BankRuleCondition {
  field: 'description' | 'payee' | 'amount';
  operator: 'contains' | 'equals' | 'startsWith' | 'endsWith';
  value: string;
}

export interface BankRuleAction {
  type: 'expense' | 'transfer';
  accountId: string;
  vendorId?: string;
}

export interface CreateBankRuleDto {
  name: string;
  bankAccountId?: string;
  conditions: BankRuleCondition[];
  action: BankRuleAction;
}

// ============================================
// EMPLOYEE
// ============================================

export interface EmployeeResponse {
  id: string;
  employeeId: string;
  name: string;
  email?: string;
  phone?: string;
  department?: string;
  jobTitle?: string;
  dateOfJoining: Date;
  basicSalary: string;
  allowances: Record<string, string>;
  deductions: Record<string, string>;
  bankAccount?: string;
  isActive: boolean;
  organizationId: string;
  createdAt: Date;
}

export interface CreateEmployeeDto {
  employeeId: string;
  name: string;
  email?: string;
  phone?: string;
  department?: string;
  jobTitle?: string;
  dateOfJoining: Date;
  basicSalary: string;
  allowances?: Record<string, string>;
  deductions?: Record<string, string>;
  bankAccount?: string;
}

// ============================================
// ATTENDANCE
// ============================================

export interface AttendanceResponse {
  id: string;
  employeeId: string;
  employee?: EmployeeResponse;
  date: Date;
  status: AttendanceStatus;
  checkIn?: Date;
  checkOut?: Date;
  notes?: string;
  organizationId: string;
}

export interface CreateAttendanceDto {
  employeeId: string;
  date: Date;
  status: AttendanceStatus;
  checkIn?: Date;
  checkOut?: Date;
  notes?: string;
}

// ============================================
// PAYROLL
// ============================================

export interface PayrollRunResponse {
  id: string;
  month: number;
  year: number;
  status: PayrollStatus;
  processedAt?: Date;
  paidAt?: Date;
  payslips: PayslipResponse[];
  totalGross: string;
  totalDeductions: string;
  totalNet: string;
  organizationId: string;
  createdAt: Date;
}

export interface PayslipResponse {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employee?: EmployeeResponse;
  basicSalary: string;
  allowances: Record<string, string>;
  grossSalary: string;
  lop: string;
  deductions: Record<string, string>;
  taxes: string;
  netSalary: string;
}

export interface CreatePayrollRunDto {
  month: number;
  year: number;
}

// ============================================
// BOM (Bill of Materials)
// ============================================

export interface BOMResponse {
  id: string;
  name: string;
  outputItemId: string;
  outputItem?: ItemResponse;
  outputQuantity: number;
  operationsCost: string;
  items: BOMItemResponse[];
  isActive: boolean;
  organizationId: string;
  createdAt: Date;
}

export interface BOMItemResponse {
  id: string;
  itemId: string;
  item?: ItemResponse;
  quantity: number;
}

export interface CreateBOMDto {
  name: string;
  outputItemId: string;
  outputQuantity: number;
  operationsCost?: string;
  items: CreateBOMItemDto[];
}

export interface CreateBOMItemDto {
  itemId: string;
  quantity: number;
}

// ============================================
// WORK ORDER
// ============================================

export interface WorkOrderResponse {
  id: string;
  workOrderNumber: string;
  bomId: string;
  bom?: BOMResponse;
  quantity: number;
  status: WorkOrderStatus;
  plannedStartDate?: Date;
  actualStartDate?: Date;
  completedDate?: Date;
  notes?: string;
  materialRequirements: MaterialRequirementResponse[];
  organizationId: string;
  createdAt: Date;
}

export interface MaterialRequirementResponse {
  itemId: string;
  item?: ItemResponse;
  requiredQuantity: number;
  availableQuantity: number;
  shortfall: number;
}

export interface CreateWorkOrderDto {
  bomId: string;
  quantity: number;
  plannedStartDate?: Date;
  notes?: string;
}

// ============================================
// PROJECT
// ============================================

export interface ProjectResponse {
  id: string;
  name: string;
  customerId?: string;
  customer?: CustomerResponse;
  billingMethod: BillingMethod;
  budgetAmount?: string;
  budgetHours?: number;
  status: ProjectStatus;
  startDate?: Date;
  endDate?: Date;
  description?: string;
  totalInvoiced: string;
  totalExpenses: string;
  totalLaborCost: string;
  profitability: string;
  tasks: TaskResponse[];
  organizationId: string;
  createdAt: Date;
}

export interface CreateProjectDto {
  name: string;
  customerId?: string;
  billingMethod: BillingMethod;
  budgetAmount?: string;
  budgetHours?: number;
  startDate?: Date;
  endDate?: Date;
  description?: string;
}

// ============================================
// TASK
// ============================================

export interface TaskResponse {
  id: string;
  name: string;
  projectId: string;
  project?: ProjectResponse;
  description?: string;
  ratePerHour: string;
  isBillable: boolean;
  status: TaskStatus;
  priority: TaskPriority;
  sortOrder: number;
  assigneeId?: string;
  assignee?: UserResponse;
  dueDate?: Date;
  estimatedHours?: number;
  tags: string[];
  totalHours: number;
  organizationId: string;
  createdAt: Date;
}

export interface CreateTaskDto {
  name: string;
  projectId: string;
  description?: string;
  ratePerHour: string;
  isBillable?: boolean;
}

export interface UpdateTaskDto {
  name?: string;
  description?: string;
  ratePerHour?: string;
  isBillable?: boolean;
  status?: TaskStatus;
  priority?: TaskPriority;
  sortOrder?: number;
  assigneeId?: string;
  dueDate?: Date;
  estimatedHours?: number;
  tags?: string[];
}

// ============================================
// TIMESHEET
// ============================================

export interface TimesheetEntryResponse {
  id: string;
  userId: string;
  user?: UserResponse;
  projectId: string;
  project?: ProjectResponse;
  taskId?: string;
  task?: TaskResponse;
  date: Date;
  startTime?: Date;
  endTime?: Date;
  duration: number;
  description?: string;
  isBillable: boolean;
  status: TimesheetStatus;
  invoiceId?: string;
  organizationId: string;
  createdAt: Date;
}

export interface CreateTimesheetEntryDto {
  projectId: string;
  taskId?: string;
  date: Date;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  description?: string;
  isBillable?: boolean;
}

// ============================================
// TAX RATE
// ============================================

export interface TaxRateResponse {
  id: string;
  name: string;
  rate: string;
  type: TaxType;
  linkedAccountId: string;
  isDefault: boolean;
  isActive: boolean;
  organizationId: string;
  createdAt: Date;
}

export interface CreateTaxRateDto {
  name: string;
  rate: string;
  type: TaxType;
  linkedAccountId: string;
  isDefault?: boolean;
}

// ============================================
// VAT RETURN
// ============================================

export interface VATReturnResponse {
  id: string;
  period: string;
  startDate: Date;
  endDate: Date;
  status: VATReturnStatus;
  totalSales: string;
  outputVAT: string;
  totalPurchases: string;
  inputVAT: string;
  netPayable: string;
  filedAt?: Date;
  payment?: VATPaymentResponse;
  organizationId: string;
  createdAt: Date;
}

export interface CreateVATReturnDto {
  period: string;
  startDate: Date;
  endDate: Date;
}

// ============================================
// VAT PAYMENT
// ============================================

export interface VATPaymentResponse {
  id: string;
  vatReturnId: string;
  date: Date;
  amount: string;
  paidFromAccountId: string;
  reference?: string;
  organizationId: string;
  createdAt: Date;
}

export interface CreateVATPaymentDto {
  vatReturnId: string;
  date: Date;
  amount: string;
  paidFromAccountId: string;
  reference?: string;
}

// ============================================
// FIXED ASSET
// ============================================

export interface AssetResponse {
  id: string;
  name: string;
  assetType: string;
  purchaseDate: Date;
  purchasePrice: string;
  salvageValue: string;
  usefulLife: number;
  depreciationMethod: DepreciationMethod;
  status: AssetStatus;
  assetAccountId: string;
  depreciationAccountId: string;
  accumulatedDepreciation: string;
  bookValue: string;
  disposedAt?: Date;
  disposalPrice?: string;
  organizationId: string;
  createdAt: Date;
}

export interface CreateAssetDto {
  name: string;
  assetType: string;
  purchaseDate: Date;
  purchasePrice: string;
  salvageValue: string;
  usefulLife: number;
  depreciationMethod: DepreciationMethod;
  assetAccountId: string;
  depreciationAccountId: string;
}

// ============================================
// DEPRECIATION SCHEDULE
// ============================================

export interface DepreciationScheduleResponse {
  id: string;
  assetId: string;
  asset?: AssetResponse;
  periodNumber: number;
  periodStart: Date;
  periodEnd: Date;
  openingValue: string;
  depreciation: string;
  closingValue: string;
  isPosted: boolean;
  journalId?: string;
  organizationId: string;
  createdAt: Date;
}

// ============================================
// PRODUCTION ENTRY
// ============================================

export interface ProductionEntryResponse {
  id: string;
  workOrderId: string;
  workOrder?: WorkOrderResponse;
  date: Date;
  quantityProduced: number;
  quantityRejected: number;
  wastageQuantity: number;
  notes?: string;
  organizationId: string;
  createdAt: Date;
}

export interface CreateProductionEntryDto {
  workOrderId: string;
  date: Date;
  quantityProduced: number;
  quantityRejected?: number;
  wastageQuantity?: number;
  notes?: string;
}

// ============================================
// RECONCILIATION
// ============================================

export interface ReconciliationResponse {
  id: string;
  bankAccountId: string;
  bankAccount?: BankAccountResponse;
  reconciliationDate: Date;
  statementDate: Date;
  statementBalance: string;
  systemBalance: string;
  reconciledBalance: string;
  difference: string;
  isCompleted: boolean;
  completedAt?: Date;
  notes?: string;
  organizationId: string;
  createdAt: Date;
}

export interface CreateReconciliationDto {
  bankAccountId: string;
  reconciliationDate: Date;
  statementDate: Date;
  statementBalance: string;
}

export interface UpdateReconciliationDto {
  reconciledBalance?: string;
  notes?: string;
  isCompleted?: boolean;
}

// ============================================
// LEAD (CRM)
// ============================================

export interface LeadResponse {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  source: LeadSource;
  status: LeadStatus;
  notes?: string;
  assignedToId?: string;
  assignedTo?: UserResponse;
  organizationId: string;
  createdAt: Date;
}

export interface CreateLeadDto {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  source: LeadSource;
  notes?: string;
  assignedToId?: string;
}

// ============================================
// DEAL (CRM)
// ============================================

export interface DealResponse {
  id: string;
  name: string;
  leadId?: string;
  lead?: LeadResponse;
  customerId?: string;
  customer?: CustomerResponse;
  stage: DealStage;
  value: string;
  expectedCloseDate?: Date;
  closedAt?: Date;
  notes?: string;
  assignedToId?: string;
  assignedTo?: UserResponse;
  organizationId: string;
  createdAt: Date;
}

export interface CreateDealDto {
  name: string;
  leadId?: string;
  customerId?: string;
  stage?: DealStage;
  value: string;
  expectedCloseDate?: Date;
  notes?: string;
  assignedToId?: string;
}

// ============================================
// AUDIT LOG
// ============================================

export interface AuditLogResponse {
  id: string;
  userId: string;
  user?: UserResponse;
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  organizationId: string;
  createdAt: Date;
}

// ============================================
// AI INSIGHT
// ============================================

export interface AIInsightResponse {
  id: string;
  type: string;
  title: string;
  description: string;
  data?: Record<string, unknown>;
  severity: 'info' | 'warning' | 'critical';
  isRead: boolean;
  isDismissed: boolean;
  organizationId: string;
  createdAt: Date;
}

// ============================================
// NOTIFICATION
// ============================================

export interface NotificationResponse {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  entityType?: string;
  entityId?: string;
  isRead: boolean;
  organizationId: string;
  createdAt: Date;
}

// ============================================
// REPORTS
// ============================================

export interface ProfitLossReportResponse {
  startDate: Date;
  endDate: Date;
  income: ReportLineItem[];
  totalIncome: string;
  expenses: ReportLineItem[];
  totalExpenses: string;
  netProfit: string;
  comparison?: {
    previousPeriod: {
      totalIncome: string;
      totalExpenses: string;
      netProfit: string;
    };
    variance: {
      income: string;
      expenses: string;
      profit: string;
    };
  };
}

export interface BalanceSheetReportResponse {
  asOfDate: Date;
  assets: ReportSection;
  liabilities: ReportSection;
  equity: ReportSection;
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
}

export interface ReportSection {
  items: ReportLineItem[];
  total: string;
}

export interface ReportLineItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: string;
  children?: ReportLineItem[];
}

export interface AgingReportResponse {
  asOfDate: Date;
  buckets: AgingBucket[];
  summary: {
    current: string;
    '1-15': string;
    '16-30': string;
    '31-60': string;
    '61-90': string;
    '90+': string;
    total: string;
  };
}

export interface AgingBucket {
  entityId: string;
  entityName: string;
  current: string;
  '1-15': string;
  '16-30': string;
  '31-60': string;
  '61-90': string;
  '90+': string;
  total: string;
}

export interface CashFlowReportResponse {
  startDate: Date;
  endDate: Date;
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  netCashFlow: string;
  openingBalance: string;
  closingBalance: string;
}

export interface CashFlowSection {
  items: CashFlowItem[];
  total: string;
}

export interface CashFlowItem {
  description: string;
  amount: string;
}

// ============================================
// DASHBOARD
// ============================================

export interface DashboardStats {
  totalRevenue: string;
  totalExpenses: string;
  netProfit: string;
  bankBalance: string;
  receivables: string;
  payables: string;
  overdueInvoices: number;
  overdueBills: number;
}

export interface DashboardChartData {
  cashFlow: { month: string; inflow: number; outflow: number }[];
  revenueByMonth: { month: string; revenue: number }[];
  expensesByCategory: { category: string; amount: number }[];
  receivablesVsPayables: { receivables: number; payables: number };
}

// ============================================
// API RESPONSE WRAPPER
// ============================================

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  details?: Record<string, string[]>;
  timestamp: string;
  path: string;
}
