import React from 'react';
import { render, screen } from '@testing-library/react';
import { LegalLinks } from './legal-links';
import enLegal from '@/messages/en/legal.json';
import arLegal from '@/messages/ar/legal.json';

let mockLocale: 'en' | 'ar' = 'en';

jest.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const messages = { en: enLegal, ar: arLegal };
    return (key: string) => {
      if (namespace === 'legal.common') {
        return messages[mockLocale].common[key as keyof typeof enLegal.common] ?? key;
      }
      return key;
    };
  },
}));

jest.mock('@/i18n/routing', () => ({
  Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe('LegalLinks and legal messages', () => {
  it('renders terms and privacy links in English', () => {
    mockLocale = 'en';
    render(<LegalLinks />);
    const termsLink = screen.getByText('Terms of use').closest('a');
    const privacyLink = screen.getByText('Privacy policy').closest('a');
    expect(termsLink).toHaveAttribute('href', '/terms');
    expect(privacyLink).toHaveAttribute('href', '/privacy');
  });

  it('renders terms and privacy links in Arabic', () => {
    mockLocale = 'ar';
    render(<LegalLinks />);
    const termsLink = screen.getByText('شروط الاستخدام').closest('a');
    const privacyLink = screen.getByText('سياسة الخصوصية').closest('a');
    expect(termsLink).toHaveAttribute('href', '/terms');
    expect(privacyLink).toHaveAttribute('href', '/privacy');
  });

  it('contains required legal policy elements in both languages', () => {
    for (const lang of [enLegal, arLegal]) {
      // Draft badge
      expect(lang.common.draftBadge).toMatch(/Draft — pending legal review|مسودة — قيد المراجعة القانونية/);
      // Support email placeholder
      expect(lang.common.contactBody).toContain('support@<domain>');
      // Data stored in EU servers
      expect(lang.privacy.sections.where.p1).toMatch(/European Union|الاتحاد الأوروبي/);
      // Egypt governing law
      expect(lang.terms.sections.law.p1).toMatch(/Egypt|مصر/);
      // Backups
      expect(lang.terms.sections.liability.p1).toMatch(/backup|نسخة احتياطية/);
      expect(lang.privacy.sections.where.p1).toMatch(/backup|نسخة احتياطية/);
      // Deletion on request
      expect(lang.terms.sections.ending.p1).toMatch(/delete|حذف/);
      expect(lang.privacy.sections.keep.p1).toMatch(/delete|حذف/);
    }
  });
});
