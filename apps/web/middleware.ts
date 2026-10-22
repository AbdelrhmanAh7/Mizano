import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

function applyCorsAndNormalizeRedirect(request: NextRequest, response: NextResponse): NextResponse {
  // If redirect location host differs from request host, preserve incoming host
  const location = response.headers.get('location');
  const reqHost = request.headers.get('host');
  if (location && reqHost) {
    try {
      const locUrl = new URL(location, request.url);
      if (locUrl.host !== reqHost) {
        locUrl.host = reqHost;
        locUrl.protocol = request.nextUrl.protocol;
        response.headers.set('location', locUrl.toString());
      }
    } catch {
      // ignore invalid URL
    }
  }

  // Add CORS headers for RSC fetches and cross-origin requests (e.g. 127.0.0.1 <-> localhost)
  const origin = request.headers.get('origin');
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url',
    );
  }

  return response;
}

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

export async function middleware(request: NextRequest) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    const origin = request.headers.get('origin') || '*';
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers':
          'Content-Type, Authorization, X-Requested-With, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url',
      },
    });
  }

  const { pathname } = request.nextUrl;

  // Skip middleware for API routes, static files, etc.
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next') || pathname.includes('.')) {
    return NextResponse.next();
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
      return applyCorsAndNormalizeRedirect(request, intlMiddleware(request));
    }
    // Has a cookie — verify token to redirect authenticated users to dashboard
    const token = await getToken({ req: request });
    if (token && !pathname.includes('/dashboard')) {
      return applyCorsAndNormalizeRedirect(
        request,
        NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url)),
      );
    }
    return applyCorsAndNormalizeRedirect(request, intlMiddleware(request));
  }

  // Root path: redirect based on auth state
  if (pathWithoutLocale === '/') {
    const token = await getToken({ req: request });
    if (token) {
      return applyCorsAndNormalizeRedirect(
        request,
        NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url)),
      );
    } else {
      return applyCorsAndNormalizeRedirect(
        request,
        NextResponse.redirect(new URL(`/${locale}/onboarding`, request.url)),
      );
    }
  }

  // Protected routes: verify token
  const token = await getToken({ req: request });
  if (!token) {
    if (!pathname.includes('/login')) {
      const loginUrl = new URL(`/${locale}/login`, request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return applyCorsAndNormalizeRedirect(request, NextResponse.redirect(loginUrl));
    }
  }

  // Handle i18n routing
  return applyCorsAndNormalizeRedirect(request, intlMiddleware(request));
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
