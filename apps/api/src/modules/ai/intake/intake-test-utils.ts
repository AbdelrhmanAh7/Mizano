import { IntakeJob, IntakeJobStatus, IntakeSource, Prisma } from '@prisma/client';
import { IntakeStorage } from './intake-storage';

type Where = Record<string, unknown>;
type Row = Record<string, unknown>;

function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Where[]).some((w) => matches(row, w));
    const value = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as { in?: unknown[]; lt?: Date };
      if (c.in) return c.in.includes(value);
      if (c.lt) return (value as Date).getTime() < c.lt.getTime();
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
        this.select(where).slice(skip, take === undefined ? undefined : skip + take),
    ),
    count: jest.fn(async ({ where }: { where: Where }) => this.select(where).length),
    create: jest.fn(async ({ data }: { data: Partial<IntakeJob> }) => {
      const dup = this.rows.find(
        (r) => r.organizationId === data.organizationId && r.sha256 === data.sha256,
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
