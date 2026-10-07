/**
 * API base URL for server-side calls (NextAuth, the web readiness route).
 * API_INTERNAL_URL (the compose network address) is not a NEXT_PUBLIC_ variable, so it
 * is read at runtime instead of being inlined into the build.
 */
export function serverApiBaseUrl(): string {
  return (
    process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6001/api'
  );
}
