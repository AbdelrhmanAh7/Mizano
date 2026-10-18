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
      <LocaleDirectionProvider dir={localeDirections[locale]}>
        <DirectionProbe />
      </LocaleDirectionProvider>,
    );
    expect(screen.getByTestId('direction')).toHaveTextContent(locale === 'ar' ? 'rtl' : 'ltr');
  });
});

it.each(['ar', 'en'] as const)('moves tabs in %s reading direction', async (locale) => {
  const user = userEvent.setup();
  render(
    <LocaleDirectionProvider dir={localeDirections[locale]}>
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
