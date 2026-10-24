/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from 'next/server';

jest.mock('next-intl/middleware', () => {
  return jest.fn(() => jest.fn(() => NextResponse.next()));
});

jest.mock('./i18n/routing', () => ({
  routing: {
    locales: ['en', 'ar'],
    defaultLocale: 'en',
  },
}));

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn().mockResolvedValue(null),
}));

describe('middleware', () => {
  it('rewrites /en/api/auth/session to /api/auth/session', async () => {
    const { middleware } = await import('./middleware');
    const req = new NextRequest('http://localhost:3000/en/api/auth/session');
    const res = await middleware(req);
    expect(res).toBeDefined();
    const rewriteHeader = res?.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBe('http://localhost:3000/api/auth/session');
  });

  it('rewrites /ar/api/auth/session to /api/auth/session', async () => {
    const { middleware } = await import('./middleware');
    const req = new NextRequest('http://localhost:3000/ar/api/auth/session');
    const res = await middleware(req);
    expect(res).toBeDefined();
    const rewriteHeader = res?.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBe('http://localhost:3000/api/auth/session');
  });

  it('passes through standard /api/auth/session unchanged', async () => {
    const { middleware } = await import('./middleware');
    const req = new NextRequest('http://localhost:3000/api/auth/session');
    const res = await middleware(req);
    expect(res).toBeDefined();
    expect(res?.headers.get('x-middleware-rewrite')).toBeNull();
  });
});
