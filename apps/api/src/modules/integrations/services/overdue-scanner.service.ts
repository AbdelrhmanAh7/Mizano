import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { describeError } from '../../../common/utils/redact';
import { PrismaService } from '../../../prisma/prisma.service';
import { WebhookOutboxService } from './webhook-outbox.service';

const BATCH = 200;

/**
 * Emits `invoice.overdue` once per invoice and due date for every issued invoice with an open
 * balance whose due date has passed. The dedupe key makes the scan idempotent, so it can run
 * hourly, after restarts, and concurrently with the midnight status job. Moving the due date
 * (not possible today on a sent invoice, but cheap to support) yields a fresh notice.
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
      const startOfToday = new Date(now);
      startOfToday.setUTCHours(0, 0, 0, 0);
      const orgs = await this.prisma.webhookEndpoint.findMany({
        where: { isActive: true, deletedAt: null, eventTypes: { has: 'invoice.overdue' } },
        select: { organizationId: true },
        distinct: ['organizationId'],
      });
      for (const { organizationId } of orgs) {
        let cursor: string | undefined;
        for (;;) {
          const invoices = await this.prisma.invoice.findMany({
            where: {
              organizationId,
              deletedAt: null,
              status: {
                in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE],
              },
              dueDate: { lt: startOfToday },
              balanceDue: { gt: 0 },
            },
            select: { id: true, dueDate: true },
            orderBy: { id: 'asc' },
            take: BATCH,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          });
          if (invoices.length === 0) break;
          for (const inv of invoices) {
            if (await this.emitOnce(organizationId, inv.id, inv.dueDate)) emitted += 1;
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
    invoiceId: string,
    dueDate: Date,
  ): Promise<boolean> {
    const dedupeKey = `invoice.overdue:${invoiceId}:${dueDate.toISOString().slice(0, 10)}`;
    const exists = await this.prisma.webhookEvent.findUnique({
      where: { organizationId_dedupeKey: { organizationId, dedupeKey } },
      select: { id: true },
    });
    if (exists) return false;
    try {
      return !!(await this.outbox.invoiceEvent(
        this.prisma,
        organizationId,
        'invoice.overdue',
        invoiceId,
        {
          dedupeKey,
          source: { type: 'system' },
        },
      ));
    } catch (error) {
      // A concurrent scan won the unique (organizationId, dedupeKey) race: already emitted.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return false;
      throw error;
    }
  }
}
