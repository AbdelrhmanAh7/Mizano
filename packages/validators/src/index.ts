// ============================================
// MIZANO ERP - Zod Validation Schemas
// ============================================

import { z } from 'zod';

// ============================================
// COMMON SCHEMAS
// ============================================

// Decimal string validation (for money fields)
export const decimalSchema = z.string().regex(/^-?\d+(\.\d{1,4})?$/, 'Invalid decimal format');
export const positiveDecimalSchema = z.string().regex(/^\d+(\.\d{1,4})?$/, 'Must be a positive number');

// Date validation
export const dateSchema = z.coerce.date();

// CUID validation
export const cuidSchema = z.string().cuid();

// Pagination
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
});

// Address
export const addressSchema = z.object({
  street: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
});

// ============================================
// ENUMS (as Zod schemas)
// ============================================

export const accountTypeSchema = z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']);
export const userStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']);
export const quoteStatusSchema = z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'INVOICED', 'DECLINED', 'EXPIRED']);
export const invoiceStatusSchema = z.enum(['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID']);
export const billStatusSchema = z.enum(['DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID']);
export const paymentModeSchema = z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'DEBIT_CARD', 'CHEQUE', 'ONLINE', 'OTHER']);
export const itemTypeSchema = z.enum(['GOODS', 'SERVICE', 'DIGITAL']);
export const adjustmentTypeSchema = z.enum(['INCREASE', 'DECREASE']);
export const adjustmentReasonSchema = z.enum(['DAMAGED', 'STOLEN', 'STOCKTAKE', 'RETURNED', 'EXPIRED', 'OTHER']);
export const bankAccountTypeSchema = z.enum(['BANK', 'CREDIT_CARD', 'PETTY_CASH']);
export const bankTransactionTypeSchema = z.enum(['DEPOSIT', 'WITHDRAWAL']);
export const reconciliationStatusSchema = z.enum(['PENDING', 'MATCHED', 'CREATED', 'RECONCILED']);
export const attendanceStatusSchema = z.enum(['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY']);
export const payrollStatusSchema = z.enum(['DRAFT', 'PROCESSED', 'PAID']);
export const workOrderStatusSchema = z.enum(['DRAFT', 'IN_PROCESS', 'COMPLETED', 'CANCELLED']);
export const billingMethodSchema = z.enum(['FIXED', 'PROJECT_HOURLY', 'TASK_HOURLY', 'STAFF_HOURLY']);
export const projectStatusSchema = z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']);
export const timesheetStatusSchema = z.enum(['UNBILLED', 'INVOICED']);
export const vatReturnStatusSchema = z.enum(['DRAFT', 'GENERATED', 'FILED']);
export const taxTypeSchema = z.enum(['SALES', 'PURCHASES', 'BOTH']);
export const recurringFrequencySchema = z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);
export const leadStatusSchema = z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'JUNK']);
export const leadSourceSchema = z.enum(['WEBSITE', 'FACEBOOK_ADS', 'GOOGLE_ADS', 'REFERRAL', 'COLD_CALL', 'OTHER']);
export const dealStageSchema = z.enum(['NEW', 'MEETING_SCHEDULED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST']);
export const depreciationMethodSchema = z.enum(['STRAIGHT_LINE', 'DECLINING_BALANCE']);
export const assetStatusSchema = z.enum(['ACTIVE', 'DISPOSED', 'SOLD']);
export const creditNoteTypeSchema = z.enum(['REFUND', 'APPLY_TO_INVOICE']);
export const permissionSchema = z.enum(['view', 'create', 'edit', 'delete', 'export']);
export const taskStatusSchema = z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']);
export const taskPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export const priceListTypeSchema = z.enum(['PERCENTAGE', 'FIXED']);

// ============================================
// AUTH SCHEMAS
// ============================================

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters').max(200),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ============================================
// ORGANIZATION SCHEMAS
// ============================================

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  currency: z.string().length(3).optional(),
  taxId: z.string().max(50).optional(),
  lockDate: dateSchema.optional(),
});

// ============================================
// USER SCHEMAS
// ============================================

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().min(2).max(100),
  roleId: cuidSchema,
});

export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(2).max(100).optional(),
  roleId: cuidSchema.optional(),
  status: userStatusSchema.optional(),
});

// ============================================
// ROLE & PERMISSION SCHEMAS
// ============================================

export const createPermissionSchema = z.object({
  module: z.string().min(1),
  actions: z.array(permissionSchema).min(1),
});

export const createRoleSchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().max(200).optional(),
  permissions: z.array(createPermissionSchema).min(1),
});

// ============================================
// CHART OF ACCOUNTS SCHEMAS
// ============================================

export const createAccountSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(2).max(100),
  type: accountTypeSchema,
  parentId: cuidSchema.optional(),
  currency: z.string().length(3).default('USD'),
  description: z.string().max(500).optional(),
});

export const updateAccountSchema = z.object({
  code: z.string().min(1).max(20).optional(),
  name: z.string().min(2).max(100).optional(),
  parentId: cuidSchema.nullable().optional(),
  currency: z.string().length(3).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

// ============================================
// JOURNAL SCHEMAS
// ============================================

export const createJournalLineSchema = z.object({
  accountId: cuidSchema,
  debit: positiveDecimalSchema.default('0'),
  credit: positiveDecimalSchema.default('0'),
  description: z.string().max(500).optional(),
});

export const createJournalSchema = z.object({
  date: dateSchema,
  reference: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  lines: z.array(createJournalLineSchema).min(2, 'Journal must have at least 2 lines'),
}).refine(
  (data) => {
    const totalDebit = data.lines.reduce((sum, line) => sum + parseFloat(line.debit || '0'), 0);
    const totalCredit = data.lines.reduce((sum, line) => sum + parseFloat(line.credit || '0'), 0);
    return Math.abs(totalDebit - totalCredit) < 0.0001;
  },
  { message: 'Total debits must equal total credits', path: ['lines'] }
);

// ============================================
// RECURRING PROFILE SCHEMAS
// ============================================

export const createRecurringProfileSchema = z.object({
  name: z.string().min(2).max(100),
  frequency: recurringFrequencySchema,
  startDate: dateSchema,
  endDate: dateSchema.optional(),
  autoPost: z.boolean().default(false),
  templateData: z.record(z.unknown()),
  entityType: z.string().min(1),
});

// ============================================
// CUSTOMER SCHEMAS
// ============================================

export const createCustomerSchema = z.object({
  name: z.string().min(2).max(200),
  displayName: z.string().max(200).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(20).optional(),
  currency: z.string().length(3).default('USD'),
  taxId: z.string().max(50).optional(),
  billingAddress: addressSchema.optional(),
  shippingAddress: addressSchema.optional(),
  paymentTerms: z.number().int().min(0).max(365).default(0),
  priceListId: cuidSchema.optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

// ============================================
// QUOTE SCHEMAS
// ============================================

export const createQuoteLineSchema = z.object({
  itemId: cuidSchema.optional(),
  description: z.string().min(1).max(500),
  quantity: positiveDecimalSchema,
  rate: positiveDecimalSchema,
  discount: positiveDecimalSchema.default('0'),
  taxRate: positiveDecimalSchema.default('0'),
});

export const createQuoteSchema = z.object({
  customerId: cuidSchema,
  date: dateSchema,
  expiryDate: dateSchema,
  lines: z.array(createQuoteLineSchema).min(1, 'Quote must have at least 1 line item'),
  notes: z.string().max(2000).optional(),
  terms: z.string().max(2000).optional(),
});

export const updateQuoteSchema = createQuoteSchema.partial();

// ============================================
// INVOICE SCHEMAS
// ============================================

export const createInvoiceLineSchema = z.object({
  itemId: cuidSchema.optional(),
  description: z.string().min(1).max(500),
  quantity: positiveDecimalSchema,
  rate: positiveDecimalSchema,
  discount: positiveDecimalSchema.default('0'),
  taxRate: positiveDecimalSchema.default('0'),
});

export const createInvoiceSchema = z.object({
  customerId: cuidSchema,
  quoteId: cuidSchema.optional(),
  date: dateSchema,
  dueDate: dateSchema,
  lines: z.array(createInvoiceLineSchema).min(1, 'Invoice must have at least 1 line item'),
  shippingAmount: positiveDecimalSchema.default('0'),
  notes: z.string().max(2000).optional(),
  terms: z.string().max(2000).optional(),
  projectId: cuidSchema.optional(),
});

export const updateInvoiceSchema = createInvoiceSchema.partial();

// ============================================
// CREDIT NOTE SCHEMAS
// ============================================

export const createCreditNoteSchema = z.object({
  customerId: cuidSchema,
  invoiceId: cuidSchema,
  date: dateSchema,
  reason: z.string().min(1).max(500),
  amount: positiveDecimalSchema,
  type: creditNoteTypeSchema,
  appliedToInvoiceId: cuidSchema.optional(),
});

// ============================================
// PAYMENT RECEIVED SCHEMAS
// ============================================

export const createPaymentAllocationSchema = z.object({
  invoiceId: cuidSchema,
  amount: positiveDecimalSchema,
});

export const createPaymentReceivedSchema = z.object({
  customerId: cuidSchema,
  date: dateSchema,
  amount: positiveDecimalSchema,
  paymentMode: paymentModeSchema,
  depositToAccountId: cuidSchema,
  reference: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  allocations: z.array(createPaymentAllocationSchema).min(1, 'Payment must be allocated to at least 1 invoice'),
});

// ============================================
// VENDOR SCHEMAS
// ============================================

export const createVendorSchema = z.object({
  name: z.string().min(2).max(200),
  displayName: z.string().max(200).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(20).optional(),
  currency: z.string().length(3).default('USD'),
  taxId: z.string().max(50).optional(),
  billingAddress: addressSchema.optional(),
  paymentTerms: z.number().int().min(0).max(365).default(0),
});

export const updateVendorSchema = createVendorSchema.partial();

// ============================================
// EXPENSE SCHEMAS
// ============================================

export const createExpenseSchema = z.object({
  date: dateSchema,
  accountId: cuidSchema,
  vendorId: cuidSchema.optional(),
  amount: positiveDecimalSchema,
  taxRate: positiveDecimalSchema.default('0'),
  taxInclusive: z.boolean().default(false),
  paidThroughAccountId: cuidSchema,
  description: z.string().max(500).optional(),
  reference: z.string().max(100).optional(),
  projectId: cuidSchema.optional(),
});

// ============================================
// BILL SCHEMAS
// ============================================

export const createBillLineSchema = z.object({
  itemId: cuidSchema.optional(),
  accountId: cuidSchema.optional(),
  description: z.string().min(1).max(500),
  quantity: positiveDecimalSchema,
  rate: positiveDecimalSchema,
  taxRate: positiveDecimalSchema.default('0'),
});

export const createBillSchema = z.object({
  billNumber: z.string().min(1).max(50),
  vendorId: cuidSchema,
  date: dateSchema,
  dueDate: dateSchema,
  lines: z.array(createBillLineSchema).min(1, 'Bill must have at least 1 line item'),
  notes: z.string().max(2000).optional(),
  projectId: cuidSchema.optional(),
});

export const updateBillSchema = createBillSchema.partial();

// ============================================
// VENDOR CREDIT SCHEMAS
// ============================================

export const createVendorCreditSchema = z.object({
  vendorId: cuidSchema,
  billId: cuidSchema,
  date: dateSchema,
  reason: z.string().min(1).max(500),
  amount: positiveDecimalSchema,
  appliedToBillId: cuidSchema.optional(),
});

// ============================================
// PAYMENT MADE SCHEMAS
// ============================================

export const createBillAllocationSchema = z.object({
  billId: cuidSchema,
  amount: positiveDecimalSchema,
});

export const createPaymentMadeSchema = z.object({
  vendorId: cuidSchema,
  date: dateSchema,
  amount: positiveDecimalSchema,
  paymentMode: paymentModeSchema,
  paidFromAccountId: cuidSchema,
  reference: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  allocations: z.array(createBillAllocationSchema).min(1, 'Payment must be allocated to at least 1 bill'),
});

// ============================================
// ITEM SCHEMAS
// ============================================

export const createItemSchema = z.object({
  name: z.string().min(2).max(200),
  sku: z.string().min(1).max(50),
  type: itemTypeSchema,
  unit: z.string().max(20).optional(),
  sellingPrice: positiveDecimalSchema,
  salesAccountId: cuidSchema.optional(),
  costPrice: positiveDecimalSchema.default('0'),
  purchaseAccountId: cuidSchema.optional(),
  inventoryAccountId: cuidSchema.optional(),
  description: z.string().max(1000).optional(),
  reorderPoint: z.number().int().min(0).optional(),
  openingStock: z.number().int().min(0).default(0),
});

export const updateItemSchema = createItemSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ============================================
// COMPOSITE ITEM SCHEMAS
// ============================================

export const createCompositeItemComponentSchema = z.object({
  itemId: cuidSchema,
  quantity: z.number().int().min(1),
});

export const createCompositeItemSchema = z.object({
  name: z.string().min(2).max(200),
  sku: z.string().min(1).max(50),
  sellingPrice: positiveDecimalSchema,
  description: z.string().max(1000).optional(),
  components: z.array(createCompositeItemComponentSchema).min(1, 'Bundle must have at least 1 component'),
});

// ============================================
// WAREHOUSE SCHEMAS
// ============================================

export const createWarehouseSchema = z.object({
  name: z.string().min(2).max(100),
  code: z.string().min(1).max(20),
  address: addressSchema.optional(),
  isDefault: z.boolean().default(false),
});

// ============================================
// INVENTORY ADJUSTMENT SCHEMAS
// ============================================

export const createInventoryAdjustmentSchema = z.object({
  date: dateSchema,
  warehouseId: cuidSchema,
  itemId: cuidSchema,
  type: adjustmentTypeSchema,
  quantity: z.number().int().min(1),
  reason: adjustmentReasonSchema,
  accountId: cuidSchema,
  notes: z.string().max(500).optional(),
});

// ============================================
// PRICE LIST SCHEMAS
// ============================================

export const createPriceListItemSchema = z.object({
  itemId: cuidSchema,
  customPrice: positiveDecimalSchema,
});

export const createPriceListSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(['PERCENTAGE', 'FIXED']),
  adjustment: decimalSchema,
  items: z.array(createPriceListItemSchema).optional(),
});

// ============================================
// BANK ACCOUNT SCHEMAS
// ============================================

export const createBankAccountSchema = z.object({
  name: z.string().min(2).max(100),
  accountNumber: z.string().max(30).optional(),
  currency: z.string().length(3).default('USD'),
  type: bankAccountTypeSchema,
  openingBalance: positiveDecimalSchema.default('0'),
  linkedAccountId: cuidSchema,
});

// ============================================
// BANK TRANSACTION SCHEMAS
// ============================================

export const createBankTransactionSchema = z.object({
  bankAccountId: cuidSchema,
  date: dateSchema,
  type: bankTransactionTypeSchema,
  amount: positiveDecimalSchema,
  description: z.string().max(500).optional(),
  reference: z.string().max(100).optional(),
  payee: z.string().max(200).optional(),
});

// ============================================
// BANK RULE SCHEMAS
// ============================================

export const bankRuleConditionSchema = z.object({
  field: z.enum(['description', 'payee', 'amount']),
  operator: z.enum(['contains', 'equals', 'startsWith', 'endsWith']),
  value: z.string().min(1),
});

export const bankRuleActionSchema = z.object({
  type: z.enum(['expense', 'transfer']),
  accountId: cuidSchema,
  vendorId: cuidSchema.optional(),
});

export const createBankRuleSchema = z.object({
  name: z.string().min(2).max(100),
  bankAccountId: cuidSchema.optional(),
  conditions: z.array(bankRuleConditionSchema).min(1),
  action: bankRuleActionSchema,
});

// ============================================
// EMPLOYEE SCHEMAS
// ============================================

export const createEmployeeSchema = z.object({
  employeeId: z.string().min(1).max(20),
  name: z.string().min(2).max(100),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(20).optional(),
  department: z.string().max(100).optional(),
  jobTitle: z.string().max(100).optional(),
  dateOfJoining: dateSchema,
  basicSalary: positiveDecimalSchema,
  allowances: z.record(z.string(), positiveDecimalSchema).default({}),
  deductions: z.record(z.string(), positiveDecimalSchema).default({}),
  bankAccount: z.string().max(50).optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ============================================
// ATTENDANCE SCHEMAS
// ============================================

export const createAttendanceSchema = z.object({
  employeeId: cuidSchema,
  date: dateSchema,
  status: attendanceStatusSchema,
  checkIn: dateSchema.optional(),
  checkOut: dateSchema.optional(),
  notes: z.string().max(500).optional(),
});

// ============================================
// PAYROLL SCHEMAS
// ============================================

export const createPayrollRunSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
});

// ============================================
// BOM SCHEMAS
// ============================================

export const createBOMItemSchema = z.object({
  itemId: cuidSchema,
  quantity: z.number().min(0.01),
});

export const createBOMSchema = z.object({
  name: z.string().min(2).max(100),
  outputItemId: cuidSchema,
  outputQuantity: z.number().int().min(1).default(1),
  operationsCost: positiveDecimalSchema.default('0'),
  items: z.array(createBOMItemSchema).min(1, 'BOM must have at least 1 input item'),
});

// ============================================
// WORK ORDER SCHEMAS
// ============================================

export const createWorkOrderSchema = z.object({
  bomId: cuidSchema,
  quantity: z.number().int().min(1),
  plannedStartDate: dateSchema.optional(),
  notes: z.string().max(1000).optional(),
});

// ============================================
// PRODUCTION ENTRY SCHEMAS
// ============================================

export const createProductionEntrySchema = z.object({
  workOrderId: cuidSchema,
  date: dateSchema,
  quantityProduced: z.number().int().min(1),
  quantityRejected: z.number().int().min(0).default(0),
  wastageQuantity: z.number().int().min(0).default(0),
  notes: z.string().max(1000).optional(),
});

// ============================================
// RECONCILIATION SCHEMAS
// ============================================

export const createReconciliationSchema = z.object({
  bankAccountId: cuidSchema,
  reconciliationDate: dateSchema,
  statementDate: dateSchema,
  statementBalance: decimalSchema,
});

export const updateReconciliationSchema = z.object({
  reconciledBalance: decimalSchema.optional(),
  notes: z.string().max(1000).optional(),
  isCompleted: z.boolean().optional(),
});

// ============================================
// PROJECT SCHEMAS
// ============================================

export const createProjectSchema = z.object({
  name: z.string().min(2).max(200),
  customerId: cuidSchema.optional(),
  billingMethod: billingMethodSchema,
  budgetAmount: positiveDecimalSchema.optional(),
  budgetHours: z.number().min(0).optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  description: z.string().max(2000).optional(),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  status: projectStatusSchema.optional(),
});

// ============================================
// TASK SCHEMAS
// ============================================

export const createTaskSchema = z.object({
  name: z.string().min(2).max(200),
  projectId: cuidSchema,
  description: z.string().max(1000).optional(),
  ratePerHour: positiveDecimalSchema,
  isBillable: z.boolean().default(true),
});

export const updateTaskSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(1000).optional(),
  ratePerHour: positiveDecimalSchema.optional(),
  isBillable: z.boolean().optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
  assigneeId: cuidSchema.optional().nullable(),
  dueDate: dateSchema.optional().nullable(),
  estimatedHours: z.number().min(0).optional(),
  tags: z.array(z.string().max(50)).optional(),
});

// ============================================
// TIMESHEET SCHEMAS
// ============================================

export const createTimesheetEntrySchema = z.object({
  projectId: cuidSchema,
  taskId: cuidSchema.optional(),
  date: dateSchema,
  startTime: dateSchema.optional(),
  endTime: dateSchema.optional(),
  duration: z.number().min(0).optional(),
  description: z.string().max(500).optional(),
  isBillable: z.boolean().default(true),
});

// ============================================
// TAX RATE SCHEMAS
// ============================================

export const createTaxRateSchema = z.object({
  name: z.string().min(2).max(50),
  rate: positiveDecimalSchema,
  type: taxTypeSchema,
  linkedAccountId: cuidSchema,
  isDefault: z.boolean().default(false),
});

// ============================================
// VAT RETURN SCHEMAS
// ============================================

export const createVATReturnSchema = z.object({
  period: z.string().min(1).max(20),
  startDate: dateSchema,
  endDate: dateSchema,
});

// ============================================
// VAT PAYMENT SCHEMAS
// ============================================

export const createVATPaymentSchema = z.object({
  vatReturnId: cuidSchema,
  date: dateSchema,
  amount: positiveDecimalSchema,
  paidFromAccountId: cuidSchema,
  reference: z.string().max(100).optional(),
});

// ============================================
// FIXED ASSET SCHEMAS
// ============================================

export const createAssetSchema = z.object({
  name: z.string().min(2).max(200),
  assetType: z.string().min(1).max(50),
  purchaseDate: dateSchema,
  purchasePrice: positiveDecimalSchema,
  salvageValue: positiveDecimalSchema,
  usefulLife: z.number().int().min(1).max(100),
  depreciationMethod: depreciationMethodSchema,
  assetAccountId: cuidSchema,
  depreciationAccountId: cuidSchema,
});

// ============================================
// LEAD SCHEMAS (CRM)
// ============================================

export const createLeadSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(20).optional(),
  company: z.string().max(200).optional(),
  source: leadSourceSchema,
  notes: z.string().max(2000).optional(),
  assignedToId: cuidSchema.optional(),
});

export const updateLeadSchema = createLeadSchema.partial().extend({
  status: leadStatusSchema.optional(),
});

// ============================================
// DEAL SCHEMAS (CRM)
// ============================================

export const createDealSchema = z.object({
  name: z.string().min(2).max(200),
  leadId: cuidSchema.optional(),
  customerId: cuidSchema.optional(),
  stage: dealStageSchema.default('NEW'),
  value: positiveDecimalSchema,
  expectedCloseDate: dateSchema.optional(),
  notes: z.string().max(2000).optional(),
  assignedToId: cuidSchema.optional(),
});

export const updateDealSchema = createDealSchema.partial();

// ============================================
// TYPE EXPORTS (for TypeScript inference)
// ============================================

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type CreateJournalInput = z.infer<typeof createJournalSchema>;
export type CreateRecurringProfileInput = z.infer<typeof createRecurringProfileSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type CreateCreditNoteInput = z.infer<typeof createCreditNoteSchema>;
export type CreatePaymentReceivedInput = z.infer<typeof createPaymentReceivedSchema>;
export type CreateVendorInput = z.infer<typeof createVendorSchema>;
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type CreateBillInput = z.infer<typeof createBillSchema>;
export type UpdateBillInput = z.infer<typeof updateBillSchema>;
export type CreateVendorCreditInput = z.infer<typeof createVendorCreditSchema>;
export type CreatePaymentMadeInput = z.infer<typeof createPaymentMadeSchema>;
export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type CreateCompositeItemInput = z.infer<typeof createCompositeItemSchema>;
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type CreateInventoryAdjustmentInput = z.infer<typeof createInventoryAdjustmentSchema>;
export type CreatePriceListInput = z.infer<typeof createPriceListSchema>;
export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;
export type CreateBankTransactionInput = z.infer<typeof createBankTransactionSchema>;
export type CreateBankRuleInput = z.infer<typeof createBankRuleSchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type CreateAttendanceInput = z.infer<typeof createAttendanceSchema>;
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;
export type CreateBOMInput = z.infer<typeof createBOMSchema>;
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CreateTimesheetEntryInput = z.infer<typeof createTimesheetEntrySchema>;
export type CreateProductionEntryInput = z.infer<typeof createProductionEntrySchema>;
export type CreateReconciliationInput = z.infer<typeof createReconciliationSchema>;
export type UpdateReconciliationInput = z.infer<typeof updateReconciliationSchema>;
export type CreateTaxRateInput = z.infer<typeof createTaxRateSchema>;
export type CreateVATReturnInput = z.infer<typeof createVATReturnSchema>;
export type CreateVATPaymentInput = z.infer<typeof createVATPaymentSchema>;
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type CreateDealInput = z.infer<typeof createDealSchema>;
export type UpdateDealInput = z.infer<typeof updateDealSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
