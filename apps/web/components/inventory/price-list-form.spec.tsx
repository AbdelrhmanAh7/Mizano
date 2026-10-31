/**
 * Manual QA: creating a price list from the UI was a 500 ("[DecimalError] Invalid argument:
 * undefined"): the form posted type SALES/PURCHASE (not an API type) and no adjustment.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PriceListForm } from './price-list-form';

jest.mock('next-intl', () => {
  const messages = { inventory: jest.requireActual('@/messages/ar/inventory.json') };
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

describe('PriceListForm', () => {
  it('posts an API price list type and a decimal-string adjustment', async () => {
    const onSubmit = jest.fn();
    render(<PriceListForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/اسم قائمة الأسعار/), {
      target: { value: 'أسعار الجملة' },
    });
    fireEvent.change(screen.getByLabelText(/التعديل/), { target: { value: '-10.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'قائمة أسعار جديدة' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'أسعار الجملة',
      description: undefined,
      type: 'PERCENTAGE',
      adjustment: '-10.5',
    });
  });

  it('refuses a malformed adjustment with an Arabic message', async () => {
    const onSubmit = jest.fn();
    render(<PriceListForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/اسم قائمة الأسعار/), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText(/التعديل/), { target: { value: '10%' } });
    fireEvent.click(screen.getByRole('button', { name: 'قائمة أسعار جديدة' }));
    expect(await screen.findByText(/أدخل رقمًا بحد أقصى 4 منازل عشرية/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
