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
});

it.each(['ar', 'en'] as const)('moves tabs in %s reading direction', async (locale) => {
  const user = userEvent.setup();
  render(
    <LocaleDirectionProvider dir={localeDirections[locale]} lang={locale}>
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
          <TabsTrigger value="three">Three</TabsTrigger>
        </TabsList>
      </Tabs>
    </LocaleDirectionProvider>,
  );
  screen.getByRole('tab', { name: 'One' }).focus();
  await user.keyboard(locale === 'ar' ? '{ArrowLeft}' : '{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'Two' })).toHaveFocus();
});

it('keeps <html> dir and lang in sync when the locale changes without a full page load', () => {
  // The layout's inline script only runs on a full load; a client-side switch (router.push from
  // /ar to /en in the language switcher) re-renders the layout but React never runs that script.
  const { rerender } = render(
    <LocaleDirectionProvider dir={localeDirections.ar} lang="ar">
      <DirectionProbe />
    </LocaleDirectionProvider>,
  );
  expect(document.documentElement).toHaveAttribute('dir', 'rtl');
  expect(document.documentElement).toHaveAttribute('lang', 'ar');

  rerender(
    <LocaleDirectionProvider dir={localeDirections.en} lang="en">
      <DirectionProbe />
    </LocaleDirectionProvider>,
  );
  expect(document.documentElement).toHaveAttribute('dir', 'ltr');
  expect(document.documentElement).toHaveAttribute('lang', 'en');
});
