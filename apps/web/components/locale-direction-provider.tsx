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
    const prevDir = document.documentElement.dir;
    const prevLang = document.documentElement.lang;
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.dir = prevDir;
      document.documentElement.lang = prevLang;
    };
  }, [dir, lang]);

  return (
    <DirectionProvider dir={dir}>
      <span
        data-testid="direction-indicator"
        data-direction={dir}
        data-locale={lang}
        aria-hidden="true"
        className="sr-only"
      />
      {children}
    </DirectionProvider>
  );
}
