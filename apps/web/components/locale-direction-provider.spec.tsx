import userEvent from '@testing-library/user-event';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { render, screen } from '@testing-library/react';
import { useDirection } from '@radix-ui/react-direction';
import { localeDirections } from '@/i18n/config';
import { LocaleDirectionProvider } from './locale-direction-provider';

function DirectionProbe() {
  return <span data-testid="direction">{useDirection()}</span>;
}

describe('locale Radix direction', () => {
  it.each(['ar', 'en'] as const)('passes %s direction to Radix descendants', (locale) => {
    render(
      <LocaleDirectionProvider dir={localeDirections[locale]} lang={locale}>
        <DirectionProbe />
      </LocaleDirectionProvider>,
    );
    expect(screen.getByTestId('direction')).toHaveTextContent(locale === 'ar' ? 'rtl' : 'ltr');
  });

  it.each(['ar', 'en'] as const)(
    'renders %s direction indicator with machine-readable attributes and aria-hidden',
    (locale) => {
      render(
        <LocaleDirectionProvider dir={localeDirections[locale]} lang={locale}>
          <DirectionProbe />
        </LocaleDirectionProvider>,
      );
      const indicator = screen.getByTestId('direction-indicator');
      expect(indicator).toHaveAttribute('data-direction', localeDirections[locale]);
      expect(indicator).toHaveAttribute('data-locale', locale);
      expect(indicator).toHaveAttribute('aria-hidden', 'true');
      expect(indicator).toBeEmptyDOMElement();
    },
  );
});

it.each(['ar', 'en'] as const)('moves tabs in %s reading direction', async (locale) => {
  const user = userEvent.setup();
  const firstLabel = locale === 'ar' ? 'نظرة عامة' : 'Overview';
  const secondLabel = locale === 'ar' ? 'مالي' : 'Financial';
  render(
    <LocaleDirectionProvider dir={localeDirections[locale]} lang={locale}>
      <Tabs defaultValue="first">
        <TabsList>
          <TabsTrigger value="first">{firstLabel}</TabsTrigger>
          <TabsTrigger value="second">{secondLabel}</TabsTrigger>
        </TabsList>
      </Tabs>
    </LocaleDirectionProvider>,
  );
  await user.click(screen.getByRole('tab', { name: firstLabel }));
  await user.keyboard(locale === 'ar' ? '{ArrowLeft}' : '{ArrowRight}');
  expect(screen.getByRole('tab', { name: secondLabel })).toHaveFocus();
});

it('keeps <html> dir, lang and direction indicator in sync when the locale changes without a full page load', () => {
  // The layout's inline script only runs on a full load; a client-side switch (router.push from
  // /ar to /en in the language switcher) re-renders the layout but React never runs that script.
  const { rerender } = render(
    <LocaleDirectionProvider dir={localeDirections.ar} lang="ar">
      <DirectionProbe />
    </LocaleDirectionProvider>,
  );
  expect(document.documentElement).toHaveAttribute('dir', 'rtl');
  expect(document.documentElement).toHaveAttribute('lang', 'ar');
  expect(screen.getByTestId('direction-indicator')).toHaveAttribute('data-direction', 'rtl');
  expect(screen.getByTestId('direction-indicator')).toHaveAttribute('aria-hidden', 'true');
  expect(screen.getByTestId('direction-indicator')).toBeEmptyDOMElement();

  rerender(
    <LocaleDirectionProvider dir={localeDirections.en} lang="en">
      <DirectionProbe />
    </LocaleDirectionProvider>,
  );
  expect(document.documentElement).toHaveAttribute('dir', 'ltr');
  expect(document.documentElement).toHaveAttribute('lang', 'en');
  expect(screen.getByTestId('direction-indicator')).toHaveAttribute('data-direction', 'ltr');
  expect(screen.getByTestId('direction-indicator')).toHaveAttribute('aria-hidden', 'true');
  expect(screen.getByTestId('direction-indicator')).toBeEmptyDOMElement();
});

it('restores previous <html> dir and lang on unmount', () => {
  document.documentElement.dir = 'ltr';
  document.documentElement.lang = 'en';
  const { unmount } = render(
    <LocaleDirectionProvider dir="rtl" lang="ar">
      <DirectionProbe />
    </LocaleDirectionProvider>,
  );
  expect(document.documentElement).toHaveAttribute('dir', 'rtl');
  expect(document.documentElement).toHaveAttribute('lang', 'ar');
  unmount();
  expect(document.documentElement).toHaveAttribute('dir', 'ltr');
  expect(document.documentElement).toHaveAttribute('lang', 'en');
});
