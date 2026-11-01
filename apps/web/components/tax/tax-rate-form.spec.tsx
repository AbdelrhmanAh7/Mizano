/**
 * Regression tests (#598 C02, Arabic first-client walk): no tax rate could be created.
 * - The linked-account picker asked the accounts list for its default page of 20 rows, so a new
 *   organization's starter chart (35 accounts, sorted by code) never showed the VAT accounts.
 * - The form posted `accountId` and a number `rate`; the API takes `linkedAccountId` and a
 *   decimal string, so every save was refused as invalid.
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { TaxRateForm } from './tax-rate-form';

const mockUseAccounts = jest.fn();
const mockUpdate = jest.fn();

jest.mock('next-intl', () => ({
  useLocale: () => 'ar',
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
}));
jest.mock('@/lib/hooks/use-accounts', () => ({
  ...jest.requireActual('@/lib/hooks/use-accounts'),
  useAccounts: (params: unknown) => mockUseAccounts(params),
}));
jest.mock('@/lib/hooks/use-tax', () => ({
  useCreateTaxRate: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateTaxRate: () => ({ mutateAsync: mockUpdate, isPending: false }),
}));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

const vatAccount = { id: 'acc-2200', code: '2200', name: 'ضريبة القيمة المضافة المستحقة' };

describe('TaxRateForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAccounts.mockReturnValue({ data: { data: [vatAccount] }, isLoading: false });
  });

  it('loads the whole chart of accounts for the linked-account picker', () => {
    render(<TaxRateForm />);

    expect(mockUseAccounts).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 500, sortBy: 'code', sortOrder: 'asc' }),
    );
  });

  it('sends linkedAccountId and the rate as a decimal string', async () => {
    mockUpdate.mockResolvedValue({});
    render(
      <TaxRateForm
        taxRate={{
          id: 'rate-1',
          name: '',
          rate: '0',
          type: 'SALES',
          linkedAccountId: vatAccount.id,
          isDefault: false,
          isActive: true,
          createdAt: '',
          updatedAt: '',
        }}
      />,
    );
    // Create and update send the same body; editing sets the picker without driving Radix.
    fireEvent.change(document.getElementById('name') as HTMLInputElement, {
      target: { value: 'ضريبة القيمة المضافة 14%' },
    });
    fireEvent.change(document.getElementById('rate') as HTMLInputElement, {
      target: { value: '14' },
    });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    const { id, data: body } = mockUpdate.mock.calls[0][0];
    expect(id).toBe('rate-1');
    expect(body).toMatchObject({ linkedAccountId: vatAccount.id, rate: '14', type: 'SALES' });
    expect(body).not.toHaveProperty('accountId');
  });
});
