import { NextResponse } from 'next/server';
import { serverApiBaseUrl } from '@/lib/server-api-url';

export const dynamic = 'force-dynamic';

const API_TIMEOUT_MS = 5000;

interface WebHealth {
  status: 'ok' | 'degraded';
  api: 'ready' | 'not_ready' | 'unreachable';
}

/**
 * Readiness probe for the web container (compose health check, healthcheck.sh).
 * 200 only when the API this server logs in against answers its readiness route,
 * 503 otherwise, so a probe that only looks at the HTTP status still sees a dead API.
 */
export async function GET(): Promise<NextResponse<WebHealth>> {
  let api: WebHealth['api'];
  try {
    const res = await fetch(`${serverApiBaseUrl()}/health/ready`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    api = res.ok ? 'ready' : 'not_ready';
  } catch {
    api = 'unreachable';
  }
  const ready = api === 'ready';
  return NextResponse.json<WebHealth>(
    { status: ready ? 'ok' : 'degraded', api },
    { status: ready ? 200 : 503 },
  );
}
