import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { ExternalEInvoiceReferencesService } from './external-einvoice-references.service';

describe('external ETA metadata command', () => {
  const prisma = createMockPrisma();
  const service = new ExternalEInvoiceReferencesService(prisma as unknown as PrismaService);
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([{ id: 'doc' }]);
  });

  it.each(['invoice', 'creditNote'] as const)(
    'writes only metadata and a value-free transactional audit on %s',
    async (kind) => {
      const result = await service.update('org-a', 'actor', kind, 'doc', ' ETA-42 ');
      expect(result).toEqual({ id: 'doc', externalEInvoiceNumber: 'ETA-42' });
      expect(prisma[kind].updateMany).toHaveBeenCalledWith({
        where: { id: 'doc', organizationId: 'org-a', deletedAt: null },
        data: { externalEInvoiceNumber: 'ETA-42' },
      });
      const audit = prisma.auditLog.create.mock.calls[0][0]?.data;
      expect(audit).toMatchObject({
        organizationId: 'org-a',
        userId: 'actor',
        action: 'UPDATE',
        entityId: 'doc',
        newValues: { fields: ['externalEInvoiceNumber'] },
      });
      expect(JSON.stringify(audit)).not.toContain('ETA-42');
      expect(prisma.journal.create).not.toHaveBeenCalled();
    },
  );

  it('does not write or audit a foreign/deleted/voided id', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(service.update('org-b', 'actor', 'invoice', 'doc', 'ETA')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect((prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql).values).toEqual(['doc', 'org-b']);
  });

  it('rejects a reference already held by the other document type', async () => {
    prisma.creditNote.count.mockResolvedValueOnce(1);
    await expect(service.update('org-a', 'actor', 'invoice', 'doc', 'ETA')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('propagates an audit failure so the surrounding transaction rolls back', async () => {
    prisma.auditLog.create.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(service.update('org-a', 'actor', 'invoice', 'doc', 'ETA')).rejects.toThrow(
      'audit unavailable',
    );
  });

  it('maps the database unique constraint to a conflict without the reference value', async () => {
    prisma.invoice.updateMany.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { target: ['organizationId', 'externalEInvoiceNumber'] },
      }),
    );
    await expect(service.update('org-a', 'actor', 'invoice', 'doc', 'ETA')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
