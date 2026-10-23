import React from 'react';
import { render, screen } from '@testing-library/react';
import { BillForm } from './bill-form';
import type { Bill } from '@/lib/hooks/use-bills';

let mockLocale: 'en' | 'ar' = 'en';

jest.mock('next-intl', () => {
  const messages = {
    en: {
      purchases: jest.requireActual('@/messages/en/purchases.json'),
      ai: { intake: {} },
    },
    ar: {
      purchases: jest.requireActual('@/messages/ar/purchases.json'),
      ai: { intake: {} },
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
    data: { data: [{ id: 'vendor-1', name: 'Al-Amal Supplies', paymentTerms: 30 }] },
  }),
}));

describe('BillForm localization and RTL action buttons', () => {
  beforeEach(() => {
    mockLocale = 'en';
  });

  it('renders submit, cancel, and headers in English when locale is en', () => {
    mockLocale = 'en';
    render(<BillForm onSubmit={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Create Bill' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByText('Bill Information')).toBeInTheDocument();
    expect(screen.getByText('Line Items')).toBeInTheDocument();
  });

  it('renders submit, cancel, and headers in Arabic when locale is ar', () => {
    mockLocale = 'ar';
    render(<BillForm onSubmit={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'إنشاء فاتورة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeInTheDocument();
    expect(screen.getByText('بيانات الفاتورة')).toBeInTheDocument();
    expect(screen.getByText('بنود الفاتورة')).toBeInTheDocument();
    expect(screen.getByText('المجموع الفرعي')).toBeInTheDocument();
    expect(screen.getByText('الضريبة')).toBeInTheDocument();
    expect(screen.getAllByText('الإجمالي').length).toBeGreaterThanOrEqual(2);
  });

  it('renders Update Bill in English and Arabic when editing', () => {
    const existingBill = {
      id: 'bill-1',
      vendorId: 'vendor-1',
      date: '2026-10-01T00:00:00.000Z',
      dueDate: '2026-10-31T00:00:00.000Z',
      billNumber: 'BILL-001',
      status: 'DRAFT',
      currencyCode: 'SAR',
      totalAmount: 100,
      lines: [],
    } as unknown as Bill;

    mockLocale = 'en';
    const { unmount } = render(
      <BillForm bill={existingBill} onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Update Bill' })).toBeInTheDocument();
    unmount();

    mockLocale = 'ar';
    render(<BillForm bill={existingBill} onSubmit={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'تحديث الفاتورة' })).toBeInTheDocument();
  });

  it('renders Saving... state in English and Arabic', () => {
    mockLocale = 'en';
    const { unmount } = render(
      <BillForm isSubmitting={true} onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    unmount();

    mockLocale = 'ar';
    render(<BillForm isSubmitting={true} onSubmit={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'جارٍ الحفظ...' })).toBeDisabled();
  });
});
