import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { describeError } from '../../../common/utils/redact';
import { PrismaService } from '../../../prisma/prisma.service';
import { WebhookOutboxService } from './webhook-outbox.service';

const BATCH = 200;

/**
 * Emits `invoice.overdue` once per endpoint, invoice and due date for every issued invoice with
 * an open balance whose due date has passed. An endpoint hears only about invoices that fall due
 * after it started listening (`overdueNoticesFrom`, else its createdAt), so connecting FlowLine
 * never floods it with every old debt; the settings "send backlog" action opts in to those
 * (audit F2). The dedupe key makes the scan idempotent, so it can run hourly, after restarts,
 * and concurrently with the midnight status job. Moving the due date yields a fresh notice.
 *
 * Before F2 the key was org-wide (`invoice.overdue:<invoice>:<due date>`, no endpoint) and the
 * event went to every subscriber. A notice recorded under that legacy key with a delivery to this
 * endpoint counts as sent, so the key change never re-announces a debt the endpoint already heard.
 */
@Injectable()
export class OverdueScannerService {
  private readonly logger = new Logger(OverdueScannerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: WebhookOutboxService,
  ) {}

  @Cron('0 7 * * * *', { name: 'integration-overdue-scan' })
  async hourly(): Promise<void> {
    if (process.env.INTEGRATIONS_DISPATCH_ENABLED === 'false') return;
    await this.scan();
  }

  async scan(now: Date = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let emitted = 0;
    try {
      const startOfToday = startOfUtcDay(now);
      const endpoints = await this.prisma.webhookEndpoint.findMany({
        where: { isActive: true, deletedAt: null, eventTypes: { has: 'invoice.overdue' } },
        select: { id: true, organizationId: true, overdueNoticesFrom: true, createdAt: true },
        orderBy: { id: 'asc' },
      });
      for (const endpoint of endpoints) {
        const { organizationId } = endpoint;
        // Overdue from the day after the due date, so an invoice due on the day the endpoint
        // subscribed (or later) falls due after it: due date >= that day (UTC).
        const dueFrom = startOfUtcDay(endpoint.overdueNoticesFrom ?? endpoint.createdAt);
        let cursor: string | undefined;
        for (;;) {
          const invoices = await this.prisma.invoice.findMany({
            where: {
              organizationId,
              deletedAt: null,
              status: {
                in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE],
              },
              dueDate: { gte: dueFrom, lt: startOfToday },
              balanceDue: { gt: 0 },
            },
            select: { id: true, dueDate: true },
            orderBy: { id: 'asc' },
            take: BATCH,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          });
          if (invoices.length === 0) break;
          for (const inv of invoices) {
            if (await this.emitOnce(organizationId, endpoint.id, inv.id, inv.dueDate)) {
              emitted += 1;
            }
          }
          cursor = invoices[invoices.length - 1].id;
          if (invoices.length < BATCH) break;
        }
      }
    } catch (error) {
      this.logger.error(`Overdue scan failed: ${describeError(error, { includeMessage: false })}`);
    } finally {
      this.running = false;
    }
    return emitted;
  }

  private async emitOnce(
    organizationId: string,
    endpointId: string,
    invoiceId: string,
    dueDate: Date,
  ): Promise<boolean> {
    const legacyKey = `invoice.overdue:${invoiceId}:${dueDate.toISOString().slice(0, 10)}`;
    const dedupeKey = `${legacyKey}:${endpointId}`;
    const exists = await this.prisma.webhookEvent.findFirst({
      where: {
        organizationId,
        OR: [{ dedupeKey }, { dedupeKey: legacyKey, deliveries: { some: { endpointId } } }],
      },
      select: { id: true },
    });
    if (exists) return false;
    try {
      return !!(await this.outbox.invoiceEvent(
        this.prisma,
        organizationId,
        'invoice.overdue',
        invoiceId,
        { dedupeKey, endpointIds: [endpointId], source: { type: 'system' } },
      ));
    } catch (error) {
      // A concurrent scan won the unique (organizationId, dedupeKey) race: already emitted.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return false;
      throw error;
    }
  }
}

function startOfUtcDay(date: Date): Date {
  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}
