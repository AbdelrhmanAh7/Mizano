import { DocumentIntakeResult } from '../services/document-intake.service';
import { IntakeJob, IntakeJobStatus, IntakeSource, Prisma } from '@prisma/client';
import { IntakeStorage } from './intake-storage';

type Where = Record<string, unknown>;
type Row = Record<string, unknown>;

function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Where[]).some((w) => matches(row, w));
    const value = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as { in?: unknown[]; lt?: Date; gt?: string };
      if (c.in) return c.in.includes(value);
      if (c.lt) return value instanceof Date && value.getTime() < c.lt.getTime();
      if (c.gt !== undefined) return String(value) > c.gt;
    }
    return value === cond;
  });
}

/** Minimal in-memory `prisma.intakeJob` honouring organizationId/status/sha256 filters. */
export class FakeIntakeJobTable {
  rows: IntakeJob[] = [];
  private seq = 0;

  private select(where: Where): IntakeJob[] {
    return this.rows.filter((r) => matches(r as unknown as Row, where));
  }

  readonly delegate = {
    findFirst: jest.fn(
      async ({ where }: { where: Where }): Promise<IntakeJob | null> =>
        this.select(where)[0] ?? null,
    ),
    findMany: jest.fn(
      async ({ where, skip = 0, take }: { where: Where; skip?: number; take?: number }) =>
        this.select(where)
          .sort((x, y) => x.id.localeCompare(y.id))
          .slice(skip, take === undefined ? undefined : skip + take),
    ),
    count: jest.fn(async ({ where }: { where: Where }) => this.select(where).length),
    create: jest.fn(async ({ data }: { data: Partial<IntakeJob> }) => {
      const dup = this.rows.find(
        (r) =>
          r.organizationId === data.organizationId &&
          r.sha256 === data.sha256 &&
          r.deletedAt === null,
      );
      if (dup) {
        throw new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      const row: IntakeJob = {
        id: `job-${++this.seq}`,
        organizationId: '',
        createdById: '',
        source: IntakeSource.WEB,
        status: IntakeJobStatus.QUEUED,
        progress: 0,
        originalFileName: '',
        mimeType: '',
        sizeBytes: 0,
        sha256: '',
        storageKey: '',
        attempts: 0,
        maxAttempts: 3,
        lastError: null,
        result: null,
        forceType: null,
        strategy: null,
        language: null,
        leaseToken: null,
        leaseExpiresAt: null,
        draftDocumentType: null,
        draftDocumentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...data,
      };
      this.rows.push(row);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Where; data: Row }) => {
      const hit = this.select(where);
      for (const row of hit) {
        const target = row as unknown as Row;
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === 'object' && 'increment' in v) {
            target[k] = (target[k] as number) + (v as { increment: number }).increment;
          } else {
            target[k] = v;
          }
        }
        row.updatedAt = new Date();
      }
      return { count: hit.length };
    }),
  };
}

export class MemoryIntakeStorage extends IntakeStorage {
  objects = new Map<string, Buffer>();

  put = jest.fn(async (key: string, data: Buffer): Promise<void> => {
    this.objects.set(key, data);
  });

  get = jest.fn(async (key: string, _expectedSha256: string): Promise<Buffer> => {
    const data = this.objects.get(key);
    if (!data) throw new Error('missing');
    return data;
  });

  delete = jest.fn(async (key: string): Promise<void> => {
    this.objects.delete(key);
  });
}

export function billResult(overrides: Partial<DocumentIntakeResult> = {}): DocumentIntakeResult {
  return {
    documentType: 'BILL',
    classificationConfidence: 0.9,
    extractedFields: {
      date: '2026-09-01',
      dueDate: null,
      total: 115,
      subtotal: 100,
      tax: 15,
      discount: null,
      documentNumber: 'INV-9',
      vendorName: 'Acme',
      vendorAddress: null,
      vendorPhone: null,
      vendorEmail: null,
      vendorTaxId: null,
      currency: 'EGP',
      paymentTerms: null,
      notes: null,
      customerName: null,
      lineItems: [{ description: 'CPU', quantity: 1, unitPrice: 100, taxAmount: 15, total: 115 }],
    },
    fieldConfidence: {},
    ocrConfidence: 0.95,
    matchedVendor: { id: 'v1', name: 'Acme', similarity: 1 },
    vendorCandidates: [],
    matchedCustomer: null,
    customerCandidates: [],
    duplicateWarning: null,
    rawText: '',
    suggestCreateVendor: null,
    extractionMethod: 'ollama-text',
    ...overrides,
  } as DocumentIntakeResult;
}

export class FakeAuditLogTable {
  rows: Array<{
    id: string;
    organizationId: string;
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    newValues?: unknown;
    createdAt: Date;
  }> = [];
  private seq = 0;

  readonly delegate = {
    create: jest.fn(
      async ({
        data,
      }: {
        data: {
          organizationId: string;
          userId: string;
          action: string;
          entityType: string;
          entityId: string;
          newValues?: unknown;
        };
      }) => {
        const row = {
          id: `audit-${++this.seq}`,
          createdAt: new Date(),
          ...data,
        };
        this.rows.push(row);
        return row;
      },
    ),
    findFirst: jest.fn(
      async ({
        where,
      }: {
        where: { organizationId?: string; entityType?: string; entityId?: string };
      }) => {
        return (
          this.rows
            .slice()
            .reverse()
            .find(
              (r) =>
                (!where.organizationId || r.organizationId === where.organizationId) &&
                (!where.entityType || r.entityType === where.entityType) &&
                (!where.entityId || r.entityId === where.entityId),
            ) ?? null
        );
      },
    ),
  };
}

export class FakeDocumentTable {
  rows: Array<{ id: string; organizationId: string; deletedAt: Date | null }> = [];

  readonly delegate = {
    findFirst: jest.fn(
      async ({
        where,
      }: {
        where: { id: string; organizationId: string; deletedAt?: Date | null };
      }) => {
        return (
          this.rows.find(
            (r) =>
              r.id === where.id &&
              r.organizationId === where.organizationId &&
              (where.deletedAt === undefined || r.deletedAt === where.deletedAt),
          ) ?? null
        );
      },
    ),
  };
}
