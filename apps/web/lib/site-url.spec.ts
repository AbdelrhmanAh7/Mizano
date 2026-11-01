import { siteUrl } from './site-url';

describe('siteUrl', () => {
  const saved = { app: process.env.NEXT_PUBLIC_APP_URL, auth: process.env.NEXTAUTH_URL };
  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = saved.app;
    process.env.NEXTAUTH_URL = saved.auth;
  });

  it('uses the deployment web address when no public origin was built in', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXTAUTH_URL = 'https://web.example.test/';
    expect(siteUrl()).toBe('https://web.example.test');
  });

  it('prefers the origin built into the image', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.test';
    process.env.NEXTAUTH_URL = 'https://other.example.test';
    expect(siteUrl()).toBe('https://app.example.test');
  });
});
