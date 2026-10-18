'use client';

import { DirectionProvider } from '@radix-ui/react-direction';
import { useEffect, type ReactNode } from 'react';

interface LocaleDirectionProviderProps {
  children: ReactNode;
  dir: 'ltr' | 'rtl';
  lang: string;
}

export function LocaleDirectionProvider({
  children,
  dir,
  lang,
}: LocaleDirectionProviderProps): JSX.Element {
  // The layout's inline script sets <html dir/lang> on a full load only; React does not run it
  // again after a client-side locale switch, so keep the document in sync here.
  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  }, [dir, lang]);

  return <DirectionProvider dir={dir}>{children}</DirectionProvider>;
}
