import { createHmac, timingSafeEqual } from 'crypto';

/**
 * FlowLine's signed-webhook contract (src/routes/api/public/webhooks.$endpointId.ts in FlowLine):
 *
 *   x-flowline-event-id:  unique per event, identical on every retry (FlowLine dedupes on it)
 *   x-flowline-signature: t=<unix seconds>,v1=<hex HMAC-SHA256("<t>.<event id>.<body>", secret)>
 *
 * FlowLine rejects a timestamp more than 300 s from its clock, so every attempt is signed again
 * with a fresh `t`; the event id never changes.
 */
export const FLOWLINE_SIGNATURE_HEADER = 'x-flowline-signature';
export const FLOWLINE_EVENT_ID_HEADER = 'x-flowline-event-id';
export const FLOWLINE_TOLERANCE_SECONDS = 300;

export function flowlineSignature(
  secret: string,
  eventId: string,
  body: string,
  timestampSeconds: number,
): string {
  const v1 = createHmac('sha256', secret)
    .update(`${timestampSeconds}.${eventId}.${body}`, 'utf8')
    .digest('hex');
  return `t=${timestampSeconds},v1=${v1}`;
}

export function signedFlowlineHeaders(
  secret: string,
  eventId: string,
  body: string,
  now: Date = new Date(),
): Record<string, string> {
  const t = Math.floor(now.getTime() / 1000);
  return {
    'content-type': 'application/json',
    [FLOWLINE_EVENT_ID_HEADER]: eventId,
    [FLOWLINE_SIGNATURE_HEADER]: flowlineSignature(secret, eventId, body, t),
  };
}

/**
 * Receiver-side check, byte-for-byte the algorithm FlowLine runs. Used by tests and available to
 * any Mizano-side receiver that wants to accept FlowLine's own `webhook.send` steps.
 */
export function verifyFlowlineSignature(
  secret: string,
  eventId: string,
  body: string,
  header: string,
  now: Date = new Date(),
): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.trim().split('=') as [string, string]),
  ) as { t?: string; v1?: string };
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t) || !eventId || eventId.length > 200) return false;
  if (Math.abs(now.getTime() / 1000 - t) > FLOWLINE_TOLERANCE_SECONDS) return false;
  const expected = flowlineSignature(secret, eventId, body, t).split('v1=')[1];
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(parts.v1, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
