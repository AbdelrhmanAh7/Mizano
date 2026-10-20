import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

// Define public paths that don't require authentication
const publicPaths = ['/login', '/register', '/onboarding'];

// Check if path is public (remove locale prefix for checking)
function isPublicPath(pathname: string): boolean {
  const pathWithoutLocale = pathname.replace(/^\/(en|ar)/, '') || '/';
  return publicPaths.some((path) => pathWithoutLocale.startsWith(path));
}

// Extract locale from pathname
function getLocale(pathname: string): string {
  const match = pathname.match(/^\/(en|ar)/);
  return match ? match[1] : 'en';
}

/**
 * Ensures redirect responses retain the incoming host (e.g. 127.0.0.1 vs localhost)
 * and attaches CORS headers when a local origin is present, preventing cross-origin
 * fetch errors in automated test runners or local development.
 */
export function applyCorsAndPreserveHost(
  response: NextResponse,
  request: NextRequest,
): NextResponse {
  // 1. Preserve incoming host on redirects (NextURL normalizes 127.0.0.1 to localhost)
  const location = response.headers.get('location');
  const incomingHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (location && incomingHost) {
    try {
      const parsed = new URL(location, request.url);
      if (
        parsed.host !== incomingHost &&
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
      ) {
        parsed.host = incomingHost;
        response.headers.set('location', parsed.toString());
      }
    } catch {
      // keep original location
    }
  }

  // 2. Set CORS headers when local Origin is present
  const origin = request.headers.get('origin');
  if (origin) {
    const isLocalOrigin =
      origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith('http://localhost:') ||
      origin === 'http://127.0.0.1' ||
      origin === 'http://localhost';
    if (isLocalOrigin) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Credentials', 'true');
      response.headers.set(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      );
      response.headers.set(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url',
      );
    }
  }

  return response;
}

export async function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  const isLocalOrigin =
    origin &&
    (origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith('http://localhost:') ||
      origin === 'http://127.0.0.1' ||
      origin === 'http://localhost');

  // Handle CORS preflight for local development / test runner
  if (request.method === 'OPTIONS' && isLocalOrigin) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers':
          'Content-Type, Authorization, X-Requested-With, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url',
      },
    });
  }

  const { pathname } = request.nextUrl;

  // Skip middleware for API routes, static files, etc.
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next') || pathname.includes('.')) {
    return applyCorsAndPreserveHost(NextResponse.next(), request);
  }

  const locale = getLocale(pathname);
  const pathWithoutLocale = pathname.replace(/^\/(en|ar)/, '') || '/';

  // For public paths: only check token if we need to redirect authenticated users away
  // This avoids expensive JWT verification for unauthenticated visitors on login/register
  if (isPublicPath(pathname)) {
    // Quick check: if no session cookie exists, skip token verification entirely
    const sessionCookie =
      request.cookies.get('next-auth.session-token') ||
      request.cookies.get('__Secure-next-auth.session-token');
    if (!sessionCookie) {
      return applyCorsAndPreserveHost(intlMiddleware(request), request);
    }
    // Has a cookie — verify token to redirect authenticated users to dashboard
    const token = await getToken({ req: request });
    if (token && !pathname.includes('/dashboard')) {
      const redirectUrl = new URL(`/${locale}/dashboard`, request.url);
      const incomingHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
      if (incomingHost) redirectUrl.host = incomingHost;
      return applyCorsAndPreserveHost(NextResponse.redirect(redirectUrl), request);
    }
    return applyCorsAndPreserveHost(intlMiddleware(request), request);
  }

  // Root path: redirect based on auth state
  if (pathWithoutLocale === '/') {
    const token = await getToken({ req: request });
    const target = token ? `/${locale}/dashboard` : `/${locale}/onboarding`;
    const redirectUrl = new URL(target, request.url);
    const incomingHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
    if (incomingHost) redirectUrl.host = incomingHost;
    return applyCorsAndPreserveHost(NextResponse.redirect(redirectUrl), request);
  }

  // Protected routes: verify token
  const token = await getToken({ req: request });
  if (!token) {
    if (!pathname.includes('/login')) {
      const loginUrl = new URL(`/${locale}/login`, request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      const incomingHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
      if (incomingHost) loginUrl.host = incomingHost;
      return applyCorsAndPreserveHost(NextResponse.redirect(loginUrl), request);
    }
  }

  // Handle i18n routing
  return applyCorsAndPreserveHost(intlMiddleware(request), request);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
