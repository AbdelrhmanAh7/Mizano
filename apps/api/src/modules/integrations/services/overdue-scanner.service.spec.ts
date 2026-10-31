import { BadRequestException } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  IntegrationSettingsService,
  overdueCutoffUpdate,
  WEBHOOK_ENDPOINT_INACTIVE,
} from './integration-settings.service';
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
      webhookEvent: { findFirst: jest.fn().mockResolvedValue(null) },
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

  it('treats a notice sent to the endpoint under the legacy org-wide key as sent', async () => {
    const { prisma, outbox, scanner } = setup([
      { id: 'ep_1', overdueNoticesFrom: null, createdAt: new Date('2026-10-01T00:00:00.000Z') },
    ]);
    prisma.webhookEvent.findFirst.mockResolvedValue({ id: 'evt_legacy' });
    expect(await scanner.scan(NOW)).toBe(0);
    expect(outbox.invoiceEvent).not.toHaveBeenCalled();
    expect(prisma.webhookEvent.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org_1',
        OR: [
          { dedupeKey: 'invoice.overdue:inv_1:2026-10-20:ep_1' },
          {
            dedupeKey: 'invoice.overdue:inv_1:2026-10-20',
            deliveries: { some: { endpointId: 'ep_1' } },
          },
        ],
      },
      select: { id: true },
    });
  });

  it('starts the cutoff of endpoints that exist at deploy time, keeping explicit ones', () => {
    const sql = readFileSync(
      join(
        __dirname,
        '../../../../prisma/migrations/20261031020000_webhook_overdue_cutoff_backfill/migration.sql',
      ),
      'utf8',
    )
      .replace(/--.*$/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
    expect(sql).toBe(
      `UPDATE "webhook_endpoints" SET "overdueNoticesFrom" = (now() AT TIME ZONE 'UTC') WHERE "overdueNoticesFrom" IS NULL;`,
    );
  });
});

describe('IntegrationSettingsService.sendOverdueBacklog (audit F2)', () => {
  function setup(endpoint: { eventTypes: string[]; isActive: boolean }) {
    const prisma = {
      webhookEndpoint: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'ep_1', organizationId: 'org_1', ...endpoint }),
        update: jest.fn().mockResolvedValue({ id: 'ep_1' }),
      },
    };
    const service = new IntegrationSettingsService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
    );
    return { prisma, service };
  }

  it('opts an active subscriber in to the backlog', async () => {
    const { prisma, service } = setup({ eventTypes: ['invoice.overdue'], isActive: true });
    await service.sendOverdueBacklog('org_1', 'ep_1');
    expect(prisma.webhookEndpoint.findFirst).toHaveBeenCalledWith({
      where: { id: 'ep_1', organizationId: 'org_1', deletedAt: null },
    });
    expect(prisma.webhookEndpoint.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ep_1' }, data: { overdueNoticesFrom: new Date(0) } }),
    );
  });

  it('refuses an inactive endpoint with a coded error, since re-enabling resets the cutoff', async () => {
    const { prisma, service } = setup({ eventTypes: ['invoice.overdue'], isActive: false });
    const error = await service.sendOverdueBacklog('org_1', 'ep_1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      statusCode: 400,
      code: WEBHOOK_ENDPOINT_INACTIVE,
    });
    expect(prisma.webhookEndpoint.update).not.toHaveBeenCalled();
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
