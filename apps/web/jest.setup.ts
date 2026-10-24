import '@testing-library/jest-dom';
import React from 'react';

// Polyfill ResizeObserver for jsdom (used by Radix UI components)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock i18n routing globally to avoid next-intl ESM transform issues in Jest
jest.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...props }, children),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => '/',
  redirect: jest.fn(),
  getPathname: jest.fn(({ href }: { href: string }) => href),
  routing: {
    locales: ['en', 'ar'],
    defaultLocale: 'en',
    localePrefix: 'always',
  },
}));
