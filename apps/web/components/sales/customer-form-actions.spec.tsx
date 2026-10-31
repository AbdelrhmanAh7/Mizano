import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import en from '@/messages/en/sales.json';
import ar from '@/messages/ar/sales.json';
import type { Customer } from '@/lib/hooks/use-customers';
import { CustomerForm } from './customer-form';

// next-intl is ESM; keep the existing Jest config and read the real catalog here.
let mockFormMessages: Record<string, string>;
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => mockFormMessages[key] ?? key,
}));

const customer: Customer = {
  id: 'army-customer-actions-491',
  name: 'Customer 491',
  currency: 'USD',
  paymentTerms: 30,
  organizationId: 'org-491',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  displayName: null,
  email: null,
  phone: null,
  taxId: null,
  notes: null,
  priceListId: null,
  billingStreet: null,
  billingCity: null,
  billingState: null,
  billingPostalCode: null,
  billingCountry: null,
  shippingStreet: null,
  shippingCity: null,
  shippingState: null,
  shippingPostalCode: null,
  shippingCountry: null,
  deletedAt: null,
};

describe.each([
  {
    locale: 'en',
    messages: en,
    create: 'Create Customer',
    update: 'Update Customer',
    saving: 'Saving...',
  },
  {
    locale: 'ar',
    messages: ar,
    create: 'إنشاء عميل',
    update: 'تحديث العميل',
    saving: 'جارٍ الحفظ...',
  },
])('customer submit actions ($locale)', ({ messages, create, update, saving }) => {
  function form(props: Partial<React.ComponentProps<typeof CustomerForm>> = {}) {
    mockFormMessages = messages.customers.form;
    return <CustomerForm onSubmit={jest.fn()} onCancel={jest.fn()} {...props} />;
  }

  it.each([
    { value: undefined, expected: create, absent: update },
    { value: customer, expected: update, absent: create },
  ])('AC1 AC2: exposes only the visible action $expected', ({ value, expected, absent }) => {
    render(form({ customer: value }));
    expect(screen.getByRole('button', { name: expected })).toHaveTextContent(expected);
    expect(screen.queryByRole('button', { name: absent })).not.toBeInTheDocument();
  });

  it.each([undefined, customer])('AC3: disables and localizes pending submission (%p)', (value) => {
    render(form({ customer: value, isSubmitting: true }));
    expect(screen.getByRole('button', { name: saving })).toBeDisabled();
    expect(screen.getByRole('button', { name: saving })).toHaveTextContent(saving);
  });

  it('AC3: rejects an empty name without submitting', async () => {
    const onSubmit = jest.fn();
    const { container } = render(form({ onSubmit }));
    const submit = container.querySelector('button[type="submit"]');
    if (!(submit instanceof HTMLButtonElement)) throw new Error('Missing submit button');
    fireEvent.click(submit);
    await waitFor(() => expect(screen.getByText('Customer name is required')).toBeVisible());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
