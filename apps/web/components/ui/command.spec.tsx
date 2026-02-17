/**
 * Tests for CommandDialog component.
 * Verifies Radix UI Dialog accessibility attributes to prevent
 * "Missing Description" warnings.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

// Mock cmdk with sub-components
jest.mock('cmdk', () => {
  const forwardRefDiv = (name: string) => {
    const Comp = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
      (props, ref) => <div ref={ref} data-cmdk={name} {...props} />,
    );
    Comp.displayName = name;
    return Comp;
  };

  const CommandPrimitive = forwardRefDiv('Command') as any;
  CommandPrimitive.Input = forwardRefDiv('CommandInput');
  CommandPrimitive.List = forwardRefDiv('CommandList');
  CommandPrimitive.Empty = forwardRefDiv('CommandEmpty');
  CommandPrimitive.Group = forwardRefDiv('CommandGroup');
  CommandPrimitive.Item = forwardRefDiv('CommandItem');
  CommandPrimitive.Separator = forwardRefDiv('CommandSeparator');
  CommandPrimitive.displayName = 'Command';

  return { Command: CommandPrimitive };
});

// Mock lucide-react with a Proxy to handle any icon import
jest.mock(
  'lucide-react',
  () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (typeof prop !== 'string') return undefined;
          // Return a simple SVG component for any icon
          const IconComponent = (props: React.SVGAttributes<SVGElement>) => (
            <svg {...props} data-testid={`icon-${prop}`} />
          );
          IconComponent.displayName = prop as string;
          return IconComponent;
        },
      },
    ),
);

import { CommandDialog } from './command';

describe('CommandDialog', () => {
  it('renders with aria-describedby={undefined} to suppress Radix warning', () => {
    render(
      <CommandDialog open={true} onOpenChange={() => {}}>
        <div>Test content</div>
      </CommandDialog>,
    );

    // The DialogContent renders via a portal, so we need to look in the document body
    const dialogContent = document.querySelector('[role="dialog"]');
    expect(dialogContent).toBeTruthy();

    // aria-describedby should not be set (undefined suppresses the Radix UI warning)
    // When aria-describedby={undefined} is passed, the attribute is either absent or explicitly undefined
    const describedBy = dialogContent?.getAttribute('aria-describedby');
    expect(describedBy).toBeNull();
  });

  it('renders with a screen-reader-only title for accessibility', () => {
    render(
      <CommandDialog open={true} onOpenChange={() => {}}>
        <div>Test content</div>
      </CommandDialog>,
    );

    // The sr-only DialogTitle should be present in the document
    const title = screen.getByText('Command');
    expect(title).toBeInTheDocument();
    expect(title.className).toContain('sr-only');
  });

  it('does not render a DialogDescription element', () => {
    render(
      <CommandDialog open={true} onOpenChange={() => {}}>
        <div>Test content</div>
      </CommandDialog>,
    );

    // "Search commands" text should NOT be in the document (removed in favor of aria-describedby={undefined})
    expect(screen.queryByText('Search commands')).not.toBeInTheDocument();
  });

  it('renders children inside the dialog', () => {
    render(
      <CommandDialog open={true} onOpenChange={() => {}}>
        <div data-testid="child-content">Hello</div>
      </CommandDialog>,
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });
});
