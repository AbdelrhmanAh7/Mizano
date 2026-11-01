/**
 * TestSprite (ONB-002, SEC-002, AIO-003): the language selector did not open. Radix opens a menu
 * on pointer down or Enter/Space only; a plain click (screen readers, automation) did nothing.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';

function Menu({ onOpenChange }: { onOpenChange?: (open: boolean) => void }): React.JSX.Element {
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger>Language</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>English</DropdownMenuItem>
        <DropdownMenuItem>العربية</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe('DropdownMenu opened by a plain click', () => {
  it('opens on a click with no pointer or key (assistive technology), and closes on the next', () => {
    const onOpenChange = jest.fn();
    render(<Menu onOpenChange={onOpenChange} />);
    const trigger = screen.getByRole('button', { name: 'Language' });
    fireEvent.click(trigger, { detail: 0 });
    expect(screen.getByRole('menuitem', { name: 'English' })).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(trigger, { detail: 0 });
    expect(screen.queryByRole('menuitem', { name: 'English' })).not.toBeInTheDocument();
  });

  it('a mouse click (detail 1, after pointer down) is left to Radix and does not toggle twice', () => {
    render(<Menu />);
    const trigger = screen.getByRole('button', { name: 'Language' });
    fireEvent.click(trigger, { detail: 1 });
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('Enter still opens it once', () => {
    render(<Menu />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Language' }), { key: 'Enter' });
    expect(screen.getByRole('menuitem', { name: 'العربية' })).toBeInTheDocument();
  });
});
