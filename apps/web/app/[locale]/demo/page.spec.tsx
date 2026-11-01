import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('next-intl', () => ({
  useLocale: () => 'ar',
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

jest.mock('@/i18n/routing', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('@/components/layout/language-switcher', () => ({ LanguageSwitcher: () => null }));

const mockSubmit = jest.fn();
jest.mock('@/lib/api', () => ({
  demoApi: { submit: (...args: unknown[]) => mockSubmit(...args) },
}));

import DemoPage from './page';

describe('DemoPage', () => {
  beforeEach(() => {
    mockSubmit.mockReset();
  });

  it('renders the demo form and submits request', async () => {
    mockSubmit.mockResolvedValue({ data: { success: true } });
    render(<DemoPage />);

    expect(screen.getByText('احجز عرضًا مدته 15 دقيقة')).toBeInTheDocument();
    expect(screen.getByText(/مجاني خلال الفترة التجريبية/)).toBeInTheDocument();

    fireEvent.change(document.getElementById('demo-name')!, { target: { value: 'محمد علي' } });
    fireEvent.change(document.getElementById('demo-contact')!, {
      target: { value: '01001234567' },
    });
    fireEvent.change(document.getElementById('demo-business')!, {
      target: { value: 'عيادة أسنان' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'إرسال طلب العرض' }));

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'محمد علي',
          contact: '01001234567',
          businessType: 'عيادة أسنان',
          role: 'owner',
          locale: 'ar',
        }),
      ),
    );

    expect(await screen.findByText('تم استلام طلبك بنجاح')).toBeInTheDocument();
  });
});
