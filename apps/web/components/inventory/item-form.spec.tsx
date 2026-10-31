/**
 * Manual QA: creating an item from the UI always failed with 400 ("property salesPrice should
 * not exist"): the form posted salesPrice/purchasePrice/taxRateId/trackInventory, which the
 * items API whitelist rejects, as JS numbers. It was English only on the Arabic UI too.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ItemForm, toItemPayload } from './item-form';
import type { Item } from '@/lib/hooks/use-items';

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

const API_FIELDS = [
  'name',
  'sku',
  'type',
  'unit',
  'description',
  'sellingPrice',
  'costPrice',
  'reorderPoint',
  'salesAccountId',
  'purchaseAccountId',
  'inventoryAccountId',
];

describe('ItemForm', () => {
  it('submits only CreateItemDto fields, with decimal-string prices', async () => {
    const onSubmit = jest.fn();
    render(<ItemForm accounts={[]} onSubmit={onSubmit} onCancel={jest.fn()} />);
    expect(screen.getByText('المعلومات الأساسية')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/اسم الصنف/), { target: { value: ' تركيب نظام ' } });
    fireEvent.change(screen.getByLabelText(/رمز الصنف/), { target: { value: 'SRV-9' } });
    fireEvent.change(screen.getByLabelText(/سعر البيع/), { target: { value: '750.125' } });
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء الصنف' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(Object.keys(payload).every((key) => API_FIELDS.includes(key))).toBe(true);
    expect(payload).toEqual(
      expect.objectContaining({
        name: 'تركيب نظام',
        sku: 'SRV-9',
        type: 'GOODS',
        sellingPrice: '750.125',
        costPrice: '0',
        description: null,
        salesAccountId: null,
      }),
    );
  });

  it('requires a SKU and a valid price, in Arabic', async () => {
    const onSubmit = jest.fn();
    render(<ItemForm accounts={[]} onSubmit={onSubmit} onCancel={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/اسم الصنف/), { target: { value: 'صنف' } });
    fireEvent.change(screen.getByLabelText(/سعر البيع/), { target: { value: '1.23456' } });
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء الصنف' }));
    expect(await screen.findByText('رمز الصنف مطلوب')).toBeInTheDocument();
    expect(screen.getByText('أدخل مبلغًا غير سالب بحد أقصى 4 منازل عشرية')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps the stored prices of an item being edited', () => {
    const item = {
      id: 'i1',
      name: 'Cable',
      sku: 'C-1',
      type: 'GOODS',
      sellingPrice: '12.5000',
      costPrice: '7.2500',
    } as Item;
    render(<ItemForm item={item} accounts={[]} onSubmit={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByLabelText(/سعر البيع/)).toHaveValue('12.5000');
    expect(screen.getByLabelText(/سعر التكلفة/)).toHaveValue('7.2500');
  });
});

describe('toItemPayload', () => {
  it('clears stock fields for a service and sends null for cleared optional fields', () => {
    expect(
      toItemPayload({
        name: 'Support',
        sku: 'SUP',
        description: '',
        type: 'SERVICE',
        unit: 'hr',
        sellingPrice: '100',
        costPrice: '0',
        reorderPoint: '5',
        salesAccountId: 'acc-1',
        purchaseAccountId: '',
        inventoryAccountId: 'acc-3',
      }),
    ).toEqual({
      name: 'Support',
      sku: 'SUP',
      type: 'SERVICE',
      unit: 'hr',
      description: null,
      sellingPrice: '100',
      costPrice: '0',
      reorderPoint: null,
      salesAccountId: 'acc-1',
      purchaseAccountId: null,
      inventoryAccountId: null,
    });
  });
});
