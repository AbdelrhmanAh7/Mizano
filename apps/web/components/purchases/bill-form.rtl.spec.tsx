import React from 'react';
import { render, screen } from '@testing-library/react';
import { BillForm } from './bill-form';

let mockLocale: 'en' | 'ar' = 'en';

jest.mock('next-intl', () => {
  const messages = {
    en: {
      purchases: jest.requireActual('@/messages/en/purchases.json'),
      ai: jest.requireActual('@/messages/en/ai.json'),
      common: jest.requireActual('@/messages/en/common.json'),
    },
    ar: {
      purchases: jest.requireActual('@/messages/ar/purchases.json'),
      ai: jest.requireActual('@/messages/ar/ai.json'),
      common: jest.requireActual('@/messages/ar/common.json'),
    },
  };
  const lookup = (path: string): unknown =>
    path
      .split('.')
      .reduce<unknown>(
        (node, part) =>
          node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
        messages[mockLocale],
      );
  return {
    useTranslations: (namespace: string) => {
      const t = (key: string, values?: Record<string, string | number>) =>
        String(lookup(`${namespace}.${key}`) ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
          String(values?.[name] ?? ''),
        );
      t.has = (key: string) => typeof lookup(`${namespace}.${key}`) === 'string';
      return t;
    },
  };
});

jest.mock('@/lib/hooks/use-vendors', () => ({
  useVendors: () => ({
    data: { data: [{ id: 'vendor-1', name: 'Acme Supplies', paymentTerms: 30 }] },
  }),
}));

describe('BillForm localization & RTL buttons', () => {
  beforeEach(() => {
    mockLocale = 'en';
  });

  it('renders English action buttons and form labels in en locale', () => {
    mockLocale = 'en';
    render(<BillForm onSubmit={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Create Bill' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByText('Vendor')).toBeInTheDocument();
    expect(screen.getByText('Bill Date')).toBeInTheDocument();
    expect(screen.getByText('Due Date')).toBeInTheDocument();
  });

  it('renders localized Arabic action buttons and canonical form labels in ar locale', () => {
    mockLocale = 'ar';
    render(<BillForm onSubmit={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'إنشاء فاتورة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeInTheDocument();
    expect(screen.getByText('المورد')).toBeInTheDocument();
    expect(screen.getByText('تاريخ الفاتورة')).toBeInTheDocument();
    expect(screen.getByText('تاريخ الاستحقاق')).toBeInTheDocument();
  });

  it('renders localized update button in edit mode', () => {
    const mockBill: React.ComponentProps<typeof BillForm>['bill'] = {
      id: 'bill-123',
      organizationId: 'org-1',
      vendorId: 'vendor-1',
      billNumber: 'BILL-001',
      date: '2026-09-01',
      dueDate: '2026-10-01',
      status: 'DRAFT',
      subtotal: '100.0000',
      taxAmount: '15.0000',
      grandTotal: '115.0000',
      balanceDue: '115.0000',
      currencyCode: 'USD',
      reference: null,
      notes: null,
      projectId: null,
      deletedAt: null,
      lines: [
        {
          id: 'line-1',
          description: 'Item 1',
          quantity: '1.0000',
          rate: '100.0000',
          taxRate: '15.00',
          amount: '115.0000',
        },
      ],
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };

    mockLocale = 'en';
    const { unmount } = render(
      <BillForm bill={mockBill} onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Update Bill' })).toBeInTheDocument();
    unmount();

    mockLocale = 'ar';
    render(<BillForm bill={mockBill} onSubmit={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'تحديث الفاتورة' })).toBeInTheDocument();
  });
});
