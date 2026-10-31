import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useDirection } from '@radix-ui/react-direction';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LocaleDirectionProvider } from './locale-direction-provider';

function DirectionProbe() {
  return <span data-testid="direction">{useDirection()}</span>;
}

describe('LocaleDirectionProvider (audit B10, #543, #544)', () => {
  it.each([
    ['ar', 'rtl'],
    ['en', 'ltr'],
  ] as const)('gives Radix and <html> the %s direction', (lang, dir) => {
    render(
      <LocaleDirectionProvider dir={dir} lang={lang}>
        <DirectionProbe />
      </LocaleDirectionProvider>,
    );
    expect(screen.getByTestId('direction')).toHaveTextContent(dir);
    expect(document.documentElement.dir).toBe(dir);
    expect(document.documentElement.lang).toBe(lang);
  });

  it('moves Radix keyboard focus in the reading direction on /ar', async () => {
    const user = userEvent.setup();
    render(
      <LocaleDirectionProvider dir="rtl" lang="ar">
        <Tabs defaultValue="first">
          <TabsList>
            <TabsTrigger value="first">نظرة عامة</TabsTrigger>
            <TabsTrigger value="second">مالي</TabsTrigger>
          </TabsList>
        </Tabs>
      </LocaleDirectionProvider>,
    );
    await user.click(screen.getByRole('tab', { name: 'نظرة عامة' }));
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'مالي' })).toHaveFocus();
  });
});
