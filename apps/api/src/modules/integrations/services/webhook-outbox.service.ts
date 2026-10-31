import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { INTEGRATION_API_VERSION, TEST_EVENT_TYPE, WebhookEventType } from '../integration-catalog';
import { currentEventSource, EventSource } from '../integration-request-context';
import {
  INVOICE_SHAPE_INCLUDE,
  PAYMENT_SHAPE_INCLUDE,
  serializeCustomer,
  serializeInvoice,
  serializePayment,
} from '../integration-serializers';

type Db = Prisma.TransactionClient | PrismaService;

export function newEventId(): string {
  return `evt_${randomUUID().replace(/-/g, '')}`;
}

/**
 * Transactional outbox. Callers pass the transaction that makes the business change, so the
 * event and its per-endpoint deliveries commit (or roll back) together with it: an invoice that
 * was never paid can never be announced as paid, and a committed payment is never lost on a
 * crash. Delivery happens later in WebhookDispatcherService.
 *
 * When no active endpoint subscribes to the event type, nothing is written at all.
 */
@Injectable()
export class WebhookOutboxService {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes the event and its deliveries; returns the event id, or null when nobody listens. */
  async record(
    db: Db,
    organizationId: string,
    type: WebhookEventType | typeof TEST_EVENT_TYPE,
    data: Record<string, unknown>,
    options: { dedupeKey?: string; endpointIds?: string[]; source?: EventSource } = {},
  ): Promise<string | null> {
    const endpoints = options.endpointIds
      ? options.endpointIds.map((id) => ({ id }))
      : await this.subscribers(db, organizationId, type);
    if (endpoints.length === 0) return null;

    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    });
    if (!org) return null;

    const id = newEventId();
    const payload = JSON.stringify({
      id,
      type,
      apiVersion: INTEGRATION_API_VERSION,
      createdAt: new Date().toISOString(),
      organization: { id: org.id, name: org.name },
      source: options.source ?? currentEventSource(),
      data,
    });

    await db.webhookEvent.create({
      data: {
        id,
        organizationId,
        type,
        payload,
        dedupeKey: options.dedupeKey,
        deliveries: {
          create: endpoints.map((e) => ({ organizationId, endpointId: e.id })),
        },
      },
    });
    return id;
  }

  async hasSubscribers(db: Db, organizationId: string, type: WebhookEventType): Promise<boolean> {
    return (await this.subscribers(db, organizationId, type)).length > 0;
  }

  /** invoice.created / .sent / .paid / .overdue / .voided for one invoice. */
  async invoiceEvent(
    db: Db,
    organizationId: string,
    type: Extract<WebhookEventType, `invoice.${string}`>,
    invoiceId: string,
    options: { dedupeKey?: string; endpointIds?: string[]; source?: EventSource } = {},
  ): Promise<string | null> {
    if (!(await this.hasSubscribers(db, organizationId, type))) return null;
    const [invoice, baseCurrency] = await Promise.all([
      db.invoice.findFirst({
        where: { id: invoiceId, organizationId },
        include: INVOICE_SHAPE_INCLUDE,
      }),
      this.baseCurrency(db, organizationId),
    ]);
    if (!invoice) return null;
    return this.record(
      db,
      organizationId,
      type,
      { invoice: serializeInvoice(invoice, baseCurrency) },
      options,
    );
  }

  async customerCreated(
    db: Db,
    organizationId: string,
    customer: Parameters<typeof serializeCustomer>[0],
  ): Promise<string | null> {
    if (!(await this.hasSubscribers(db, organizationId, 'customer.created'))) return null;
    return this.record(db, organizationId, 'customer.created', {
      customer: serializeCustomer(customer),
    });
  }

  async paymentReceived(db: Db, organizationId: string, paymentId: string): Promise<string | null> {
    return this.paymentEvent(db, organizationId, 'payment.received', paymentId);
  }

  /** payment.received / payment.voided for one payment (a voided one is still readable). */
  async paymentEvent(
    db: Db,
    organizationId: string,
    type: Extract<WebhookEventType, `payment.${string}`>,
    paymentId: string,
  ): Promise<string | null> {
    if (!(await this.hasSubscribers(db, organizationId, type))) return null;
    const [payment, baseCurrency] = await Promise.all([
      db.paymentReceived.findFirst({
        where: { id: paymentId, organizationId },
        include: PAYMENT_SHAPE_INCLUDE,
      }),
      this.baseCurrency(db, organizationId),
    ]);
    if (!payment) return null;
    return this.record(db, organizationId, type, {
      payment: serializePayment(payment, baseCurrency),
    });
  }

  private subscribers(db: Db, organizationId: string, type: string): Promise<{ id: string }[]> {
    return db.webhookEndpoint.findMany({
      where: { organizationId, isActive: true, deletedAt: null, eventTypes: { has: type } },
      select: { id: true },
    });
  }

  private async baseCurrency(db: Db, organizationId: string): Promise<string> {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });
    return org?.baseCurrency ?? 'EGP';
  }
}
