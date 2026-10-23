import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import enSales from '@/messages/en/sales.json';
import arSales from '@/messages/ar/sales.json';
import enCommon from '@/messages/en/common.json';
import arCommon from '@/messages/ar/common.json';
import { Customer } from '@/lib/hooks/use-customers';

let testLocale = 'en';

jest.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const messages = (
      testLocale === 'ar'
        ? namespace === 'common'
          ? arCommon
          : arSales
        : namespace === 'common'
          ? enCommon
          : enSales
    ) as Record<string, unknown>;
    return (key: string) => {
      const parts = key.split('.');
      let current: unknown = messages;
      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = (current as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      return typeof current === 'string' ? current : key;
    };
  },
}));

// Country/city/phone pickers and Radix select need browser polyfills; lightweight test doubles
jest.mock('@/components/ui/phone-input', () => ({
  PhoneInput: ({ id, 'aria-label': ariaLabel }: { id?: string; 'aria-label'?: string }) => (
    <input id={id} aria-label={ariaLabel} />
  ),
}));
jest.mock('@/components/ui/country-select', () => ({
  CountrySelect: ({ id, 'aria-label': ariaLabel }: { id?: string; 'aria-label'?: string }) => (
    <input id={id} aria-label={ariaLabel} />
  ),
}));
jest.mock('@/components/ui/city-select', () => ({
  CitySelect: ({ id, 'aria-label': ariaLabel }: { id?: string; 'aria-label'?: string }) => (
    <input id={id} aria-label={ariaLabel} />
  ),
}));
jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: () => null,
  SelectItem: () => null,
  SelectTrigger: ({
    children,
    id,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    id?: string;
    'aria-label'?: string;
  }) => (
    <button type="button" id={id} aria-label={ariaLabel}>
      {children}
    </button>
  ),
  SelectValue: () => null,
}));

import { CustomerForm } from './customer-form';

describe('CustomerForm localization and accessible labels (#372 QA finding regression)', () => {
  beforeEach(() => {
    testLocale = 'en';
  });

  it('renders single-locale English labels without bilingual keyword stacking or invalid phrases', () => {
    testLocale = 'en';
    const { container } = render(<CustomerForm onSubmit={jest.fn()} onCancel={jest.fn()} />);

    // English labels and aria-labels are single-locale clean phrases
    expect(screen.getByLabelText('Customer Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Billing Street')).toBeInTheDocument();
    expect(screen.getByLabelText('Shipping Street')).toBeInTheDocument();
    expect(screen.getByLabelText('Billing Country')).toBeInTheDocument();
    expect(screen.getByLabelText('Shipping Country')).toBeInTheDocument();
    expect(screen.getByLabelText('Billing City')).toBeInTheDocument();
    expect(screen.getByLabelText('Shipping City')).toBeInTheDocument();
    expect(screen.getByLabelText('Billing Postal Code')).toBeInTheDocument();
    expect(screen.getByLabelText('Shipping Postal Code')).toBeInTheDocument();

    // No bilingual keyword stacking (slash-delimited multilingual text)
    const elementsWithAria = container.querySelectorAll('[aria-label]');
    expect(elementsWithAria.length).toBeGreaterThanOrEqual(10);
    elementsWithAria.forEach((el) => {
      const label = el.getAttribute('aria-label') || '';
      expect(label).not.toContain(' / ');
      expect(label).not.toContain('مشاركة');
    });

    expect(container.textContent).not.toContain('مشاركة');
  });

  it('renders correct MSA Arabic labels in Arabic locale without mistranslated "مشاركة" fragments', () => {
    testLocale = 'ar';
    const { container } = render(<CustomerForm onSubmit={jest.fn()} onCancel={jest.fn()} />);

    // Arabic labels use correct MSA terminology
    expect(screen.getByLabelText('اسم العميل')).toBeInTheDocument();
    expect(screen.getByLabelText('شارع الفوترة')).toBeInTheDocument();
    expect(screen.getByLabelText('دولة الفوترة')).toBeInTheDocument();
    expect(screen.getByLabelText('مدينة الفوترة')).toBeInTheDocument();
    expect(screen.getByLabelText('الرمز البريدي لعنوان الفوترة')).toBeInTheDocument();
    expect(screen.getByLabelText('شارع الشحن')).toBeInTheDocument();
    expect(screen.getByLabelText('دولة الشحن')).toBeInTheDocument();
    expect(screen.getByLabelText('مدينة الشحن')).toBeInTheDocument();
    expect(screen.getByLabelText('الرمز البريدي لعنوان الشحن')).toBeInTheDocument();

    // Verify copy-from-billing button in Arabic
    expect(screen.getByRole('button', { name: 'نسخ من الفوترة' })).toBeInTheDocument();

    // Ensure completely free of "مشاركة" mistranslations everywhere in text and aria-labels
    expect(container.textContent).not.toContain('مشاركة');
    expect(container.textContent).not.toContain('مشاركة الشارع');
    expect(container.textContent).not.toContain('مشاركة الدولة');
    expect(container.textContent).not.toContain('مشاركة المدينة');
    expect(container.textContent).not.toContain('مشاركة البريد');

    const elementsWithAria = container.querySelectorAll('[aria-label]');
    expect(elementsWithAria.length).toBeGreaterThanOrEqual(10);
    elementsWithAria.forEach((el) => {
      const label = el.getAttribute('aria-label') || '';
      expect(label).not.toContain('مشاركة');
      expect(label).not.toContain('مشاركة الشارع');
      expect(label).not.toContain('مشاركة الدولة');
      expect(label).not.toContain('مشاركة المدينة');
      expect(label).not.toContain('مشاركة البريد');
      expect(label).not.toContain(' / ');
    });
  });

  it('handles cancel and submit actions with localized button labels', async () => {
    const handleCancel = jest.fn();
    const handleSubmit = jest.fn();

    // English create button
    testLocale = 'en';
    const { rerender } = render(<CustomerForm onSubmit={handleSubmit} onCancel={handleCancel} />);

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    const createBtn = screen.getByRole('button', { name: 'Create Customer' });
    expect(cancelBtn).toBeInTheDocument();
    expect(createBtn).toBeInTheDocument();

    fireEvent.click(cancelBtn);
    expect(handleCancel).toHaveBeenCalledTimes(1);

    // Arabic update button
    testLocale = 'ar';
    const mockCustomer: Partial<Customer> = {
      id: 'cust-1',
      name: 'عميل تجريبي',
      email: 'test@example.com',
      phone: '',
      currency: 'SAR',
      taxId: '',
      paymentTerms: 30,
      notes: '',
    };
    rerender(
      <CustomerForm
        customer={mockCustomer as Customer}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />,
    );

    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تحديث العميل' })).toBeInTheDocument();
  });
});
