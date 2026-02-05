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

  // Handle i18n routing first
  const response = intlMiddleware(request);

  // Check authentication for protected routes
  const token = await getToken({ req: request });
  const locale = getLocale(pathname);

  // Determine the target path after locale handling
  const targetPath = pathname;

  // If trying to access protected route without token, redirect to login
  if (!isPublicPath(targetPath) && !token) {
    const loginUrl = new URL(`/${locale}/login`, request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If authenticated user tries to access login/register, redirect to dashboard
  if (token && isPublicPath(targetPath)) {
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
