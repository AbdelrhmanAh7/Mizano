/**
 * Manual QA: the vendor form was English only, offered new vendors in USD in an EGP
 * organization, and showed "Due on Receipt" vendors as Net 30 when editing (0 || 30).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { VendorForm } from './vendor-form';
import type { Vendor } from '@/lib/hooks/use-vendors';

jest.mock('next-intl', () => {
  const messages = {
    purchases: jest.requireActual('@/messages/ar/purchases.json'),
    common: jest.requireActual('@/messages/ar/common.json'),
  };
  const lookup = (path: string): unknown =>
    path
      .split('.')
      .reduce<unknown>(
        (node, part) =>
          node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
        messages,
      );
  return {
    useLocale: () => 'ar',
    useTranslations: (namespace: string) => {
      const t = (key: string) => String(lookup(`${namespace}.${key}`) ?? key);
      t.has = (key: string) => typeof lookup(`${namespace}.${key}`) === 'string';
      return t;
    },
  };
});
jest.mock('@/lib/hooks/use-organization', () => ({
  ...jest.requireActual('@/lib/hooks/use-organization'),
  useBaseCurrency: () => 'EGP',
}));

const selectValue = (optionValue: string): string | undefined =>
  Array.from(document.querySelectorAll('select')).find((s) =>
    Array.from(s.options).some((o) => o.value === optionValue),
  )?.value;

describe('VendorForm', () => {
  it('is Arabic and starts a new vendor in the organization base currency', () => {
    render(<VendorForm onSubmit={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByText('المعلومات الأساسية')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إنشاء المورد' })).toBeInTheDocument();
    expect(screen.queryByText('Basic Information')).toBeNull();
    expect(selectValue('USD')).toBe('EGP');
  });

  it('keeps "Due on Receipt" (0 days) when editing a vendor', () => {
    const vendor = { id: 'v1', name: 'Delta', currency: 'EGP', paymentTerms: 0 } as Vendor;
    render(<VendorForm vendor={vendor} onSubmit={jest.fn()} onCancel={jest.fn()} />);
    expect(selectValue('15')).toBe('0');
  });
});
