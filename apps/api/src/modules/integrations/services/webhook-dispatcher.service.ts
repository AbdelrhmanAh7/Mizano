import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { WebhookDeliveryStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { describeError } from '../../../common/utils/redact';
import { signedFlowlineHeaders } from '../utils/flowline-signature';
import { openSecret } from '../utils/secret-box';
import { assertPublicWebhookUrl } from '../utils/url-safety';

/** Delay before attempt n+1 after attempt n failed (seconds); the last value repeats. */
export const RETRY_SCHEDULE_SECONDS = [30, 120, 600, 1800, 3600, 10800, 21600];
export const DELIVERY_TIMEOUT_MS = 15_000;
const CLAIM_BATCH = 10;
const CLAIM_LEASE_SECONDS = 120;
const MAX_ERROR_LENGTH = 300;

export interface TransportResult {
  status: number;
}
export type WebhookTransport = (
  url: string,
  init: { headers: Record<string, string>; body: string; timeoutMs: number },
) => Promise<TransportResult>;

/** Plain POST; redirects are not followed (a 3xx is a failed attempt). */
export const fetchTransport: WebhookTransport = async (url, { headers, body, timeoutMs }) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'user-agent': 'Mizano-Webhooks/1.0' },
      body,
      redirect: 'manual',
      signal: ctrl.signal,
    });
    await res.body?.cancel().catch(() => undefined);
    return { status: res.status };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Retry 5xx, timeouts/network errors, 408, 425, 429 and 409 (FlowLine answers 409 while the
 * flow has no published version, which the customer can fix). Any other 4xx means the request
 * itself is wrong (bad signature, unknown endpoint, too large) and repeating it cannot help.
 */
export function isRetryableStatus(status: number): boolean {
  return status >= 500 || [408, 409, 425, 429].includes(status);
}

/** "TypeError: fetch failed (ECONNREFUSED)": the class of failure, never payload or headers. */
export function networkErrorSummary(e: unknown): string {
  const cause = (e as { cause?: { code?: unknown } } | null)?.cause;
  const code = typeof cause?.code === 'string' ? ` (${cause.code})` : '';
  return `${describeError(e, { includeMessage: true })}${code}`.slice(0, MAX_ERROR_LENGTH);
}

export function nextDelaySeconds(attempt: number, random: () => number = Math.random): number {
  const base = RETRY_SCHEDULE_SECONDS[Math.min(attempt, RETRY_SCHEDULE_SECONDS.length) - 1];
  // ±10% jitter so a receiver outage does not end in a synchronized burst.
  return Math.round(base * (0.9 + random() * 0.2));
}

@Injectable()
export class WebhookDispatcherService implements OnModuleDestroy {
  private readonly logger = new Logger(WebhookDispatcherService.name);
  private current: Promise<number> | null = null;
  private again = false;
  private stopped = false;
  transport: WebhookTransport = fetchTransport;

  constructor(private readonly prisma: PrismaService) {}

  onModuleDestroy(): void {
    this.stopped = true;
  }

  @Interval('integration-webhook-dispatch', 5000)
  async tick(): Promise<void> {
    if (this.stopped || process.env.INTEGRATIONS_DISPATCH_ENABLED === 'false') return;
    await this.processDue();
  }

  /**
   * Claims and sends every due delivery. A call made while a pass is running waits for it and
   * triggers one more pass, so work queued meanwhile (a redelivery, a test event) is never
   * skipped. Several processes may run this too: claiming uses FOR UPDATE SKIP LOCKED.
   */
  processDue(): Promise<number> {
    if (this.current) {
      this.again = true;
      return this.current;
    }
    this.current = (async () => {
      let total = 0;
      do {
        this.again = false;
        total += await this.drain();
      } while (this.again && !this.stopped);
      return total;
    })().finally(() => {
      this.current = null;
    });
    return this.current;
  }

  private async drain(): Promise<number> {
    let processed = 0;
    try {
      for (;;) {
        const claimed = await this.claim();
        if (claimed.length === 0) break;
        for (const row of claimed) {
          await this.deliver(row.id, row.attempts);
          processed += 1;
        }
        if (claimed.length < CLAIM_BATCH || this.stopped) break;
      }
    } catch (error) {
      this.logger.error(
        `Webhook dispatch failed: ${describeError(error, { includeMessage: false })}`,
      );
    }
    return processed;
  }

  /**
   * Atomically moves due rows to DELIVERING with a lease and counts the attempt. A row whose
   * lease expired (process died mid-send) is claimed again; the receiver dedupes on event id.
   */
  private claim(): Promise<{ id: string; attempts: number }[]> {
    return this.prisma.$queryRaw<{ id: string; attempts: number }[]>`
      UPDATE "webhook_deliveries" AS d
         SET "status" = 'DELIVERING'::"WebhookDeliveryStatus",
             "lockedUntil" = now() + make_interval(secs => ${CLAIM_LEASE_SECONDS}),
             "attempts" = d."attempts" + 1,
             "updatedAt" = now()
       WHERE d."id" IN (
         SELECT "id" FROM "webhook_deliveries"
          WHERE ("status" = 'PENDING' AND "nextAttemptAt" <= now())
             OR ("status" = 'DELIVERING' AND "lockedUntil" < now())
          ORDER BY "nextAttemptAt"
          LIMIT ${CLAIM_BATCH}
          FOR UPDATE SKIP LOCKED)
      RETURNING d."id", d."attempts"`;
  }

  private async deliver(deliveryId: string, attempt: number): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { event: true, endpoint: true },
    });
    if (!delivery) return;
    const { endpoint, event } = delivery;
    const started = Date.now();

    if (
      endpoint.deletedAt ||
      !endpoint.isActive ||
      endpoint.organizationId !== delivery.organizationId
    ) {
      await this.finish(delivery.id, attempt, delivery.maxAttempts, started, {
        statusCode: null,
        error: 'Endpoint is disabled or deleted',
        permanent: true,
      });
      return;
    }

    let statusCode: number | null = null;
    let error: string | null = null;
    try {
      await assertPublicWebhookUrl(endpoint.url);
      const secret = openSecret(
        endpoint.secretCiphertext,
        `${endpoint.organizationId}:${endpoint.id}`,
      );
      const headers = signedFlowlineHeaders(secret, event.id, event.payload);
      const res = await this.transport(endpoint.url, {
        headers,
        body: event.payload,
        timeoutMs: DELIVERY_TIMEOUT_MS,
      });
      statusCode = res.status;
      if (res.status >= 200 && res.status < 300) {
        await this.finish(delivery.id, attempt, delivery.maxAttempts, started, {
          statusCode,
          error: null,
          succeeded: true,
        });
        return;
      }
      error = `HTTP ${res.status}`;
    } catch (e) {
      error =
        e instanceof Error && e.name === 'AbortError'
          ? `Timed out after ${DELIVERY_TIMEOUT_MS / 1000}s`
          : networkErrorSummary(e);
    }

    await this.finish(delivery.id, attempt, delivery.maxAttempts, started, {
      statusCode,
      error,
      permanent: statusCode !== null && !isRetryableStatus(statusCode),
    });
  }

  private async finish(
    deliveryId: string,
    attempt: number,
    maxAttempts: number,
    started: number,
    outcome: {
      statusCode: number | null;
      error: string | null;
      succeeded?: boolean;
      permanent?: boolean;
    },
  ): Promise<void> {
    const now = new Date();
    let status: WebhookDeliveryStatus;
    let nextAttemptAt: Date | undefined;
    if (outcome.succeeded) status = WebhookDeliveryStatus.SUCCEEDED;
    else if (outcome.permanent || attempt >= maxAttempts) status = WebhookDeliveryStatus.FAILED;
    else {
      status = WebhookDeliveryStatus.PENDING;
      nextAttemptAt = new Date(now.getTime() + nextDelaySeconds(attempt) * 1000);
    }

    await this.prisma.$transaction([
      this.prisma.webhookDeliveryAttempt.create({
        data: {
          deliveryId,
          attempt,
          statusCode: outcome.statusCode,
          error: outcome.error,
          durationMs: Math.max(0, Date.now() - started),
        },
      }),
      this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status,
          lockedUntil: null,
          lastStatusCode: outcome.statusCode,
          lastError: outcome.error,
          ...(nextAttemptAt ? { nextAttemptAt } : {}),
          ...(outcome.succeeded ? { deliveredAt: now } : {}),
        },
      }),
    ]);
    this.logger.log(
      `Webhook delivery ${deliveryId} attempt ${attempt}: ${status}${outcome.statusCode ? ` (${outcome.statusCode})` : ''}`,
    );
  }
}
