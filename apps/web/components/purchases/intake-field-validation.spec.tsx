import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntakeFieldValidation } from './intake-field-validation';
import {
  partitionBlocking,
  uncorrectedBlockingFields,
  warningFields,
} from '@/lib/intake-validation';
import type { ExtractionValidation } from '@/lib/hooks/use-ai-document-intake';
import en from '../../messages/en/ai.json';
import ar from '../../messages/ar/ai.json';

let messages: Record<string, unknown> = en.intake.validation;

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    const found = key
      .split('.')
      .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], messages);
    if (typeof found !== 'string') return `MISSING:${key}`;
    return found.replace(/\{(\w+)\}/g, (_, p: string) => params?.[p] ?? '');
  },
}));

const validation: ExtractionValidation = {
  blockingFields: ['total', 'vendorTaxId'],
  requiresReview: true,
  fields: {
    invoiceNumber: { value: 'INV-1', status: 'valid', reasons: [] },
    date: {
      value: '2026-03-04',
      status: 'warning',
      reasons: ['DATE_AMBIGUOUS'],
      evidence: { text: 'Date: 03/04/2026', lineIndex: 1 },
    },
    total: { value: '130.0000', status: 'invalid', reasons: ['TOTALS_MISMATCH'] },
    vendorTaxId: { value: '123', status: 'invalid', reasons: ['TAX_ID_FORMAT'] },
    currency: { value: null, status: 'missing', reasons: ['CURRENCY_MISSING'] },
  },
};

describe('IntakeFieldValidation', () => {
  afterEach(() => {
    messages = en.intake.validation;
  });

  it('renders status, localized reasons and highlights invalid fields (en)', () => {
    render(<IntakeFieldValidation validation={validation} />);
    expect(screen.getByTestId('field-check-total')).toHaveAttribute('data-status', 'invalid');
    expect(screen.getByTestId('field-check-total').className).toContain('border-destructive');
    expect(screen.getByText('Subtotal plus VAT does not equal the total.')).toBeInTheDocument();
    expect(
      screen.getByText('Day and month could be swapped. Confirm the date.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('field-check-currency')).toHaveAttribute('data-status', 'missing');
    expect(document.body.textContent).not.toContain('MISSING:');
  });

  it('renders Arabic reasons for every code with no missing keys', () => {
    messages = ar.intake.validation;
    render(<IntakeFieldValidation validation={validation} />);
    expect(screen.getByText('المجموع الفرعي مع الضريبة لا يساوي الإجمالي.')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('MISSING:');
  });

  it('has the same reason, field and status keys in en and ar', () => {
    for (const group of ['reasons', 'fields', 'status'] as const) {
      expect(Object.keys(ar.intake.validation[group]).sort()).toEqual(
        Object.keys(en.intake.validation[group]).sort(),
      );
    }
  });

  it('shows the source line in a popover', async () => {
    render(<IntakeFieldValidation validation={validation} />);
    const trigger = screen.getByRole('button', { name: 'Source line: Invoice date' });
    await act(async () => {
      await userEvent.click(trigger);
    });
    expect(await screen.findByText('Date: 03/04/2026')).toBeInTheDocument();
    await act(async () => undefined);
  });
});

describe('client-side confirm rules', () => {
  const extracted = { date: '2026-03-04', currency: 'EGP' };
  const form = { date: '2026-03-04', currencyCode: 'EGP', lines: [{ quantity: 1, rate: 100 }] };

  it('separates amount mismatches (acknowledge) from fields that must change', () => {
    expect(partitionBlocking(['currency', 'total', 'tax', 'date'])).toEqual({
      hard: ['currency', 'date'],
      amounts: ['total', 'tax'],
      missingDate: false,
    });
  });

  it('does not count a pre-filled today as a correction of a missing date', () => {
    const v: ExtractionValidation = {
      requiresReview: true,
      blockingFields: ['date'],
      fields: { date: { value: null, status: 'missing', reasons: ['DATE_MISSING'] } },
    };
    const none = { date: null, currency: 'EGP' };
    const prefilled = { ...form, date: '2026-10-03', prefilledDate: '2026-10-03' };
    const blocked = uncorrectedBlockingFields(v, none, prefilled);
    expect(blocked).toEqual(['date']);
    expect(partitionBlocking(blocked, v)).toEqual({ hard: [], amounts: [], missingDate: true });
    expect(uncorrectedBlockingFields(v, none, { ...prefilled, date: '2026-09-30' })).toEqual([]);
    // An extracted but invalid date must still be changed.
    const invalid: ExtractionValidation = {
      ...v,
      fields: { date: { value: '2031-01-01', status: 'invalid', reasons: ['DATE_IN_FUTURE'] } },
    };
    expect(partitionBlocking(['date'], invalid).hard).toEqual(['date']);
  });

  it('lists warning fields', () => {
    expect(warningFields(validation)).toEqual(['date']);
    expect(warningFields(undefined)).toEqual([]);
  });

  it('requires correction of invalid required fields, not of non-editable ones', () => {
    const v: ExtractionValidation = {
      requiresReview: true,
      blockingFields: ['currency', 'date', 'total', 'vendorTaxId'],
      fields: { subtotal: { value: '100.0000', status: 'invalid', reasons: [] } },
    };
    expect(uncorrectedBlockingFields(v, extracted, form)).toEqual(['currency', 'date', 'total']);
    expect(
      uncorrectedBlockingFields(v, extracted, {
        date: '2026-03-05',
        currencyCode: 'SAR',
        lines: [{ quantity: '2', rate: '60.5' }],
      }),
    ).toEqual([]);
  });
});
