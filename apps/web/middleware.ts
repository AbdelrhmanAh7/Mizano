import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

// Define public paths that don't require authentication
const publicPaths = ['/login', '/register'];

// Check if path is public (remove locale prefix for checking)
function isPublicPath(pathname: string): boolean {
  const pathWithoutLocale = pathname.replace(/^\/(en|ar)/, '') || '/';
  return publicPaths.some(path => pathWithoutLocale.startsWith(path));
}

// Extract locale from pathname
function getLocale(pathname: string): string {
  const match = pathname.match(/^\/(en|ar)/);
  return match ? match[1] : 'en';
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for API routes, static files, etc.
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const locale = getLocale(pathname);
  const pathWithoutLocale = pathname.replace(/^\/(en|ar)/, '') || '/';

  // For public paths: only check token if we need to redirect authenticated users away
  // This avoids expensive JWT verification for unauthenticated visitors on login/register
  if (isPublicPath(pathname)) {
    // Quick check: if no session cookie exists, skip token verification entirely
    const sessionCookie = request.cookies.get('next-auth.session-token') || request.cookies.get('__Secure-next-auth.session-token');
    if (!sessionCookie) {
      return intlMiddleware(request);
    }
    // Has a cookie — verify token to redirect authenticated users to dashboard
    const token = await getToken({ req: request });
    if (token && !pathname.includes('/dashboard')) {
      return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
    }
    return intlMiddleware(request);
  }

  // Root path: redirect based on auth state
  if (pathWithoutLocale === '/') {
    const token = await getToken({ req: request });
    if (token) {
      return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
    } else {
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
    }
  }

  // Protected routes: verify token
  const token = await getToken({ req: request });
  if (!token) {
    if (!pathname.includes('/login')) {
      const loginUrl = new URL(`/${locale}/login`, request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Handle i18n routing
  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
