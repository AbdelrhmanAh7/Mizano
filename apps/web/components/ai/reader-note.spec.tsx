import React from 'react';
import { render, screen } from '@testing-library/react';
import enAi from '@/messages/en/ai.json';
import arAi from '@/messages/ar/ai.json';
import enSettings from '@/messages/en/settings.json';
import arSettings from '@/messages/ar/settings.json';
import { ReaderNote } from './reader-note';

type Messages = Record<string, unknown>;
let messages: Messages = {};

function lookup(namespace: string, key: string): string | undefined {
  const parts = [...namespace.split('.'), ...key.split('.')];
  let node: unknown = messages;
  for (const part of parts) node = (node as Messages | undefined)?.[part];
  return typeof node === 'string' ? node : undefined;
}

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
jest.mock('next-intl', () => ({
  useTranslations: (namespace: string) =>
    Object.assign(
      (key: string, values?: Record<string, string>) =>
        (lookup(namespace, key) ?? key).replace(/\{(\w+)\}/g, (_, k: string) => values?.[k] ?? ''),
      { has: (key: string) => lookup(namespace, key) !== undefined },
    ),
}));

function use(locale: 'en' | 'ar') {
  messages =
    locale === 'en' ? { ai: enAi, settings: enSettings } : { ai: arAi, settings: arSettings };
}

describe('ReaderNote (issue #658)', () => {
  it.each(['en', 'ar'] as const)('names the provider and model of an AI reading (%s)', (locale) => {
    use(locale);
    render(
      <ReaderNote
        result={{
          extractionMethod: 'ai',
          extractionProvider: 'openrouter',
          extractionModel: 'google/gemini-3.8-flash',
          aiFallbackReason: null,
        }}
      />,
    );
    const text = screen.getByTestId('intake-reader').textContent ?? '';
    expect(text).toContain('OpenRouter');
    expect(text).toContain('google/gemini-3.8-flash');
  });

  it.each(['en', 'ar'] as const)(
    'says the basic reader ran, why, and links to AI settings (%s)',
    (locale) => {
      use(locale);
      render(
        <ReaderNote
          result={{
            extractionMethod: 'rules',
            extractionProvider: null,
            extractionModel: null,
            aiFallbackReason: 'AI_FORBIDDEN',
          }}
        />,
      );
      const text = screen.getByTestId('intake-reader').textContent ?? '';
      expect(text).toContain(
        (messages.ai as Messages & { intake: { scan: { reader: { rules: string } } } }).intake.scan
          .reader.rules,
      );
      expect(text).toContain(
        (messages.settings as { aiErrors: { AI_FORBIDDEN: string } }).aiErrors.AI_FORBIDDEN,
      );
      expect(screen.getByRole('link').getAttribute('href')).toBe('/settings/ai');
    },
  );

  it('explains AI being off and shows nothing for results from before this field', () => {
    use('en');
    const { rerender } = render(
      <ReaderNote result={{ extractionMethod: 'rules', aiFallbackReason: 'AI_OFF' }} />,
    );
    expect(screen.getByTestId('intake-reader').textContent).toContain('turned off');
    rerender(<ReaderNote result={{}} />);
    expect(screen.queryByTestId('intake-reader')).toBeNull();
  });
});
