import { Decimal } from '@prisma/client/runtime/library';

export function createMockBill(overrides: Record<string, unknown> = {}) {
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

export function createMockJournalEntry(overrides: Record<string, unknown> = {}) {
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

export function createMockJournalLine(overrides: Record<string, unknown> = {}) {
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

export function createMockCustomer(overrides: Record<string, unknown> = {}) {
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

export function createMockVendor(overrides: Record<string, unknown> = {}) {
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
