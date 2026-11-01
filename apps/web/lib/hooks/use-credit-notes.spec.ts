/**
 * Regression test (#598 C05, Arabic first-client walk): credit-note lists and details showed
 * the type as hard-coded English ("Apply to Invoice"); the label now comes from the catalog.
 */

import arSales from '@/messages/ar/sales.json';
import enSales from '@/messages/en/sales.json';
import { creditNoteTypeKey } from './use-credit-notes';

// The hooks module pulls in toast/i18n helpers that this pure helper does not use.
jest.mock('./use-toast-mutation', () => ({}));

const lookup = (messages: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      messages,
    );

describe('creditNoteTypeKey', () => {
  it.each([
    ['APPLY_TO_INVOICE', 'تطبيق على فاتورة', 'Apply to Invoice'],
    ['REFUND', 'استرداد', 'Refund'],
  ] as const)('labels %s from the sales catalog in both languages', (type, ar, en) => {
    const key = creditNoteTypeKey(type);
    expect(lookup(arSales, key)).toBe(ar);
    expect(lookup(enSales, key)).toBe(en);
  });
});
