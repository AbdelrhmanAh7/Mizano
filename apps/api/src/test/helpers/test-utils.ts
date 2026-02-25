import { Decimal } from '@prisma/client/runtime/library';

/**
 * Test factory functions for creating mock domain objects.
 * All factories return properly-typed objects with sensible defaults.
 * Override any field by passing a partial.
 */

export function createMockOrganization(overrides: Record<string, any> = {}) {
  return {
    id: 'org-test-001',
    name: 'Test Organization',
    slug: 'test-org',
    currency: 'USD',
    fiscalYearStart: 1,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

export function createMockUser(overrides: Record<string, any> = {}) {
  return {
    id: 'user-test-001',
    email: 'test@mizano.com',
    name: 'Test User',
    organizationId: 'org-test-001',
    roleId: 'role-admin-001',
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

export function createMockInvoice(overrides: Record<string, any> = {}) {
  return {
    id: 'inv-test-001',
    number: 'INV-2024-00001',
    organizationId: 'org-test-001',
    customerId: 'cust-test-001',
    status: 'DRAFT',
    subtotal: new Decimal('1000.0000'),
    tax: new Decimal('150.0000'),
    total: new Decimal('1150.0000'),
    balanceDue: new Decimal('1150.0000'),
    dueDate: new Date('2024-02-01'),
    issueDate: new Date('2024-01-01'),
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

export function createMockBill(overrides: Record<string, any> = {}) {
  return {
    id: 'bill-test-001',
    number: 'BILL-2024-00001',
    organizationId: 'org-test-001',
    vendorId: 'vendor-test-001',
    vendorBillNumber: 'VB-001',
    status: 'DRAFT',
    subtotal: new Decimal('500.0000'),
    tax: new Decimal('75.0000'),
    total: new Decimal('575.0000'),
    balanceDue: new Decimal('575.0000'),
    dueDate: new Date('2024-02-15'),
    billDate: new Date('2024-01-15'),
    deletedAt: null,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
    ...overrides,
  };
}

export function createMockJournalEntry(overrides: Record<string, any> = {}) {
  return {
    id: 'jrn-test-001',
    number: 'JRN-2024-00001',
    organizationId: 'org-test-001',
    date: new Date('2024-01-01'),
    description: 'Test journal entry',
    status: 'DRAFT',
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    lines: [],
    ...overrides,
  };
}

export function createMockJournalLine(overrides: Record<string, any> = {}) {
  return {
    id: 'line-test-001',
    journalId: 'jrn-test-001',
    accountId: 'acc-test-001',
    debit: new Decimal('0.0000'),
    credit: new Decimal('0.0000'),
    description: '',
    ...overrides,
  };
}

export function createMockCustomer(overrides: Record<string, any> = {}) {
  return {
    id: 'cust-test-001',
    organizationId: 'org-test-001',
    name: 'Test Customer',
    email: 'customer@test.com',
    phone: '+1234567890',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

export function createMockVendor(overrides: Record<string, any> = {}) {
  return {
    id: 'vendor-test-001',
    organizationId: 'org-test-001',
    name: 'Test Vendor',
    email: 'vendor@test.com',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

export function createMockItem(overrides: Record<string, any> = {}) {
  return {
    id: 'item-test-001',
    organizationId: 'org-test-001',
    name: 'Test Item',
    sku: 'TST-001',
    type: 'GOODS',
    unit: 'PCS',
    sellingPrice: new Decimal('100.0000'),
    costPrice: new Decimal('60.0000'),
    stockOnHand: new Decimal('50.0000'),
    reorderPoint: new Decimal('10.0000'),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

export function createMockEmployee(overrides: Record<string, any> = {}) {
  return {
    id: 'emp-test-001',
    organizationId: 'org-test-001',
    employeeId: 'EMP-001',
    name: 'Test Employee',
    email: 'employee@test.com',
    department: 'Engineering',
    jobTitle: 'Developer',
    basicSalary: new Decimal('5000.0000'),
    status: 'ACTIVE',
    isActive: true,
    joinDate: new Date('2023-01-01'),
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

export function createMockBankAccount(overrides: Record<string, any> = {}) {
  return {
    id: 'bank-test-001',
    organizationId: 'org-test-001',
    name: 'Test Bank Account',
    accountNumber: '****1234',
    currency: 'USD',
    type: 'CHECKING',
    balance: new Decimal('10000.0000'),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Generate a sequence of dates for testing time-series data
 */
export function generateDateSequence(
  startDate: Date,
  count: number,
  intervalDays: number = 30,
): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i * intervalDays);
    dates.push(date);
  }
  return dates;
}

/**
 * Generate mock time series data with optional trend and seasonality
 */
export function generateTimeSeries(
  length: number,
  options: {
    base?: number;
    trend?: number;
    seasonalAmplitude?: number;
    seasonLength?: number;
    noise?: number;
  } = {},
): number[] {
  const { base = 100, trend = 0, seasonalAmplitude = 0, seasonLength = 12, noise = 0 } = options;

  return Array.from({ length }, (_, i) => {
    const trendComponent = trend * i;
    const seasonalComponent = seasonalAmplitude * Math.sin((2 * Math.PI * i) / seasonLength);
    const noiseComponent = noise * (Math.random() - 0.5) * 2;
    return base + trendComponent + seasonalComponent + noiseComponent;
  });
}
