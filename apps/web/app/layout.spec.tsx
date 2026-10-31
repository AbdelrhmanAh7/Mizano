import { getLocale } from 'next-intl/server';
import RootLayout from './layout';

jest.mock('next-intl/server', () => ({ getLocale: jest.fn() }));
jest.mock('next/font/google', () => ({
  Inter: () => ({ variable: 'font-inter' }),
  Noto_Sans_Arabic: () => ({ variable: 'font-noto-arabic' }),
}));

describe('RootLayout (audit B10)', () => {
  it.each([
    ['ar', 'rtl'],
    ['en', 'ltr'],
    ['xx', 'ltr'],
  ])('server-renders <html lang dir> for locale %s', async (locale, dir) => {
    (getLocale as jest.Mock).mockResolvedValue(locale);
    const html = await RootLayout({ children: null });
    expect(html.type).toBe('html');
    expect(html.props).toMatchObject({ lang: locale === 'xx' ? 'en' : locale, dir });
  });
});
