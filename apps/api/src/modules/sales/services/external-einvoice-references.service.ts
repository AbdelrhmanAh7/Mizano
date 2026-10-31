import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ExternalEInvoiceReferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Metadata on draft or posted records; the journal and financial fields are never written. */
  async update(
    organizationId: string,
    userId: string,
    kind: 'invoice' | 'creditNote',
    id: string,
    reference: string | null,
  ) {
    const externalEInvoiceNumber = reference?.trim() || null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Same document row lock as posting/voiding; caller IDs never select another tenant.
        const owned = await tx.$queryRaw<{ id: string }[]>(
          kind === 'invoice'
            ? Prisma.sql`SELECT id FROM invoices WHERE id = ${id} AND "organizationId" = ${organizationId} AND "deletedAt" IS NULL AND status <> 'VOID' FOR UPDATE`
            : Prisma.sql`SELECT id FROM credit_notes WHERE id = ${id} AND "organizationId" = ${organizationId} AND "deletedAt" IS NULL FOR UPDATE`,
        );
        if (owned.length === 0) {
          throw new NotFoundException(
            kind === 'invoice' ? 'Invoice not found' : 'Credit note not found',
          );
        }
        if (externalEInvoiceNumber) {
          // One reference namespace across invoices and credits, serialized before checking.
          // Hash collisions only serialize unrelated references; they never relax uniqueness.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${'eta:' + externalEInvoiceNumber}))`;
          const duplicate =
            kind === 'invoice'
              ? await tx.creditNote.count({ where: { organizationId, externalEInvoiceNumber } })
              : await tx.invoice.count({ where: { organizationId, externalEInvoiceNumber } });
          if (duplicate > 0) {
            throw new ConflictException('This ETA reference is already used in this organization');
          }
        }
        const where = { id, organizationId, deletedAt: null };
        const data = { externalEInvoiceNumber };
        if (kind === 'invoice') await tx.invoice.updateMany({ where, data });
        else await tx.creditNote.updateMany({ where, data });
        // Commit the actor and changed field with the write. Never copy reference values to logs.
        await tx.auditLog.create({
          data: {
            organizationId,
            userId,
            action: 'UPDATE',
            entityType: kind === 'invoice' ? 'Invoice' : 'CreditNote',
            entityId: id,
            newValues: { fields: ['externalEInvoiceNumber'] },
          },
        });
        return { id, externalEInvoiceNumber };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        Array.isArray(error.meta?.target) &&
        error.meta.target.includes('externalEInvoiceNumber')
      ) {
        throw new ConflictException('This ETA reference is already used in this organization');
      }
      throw error;
    }
  }
}
