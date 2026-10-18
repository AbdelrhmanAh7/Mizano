'use client';

import { DirectionProvider } from '@radix-ui/react-direction';
import type { ComponentProps } from 'react';

export function LocaleDirectionProvider({
  children,
  dir,
}: ComponentProps<typeof DirectionProvider>) {
  return <DirectionProvider dir={dir}>{children}</DirectionProvider>;
}
