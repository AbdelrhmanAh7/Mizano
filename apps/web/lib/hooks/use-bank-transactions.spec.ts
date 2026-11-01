/**
 * Regression for #627: the reconcile page asked for /bank-transactions/{id}/suggested-matches,
 * which the API never had (404). It now reads /reconciliation/suggestions/{bankAccountId}.
 */
// The hook module pulls in the API client and translations; neither is needed to test the mapping.
jest.mock('@/lib/api', () => ({ bankTransactionsApi: {}, reconciliationApi: {} }));
jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { pickSuggestedMatches } from './use-bank-transactions';

const only = (match: typeof invoiceMatch | typeof billMatch) =>
  pickSuggestedMatches([{ transaction: { id: 't' }, matches: [match] }], 't')[0];

const invoiceMatch = {
  type: 'invoice' as const,
  confidence: 90,
  entity: {
    id: 'inv-1',
    invoiceNumber: 'INV-0001',
    date: '2026-11-01T00:00:00.000Z',
    total: '400.0000',
    balanceDue: '400.0000',
    customer: { id: 'c1', name: 'QA Customer' },
  },
};
const billMatch = {
  type: 'bill' as const,
  confidence: 100,
  entity: {
    id: 'bill-1',
    billNumber: 'BILL-0007',
    date: '2026-10-20T00:00:00.000Z',
    total: '228.0000',
    balanceDue: '228.0000',
    vendor: { id: 'v1', name: 'Paper Co' },
  },
};

describe('suggested matches from the reconciliation endpoint', () => {
  it('reads an invoice candidate', () => {
    expect(only(invoiceMatch)).toEqual({
      id: 'inv-1',
      type: 'INVOICE',
      number: 'INV-0001',
      date: '2026-11-01T00:00:00.000Z',
      amount: '400.0000',
      balanceDue: '400.0000',
      counterpartyName: 'QA Customer',
      confidence: 90,
    });
  });

  it('reads a bill candidate with its vendor', () => {
    expect(only(billMatch)).toMatchObject({
      id: 'bill-1',
      type: 'BILL',
      number: 'BILL-0007',
      counterpartyName: 'Paper Co',
    });
  });

  it('picks only the chosen bank line, and none for an unknown one', () => {
    const rows = [
      { transaction: { id: 't1' }, matches: [invoiceMatch] },
      { transaction: { id: 't2' }, matches: [billMatch] },
    ];
    expect(pickSuggestedMatches(rows, 't2').map((m) => m.number)).toEqual(['BILL-0007']);
    expect(pickSuggestedMatches(rows, 'nope')).toEqual([]);
  });
});
