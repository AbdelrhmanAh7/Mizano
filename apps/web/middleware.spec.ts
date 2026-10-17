/**
 * @jest-environment node
 */
jest.mock('next-intl/middleware', () => {
  return jest.fn(() => jest.fn(() => new (require('next/server').NextResponse)()));
});
jest.mock('./i18n/routing', () => ({
  routing: {},
}));
jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn().mockResolvedValue(null),
}));

import { NextRequest, NextResponse } from 'next/server';
import { applyCorsAndPreserveHost, middleware } from './middleware';

describe('middleware CORS and host preservation', () => {
  it('rewrites localhost redirect URL to match incoming 127.0.0.1 host', () => {
    const req = new NextRequest('http://127.0.0.1:4312/hr/payroll', {
      headers: { host: '127.0.0.1:4312' },
    });
    const res = NextResponse.redirect('http://localhost:4312/en/hr/payroll');
    const processed = applyCorsAndPreserveHost(res, req);

    expect(processed.headers.get('location')).toBe('http://127.0.0.1:4312/en/hr/payroll');
  });

  it('sets Access-Control-Allow-Origin and credentials for local 127.0.0.1 origin', () => {
    const req = new NextRequest('http://127.0.0.1:4312/en/hr/payroll', {
      headers: {
        host: '127.0.0.1:4312',
        origin: 'http://127.0.0.1:4312',
      },
    });
    const res = NextResponse.next();
    const processed = applyCorsAndPreserveHost(res, req);

    expect(processed.headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:4312');
    expect(processed.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('sets Access-Control-Allow-Origin and credentials for localhost origin', () => {
    const req = new NextRequest('http://localhost:4312/en/hr/payroll', {
      headers: {
        host: 'localhost:4312',
        origin: 'http://localhost:4312',
      },
    });
    const res = NextResponse.next();
    const processed = applyCorsAndPreserveHost(res, req);

    expect(processed.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4312');
    expect(processed.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('handles OPTIONS preflight for local origins with status 204 and CORS headers', async () => {
    const req = new NextRequest('http://127.0.0.1:4312/en/hr/payroll', {
      method: 'OPTIONS',
      headers: {
        host: '127.0.0.1:4312',
        origin: 'http://127.0.0.1:4312',
      },
    });
    const res = await middleware(req);

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:4312');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });
});
