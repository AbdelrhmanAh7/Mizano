/**
 * Validates whether an incoming HTTP request origin should be permitted by CORS.
 *
 * Rules:
 * - Empty / undefined origin (same-origin, curl, server-to-server) is allowed.
 * - Exact matches in allowedOrigins (or '*') are allowed.
 * - In non-production environments (dev, test, verify runner), any localhost or
 *   127.0.0.1 loopback origin on any port is allowed to accommodate dynamic port assignment.
 * - All other origins are rejected.
 */
export function isAllowedCorsOrigin(
  origin: string | undefined,
  allowedOrigins: string[],
  isProduction: boolean,
): boolean {
  if (!origin) {
    return true;
  }
  if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
    return true;
  }
  if (!isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }
  return false;
}
