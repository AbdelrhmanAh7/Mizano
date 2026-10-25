import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useLocale } from 'next-intl';
import { BillForm } from './bill-form';

jest.mock('next-intl', () => ({
  useLocale: jest.fn(),
  useTranslations: () => (key: string) => key,
}));
jest.mock('@/lib/hooks/use-vendors', () => ({
  useVendors: () => ({ data: { data: [] } }),
}));

// Radix scrolls the active option into view; jsdom has no layout engine.
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

it.each([
  ['ar', 'rtl'],
  ['en', 'ltr'],
])('uses %s direction on every bill dropdown and its portal', async (locale, direction) => {
  jest.mocked(useLocale).mockReturnValue(locale);
  render(
    <BillForm
      projects={[{ id: 'project-484', name: 'Project 484' }]}
      onSubmit={jest.fn()}
      onCancel={jest.fn()}
    />,
  );
  const triggers = screen.getAllByRole('combobox');
  expect(triggers).toHaveLength(4);
  for (const trigger of triggers) {
    expect(trigger).toHaveAttribute('dir', direction);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(await screen.findByRole('listbox')).toHaveAttribute('dir', direction);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  }
  // An empty vendor list must still open; manual entry must stay selectable without items.
  const itemTrigger = triggers[3];
  fireEvent.keyDown(itemTrigger, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: 'Manual Entry' }));
  expect(itemTrigger).toHaveTextContent('Manual Entry');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});
