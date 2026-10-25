import React from 'react';
import { render, screen } from '@testing-library/react';
import { CustomerForm } from './customer-form';
import enSales from '@/messages/en/sales.json';
import arSales from '@/messages/ar/sales.json';

let activeCatalogue: Record<string, unknown> = enSales;

jest.mock('next-intl', () => ({
  useTranslations:
    (scope: string) =>
    (key: string, values?: Record<string, string | number>): string => {
      const path = `${scope}.${key}`.split('.').slice(1);
      const raw = path.reduce<unknown>(
        (node, part) => (node as Record<string, unknown> | undefined)?.[part],
        activeCatalogue,
      );
      if (typeof raw !== 'string') throw new Error(`missing message ${scope}.${key}`);
      return raw.replace(/\{(\w+)\}/g, (_m, name: string) => String(values?.[name]));
    },
}));

function renderForm(sales: Record<string, unknown>) {
  activeCatalogue = sales;
  return render(<CustomerForm onSubmit={jest.fn()} onCancel={jest.fn()} />);
}

describe('CustomerForm localisation (#490)', () => {
  it('renders English labels from the en catalogue', () => {
    renderForm(enSales);
    expect(screen.getByText('Basic Information')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Customer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('renders Arabic only, with no English leftovers, in the ar catalogue', () => {
    renderForm(arSales);
    expect(screen.getByText('المعلومات الأساسية')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إنشاء عميل' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeInTheDocument();
    expect(screen.queryByText('Basic Information')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Postal code')).not.toBeInTheDocument();
    expect(screen.getAllByPlaceholderText('الرمز البريدي')).toHaveLength(2);
  });

  it('keeps en and ar customer form catalogues key-aligned', () => {
    expect(Object.keys(arSales.customers.form).sort()).toEqual(
      Object.keys(enSales.customers.form).sort(),
    );
  });
});
