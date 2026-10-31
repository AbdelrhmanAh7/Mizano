import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { overdueCutoffUpdate } from './integration-settings.service';
import { OverdueScannerService } from './overdue-scanner.service';
import { WebhookOutboxService } from './webhook-outbox.service';

const NOW = new Date('2026-10-31T10:00:00.000Z');

describe('OverdueScannerService (audit F2)', () => {
  function setup(
    endpoints: Array<{ id: string; overdueNoticesFrom: Date | null; createdAt: Date }>,
  ) {
    const prisma = {
      webhookEndpoint: {
        findMany: jest
          .fn()
          .mockResolvedValue(endpoints.map((e) => ({ ...e, organizationId: 'org_1' }))),
      },
      invoice: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'inv_1', dueDate: new Date('2026-10-20T00:00:00.000Z') }])
          .mockResolvedValue([]),
      },
      webhookEvent: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const outbox = { invoiceEvent: jest.fn().mockResolvedValue('evt_1') };
    const scanner = new OverdueScannerService(
      prisma as unknown as PrismaService,
      outbox as unknown as WebhookOutboxService,
    );
    return { prisma, outbox, scanner };
  }

  it('only looks at invoices that fall due after the endpoint subscribed', async () => {
    const { prisma, scanner } = setup([
      {
        id: 'ep_1',
        overdueNoticesFrom: new Date('2026-10-15T13:00:00.000Z'),
        createdAt: new Date(0),
      },
    ]);
    await scanner.scan(NOW);
    expect(prisma.invoice.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org_1',
      deletedAt: null,
      status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
      dueDate: {
        gte: new Date('2026-10-15T00:00:00.000Z'),
        lt: new Date('2026-10-31T00:00:00.000Z'),
      },
    });
  });

  it("falls back to the endpoint's creation day and sends to that endpoint only", async () => {
    const { prisma, outbox, scanner } = setup([
      { id: 'ep_1', overdueNoticesFrom: null, createdAt: new Date('2026-10-18T22:00:00.000Z') },
    ]);
    expect(await scanner.scan(NOW)).toBe(1);
    expect(prisma.invoice.findMany.mock.calls[0][0].where.dueDate.gte).toEqual(
      new Date('2026-10-18T00:00:00.000Z'),
    );
    expect(outbox.invoiceEvent).toHaveBeenCalledWith(
      prisma,
      'org_1',
      'invoice.overdue',
      'inv_1',
      expect.objectContaining({
        dedupeKey: 'invoice.overdue:inv_1:2026-10-20:ep_1',
        endpointIds: ['ep_1'],
      }),
    );
  });
});

describe('overdueCutoffUpdate (audit F2)', () => {
  const on = { eventTypes: ['invoice.overdue'], isActive: true };
  const off = { eventTypes: ['invoice.paid'], isActive: true };

  it('starts the cutoff when an endpoint starts listening, and keeps it otherwise', () => {
    expect(overdueCutoffUpdate(null, on, NOW)).toEqual(NOW);
    expect(overdueCutoffUpdate(off, on, NOW)).toEqual(NOW);
    expect(overdueCutoffUpdate({ ...on, isActive: false }, on, NOW)).toEqual(NOW);
    expect(overdueCutoffUpdate(on, on, NOW)).toBeUndefined();
    expect(overdueCutoffUpdate(on, off, NOW)).toBeUndefined();
    expect(overdueCutoffUpdate(null, off, NOW)).toBeUndefined();
  });
});
