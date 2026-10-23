import React from 'react';
import { render, screen } from '@testing-library/react';
import enSales from '@/messages/en/sales.json';
import arSales from '@/messages/ar/sales.json';
import enCommon from '@/messages/en/common.json';
import arCommon from '@/messages/ar/common.json';
import type { Customer } from '@/lib/hooks/use-customers';
import { CustomerForm } from './customer-form';

let testLocale = 'en';

jest.mock('next-intl', () => ({
  useLocale: () => testLocale,
  useTranslations: (ns: string) => {
    const msgs = (
      testLocale === 'ar'
        ? ns === 'common'
          ? arCommon
          : arSales
        : ns === 'common'
          ? enCommon
          : enSales
    ) as Record<string, unknown>;
    return (key: string) => {
      const val = key
        .split('.')
        .reduce<unknown>(
          (acc, p) =>
            acc && typeof acc === 'object' && p in acc
              ? (acc as Record<string, unknown>)[p]
              : undefined,
          msgs,
        );
      return typeof val === 'string' ? val : key;
    };
  },
}));

jest.mock('@/components/ui/phone-input', () => ({
  PhoneInput: ({ id }: { id?: string }) => <input id={id} />,
}));
jest.mock('@/components/ui/country-select', () => ({
  CountrySelect: ({ id }: { id?: string }) => <input id={id} />,
}));
jest.mock('@/components/ui/city-select', () => ({
  CitySelect: ({ id }: { id?: string }) => <input id={id} />,
}));
jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: () => null,
  SelectItem: () => null,
  SelectTrigger: ({ children, id }: { children: React.ReactNode; id?: string }) => (
    <button type="button" id={id}>
      {children}
    </button>
  ),
  SelectValue: () => null,
}));

const mockCustomer: Customer = {
  id: 'cust-1',
  name: 'Existing Customer',
  displayName: 'Existing Display',
  email: 'existing@example.com',
  phone: '+1-555-0100',
  currency: 'USD',
  taxId: 'TAX123',
  paymentTerms: 30,
  notes: 'Existing notes',
  billingStreet: '123 Main St',
  billingCity: 'New York',
  billingState: 'NY',
  billingPostalCode: '10001',
  billingCountry: 'US',
  shippingStreet: '456 Oak Ave',
  shippingCity: 'Brooklyn',
  shippingState: 'NY',
  shippingPostalCode: '11201',
  shippingCountry: 'US',
  priceListId: null,
  organizationId: 'org-1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  deletedAt: null,
  outstandingBalance: '0',
};

describe('CustomerForm submit button localization and distinction (#316 AC4, AC5, AC6)', () => {
  const defaultProps = {
    onSubmit: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    testLocale = 'en';
    jest.clearAllMocks();
  });

  describe('AC4: Create mode button text & aria-label', () => {
    it('renders "Create Customer" for visible text and aria-label in English', () => {
      testLocale = 'en';
      render(<CustomerForm {...defaultProps} customer={null} />);
      const button = screen.getByRole('button', { name: 'Create Customer' });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('type', 'submit');
      expect(button).toHaveAttribute('aria-label', 'Create Customer');
      expect(button).toHaveTextContent('Create Customer');
      expect(button).toBeEnabled();
    });

    it('renders "إنشاء عميل" for visible text and aria-label in Arabic', () => {
      testLocale = 'ar';
      render(<CustomerForm {...defaultProps} customer={null} />);
      const button = screen.getByRole('button', { name: 'إنشاء عميل' });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('type', 'submit');
      expect(button).toHaveAttribute('aria-label', 'إنشاء عميل');
      expect(button).toHaveTextContent('إنشاء عميل');
      expect(button).toBeEnabled();
    });
  });

  describe('AC5: Update mode button text & aria-label', () => {
    it('renders "Update Customer" for visible text and aria-label in English', () => {
      testLocale = 'en';
      render(<CustomerForm {...defaultProps} customer={mockCustomer} />);
      const button = screen.getByRole('button', { name: 'Update Customer' });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('type', 'submit');
      expect(button).toHaveAttribute('aria-label', 'Update Customer');
      expect(button).toHaveTextContent('Update Customer');
      expect(button).toBeEnabled();
    });

    it('renders "تحديث العميل" for visible text and aria-label in Arabic', () => {
      testLocale = 'ar';
      render(<CustomerForm {...defaultProps} customer={mockCustomer} />);
      const button = screen.getByRole('button', { name: 'تحديث العميل' });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('type', 'submit');
      expect(button).toHaveAttribute('aria-label', 'تحديث العميل');
      expect(button).toHaveTextContent('تحديث العميل');
      expect(button).toBeEnabled();
    });
  });

  describe('AC6: Submitting / pending state', () => {
    it('renders "Saving..." and is disabled in English while submitting', () => {
      testLocale = 'en';
      render(<CustomerForm {...defaultProps} customer={null} isSubmitting={true} />);
      const button = screen.getByRole('button', { name: 'Saving...' });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-label', 'Saving...');
      expect(button).toHaveTextContent('Saving...');
    });

    it('renders "جارٍ الحفظ…" and is disabled in Arabic while submitting', () => {
      testLocale = 'ar';
      render(<CustomerForm {...defaultProps} customer={null} isSubmitting={true} />);
      const button = screen.getByRole('button', { name: 'جارٍ الحفظ…' });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-label', 'جارٍ الحفظ…');
      expect(button).toHaveTextContent('جارٍ الحفظ…');
    });
  });

  describe('Action buttons (Cancel & Copy from Billing)', () => {
    it('renders localized cancel button text in English and Arabic', () => {
      testLocale = 'en';
      const { rerender } = render(<CustomerForm {...defaultProps} customer={null} />);
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

      testLocale = 'ar';
      rerender(<CustomerForm {...defaultProps} customer={null} />);
      expect(screen.getByRole('button', { name: 'إلغاء' })).toBeInTheDocument();
    });

    it('renders localized copy from billing button text in English and Arabic', () => {
      testLocale = 'en';
      const { rerender } = render(<CustomerForm {...defaultProps} customer={null} />);
      expect(screen.getByRole('button', { name: 'Copy from Billing' })).toBeInTheDocument();

      testLocale = 'ar';
      rerender(<CustomerForm {...defaultProps} customer={null} />);
      expect(screen.getByRole('button', { name: 'نسخ من عنوان الفوترة' })).toBeInTheDocument();
    });
  });
});
