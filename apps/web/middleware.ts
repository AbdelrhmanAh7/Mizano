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

function withCors(response: NextResponse, origin: string | null): NextResponse {
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    response.headers.set(
      'Access-Control-Allow-Headers',
      'X-Requested-With, Content-Type, Authorization',
    );
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'X-Requested-With, Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
      },
    });
  }

  const { pathname } = request.nextUrl;

  // Skip middleware for API routes, static files, etc.
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next') || pathname.includes('.')) {
    return withCors(NextResponse.next(), origin);
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
      return withCors(intlMiddleware(request), origin);
    }
    // Has a cookie — verify token to redirect authenticated users to dashboard
    const token = await getToken({ req: request });
    if (token && !pathname.includes('/dashboard')) {
      return withCors(NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url)), origin);
    }
    return withCors(intlMiddleware(request), origin);
  }

  // Root path: redirect based on auth state
  if (pathWithoutLocale === '/') {
    const token = await getToken({ req: request });
    if (token) {
      return withCors(NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url)), origin);
    } else {
      return withCors(NextResponse.redirect(new URL(`/${locale}/onboarding`, request.url)), origin);
    }
  }

  // Protected routes: verify token
  const token = await getToken({ req: request });
  if (!token) {
    if (!pathname.includes('/login')) {
      const loginUrl = new URL(`/${locale}/login`, request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return withCors(NextResponse.redirect(loginUrl), origin);
    }
  }

  // Handle i18n routing
  return withCors(intlMiddleware(request), origin);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
