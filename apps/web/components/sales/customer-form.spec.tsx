import React from 'react';
import { render, screen } from '@testing-library/react';
import { CustomerForm } from './customer-form';
import type { Customer } from '@/lib/hooks/use-customers';

// Mock next-intl
let mockLocale = 'en';
jest.mock('next-intl', () => ({
  useLocale: () => mockLocale,
  useTranslations: () => (key: string) => {
    // Provide translations if used
    const messages: Record<string, Record<string, string>> = {
      en: {
        'customers.form.createCustomer': 'Create Customer',
        'customers.form.updateCustomer': 'Update Customer',
        'customers.form.saving': 'Saving...',
        'customers.form.cancel': 'Cancel',
        'customers.form.copyFromBilling': 'Copy from Billing',
      },
      ar: {
        'customers.form.createCustomer': 'إنشاء عميل',
        'customers.form.updateCustomer': 'تحديث العميل',
        'customers.form.saving': 'جارٍ الحفظ…',
        'customers.form.cancel': 'إلغاء',
        'customers.form.copyFromBilling': 'نسخ من عنوان الفوترة',
      },
    };
    return messages[mockLocale]?.[key] || key;
  },
}));

// Mock PhoneInput to avoid extra DOM requirements
jest.mock('@/components/ui/phone-input', () => ({
  PhoneInput: ({
    id,
    value,
    onChange,
  }: {
    id: string;
    value: string;
    onChange: (v: string) => void;
  }) => <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />,
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

describe('CustomerForm - Submit Button & Action Localization', () => {
  const defaultProps = {
    onSubmit: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    mockLocale = 'en';
    jest.clearAllMocks();
  });

  describe('AC4: Create mode button text & aria-label', () => {
    it('renders "Create Customer" for visible text and aria-label in English', () => {
      mockLocale = 'en';
      render(<CustomerForm {...defaultProps} customer={null} />);
      const button = screen.getByRole('button', { name: 'Create Customer' });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('type', 'submit');
      expect(button).toHaveAttribute('aria-label', 'Create Customer');
      expect(button).toHaveTextContent('Create Customer');
    });

    it('renders "إنشاء عميل" for visible text and aria-label in Arabic', () => {
      mockLocale = 'ar';
      render(<CustomerForm {...defaultProps} customer={null} />);
      const button = screen.getByRole('button', { name: 'إنشاء عميل' });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('type', 'submit');
      expect(button).toHaveAttribute('aria-label', 'إنشاء عميل');
      expect(button).toHaveTextContent('إنشاء عميل');
    });

    it('localizes address field labels (Country / City) in English', () => {
      mockLocale = 'en';
      render(<CustomerForm {...defaultProps} customer={null} />);
      expect(screen.getAllByText('Country').length).toBeGreaterThan(0);
      expect(screen.getAllByText('City').length).toBeGreaterThan(0);
    });

    it('localizes address field labels (دولة / المدينة) in Arabic', () => {
      mockLocale = 'ar';
      render(<CustomerForm {...defaultProps} customer={null} />);
      expect(screen.getAllByText('دولة').length).toBeGreaterThan(0);
      expect(screen.getAllByText('المدينة').length).toBeGreaterThan(0);
    });
  });

  describe('AC5: Update mode button text & aria-label', () => {
    it('renders "Update Customer" for visible text and aria-label in English', () => {
      mockLocale = 'en';
      render(<CustomerForm {...defaultProps} customer={mockCustomer} />);
      const button = screen.getByRole('button', { name: 'Update Customer' });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('type', 'submit');
      expect(button).toHaveAttribute('aria-label', 'Update Customer');
      expect(button).toHaveTextContent('Update Customer');
    });

    it('renders "تحديث العميل" for visible text and aria-label in Arabic', () => {
      mockLocale = 'ar';
      render(<CustomerForm {...defaultProps} customer={mockCustomer} />);
      const button = screen.getByRole('button', { name: 'تحديث العميل' });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('type', 'submit');
      expect(button).toHaveAttribute('aria-label', 'تحديث العميل');
      expect(button).toHaveTextContent('تحديث العميل');
    });
  });

  describe('AC6: Submitting state button text & aria-label', () => {
    it('renders disabled "Saving..." for visible text and aria-label in English', () => {
      mockLocale = 'en';
      render(<CustomerForm {...defaultProps} customer={null} isSubmitting={true} />);
      const button = screen.getByRole('button', { name: 'Saving...' });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-label', 'Saving...');
      expect(button).toHaveTextContent('Saving...');
    });

    it('renders disabled "جارٍ الحفظ…" for visible text and aria-label in Arabic', () => {
      mockLocale = 'ar';
      render(<CustomerForm {...defaultProps} customer={null} isSubmitting={true} />);
      const button = screen.getByRole('button', { name: 'جارٍ الحفظ…' });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-label', 'جارٍ الحفظ…');
      expect(button).toHaveTextContent('جارٍ الحفظ…');
    });
  });
});
