import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DeleteConfirmDialog } from './delete-confirm-dialog';

jest.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

describe('DeleteConfirmDialog', () => {
  it('shows the record copy with the common Cancel/Delete labels and confirms on Delete', () => {
    const onConfirm = jest.fn();
    render(
      <DeleteConfirmDialog
        open
        onOpenChange={jest.fn()}
        title="Delete bill"
        description="This cannot be undone."
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText('Delete bill')).toBeTruthy();
    expect(screen.getByText('This cannot be undone.')).toBeTruthy();
    expect(screen.getByText('common.buttons.cancel')).toBeTruthy();
    fireEvent.click(screen.getByText('common.buttons.delete'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('uses the labels a page passes', () => {
    render(
      <DeleteConfirmDialog
        open
        onOpenChange={jest.fn()}
        title="Delete"
        description="?"
        onConfirm={jest.fn()}
        cancelLabel="Keep"
        deleteLabel="Remove"
      />,
    );
    expect(screen.getByText('Keep')).toBeTruthy();
    expect(screen.getByText('Remove')).toBeTruthy();
  });
});
