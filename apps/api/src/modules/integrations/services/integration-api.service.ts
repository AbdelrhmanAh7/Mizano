import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CreditNoteType, InvoiceStatus, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { CustomersService } from '../../sales/services/customers.service';
import {
  InvoicesService,
  RECEIVABLE_INVOICE_STATUSES,
} from '../../sales/services/invoices.service';
import { startOfTodayUtc } from '../../../common/utils/sales-helpers';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateCustomerDto } from '../../sales/dto/create-customer.dto';
import { CreateInvoiceDto } from '../../sales/dto/create-invoice.dto';
import {
  CreateIntegrationNoteDto,
  IntegrationCustomerQueryDto,
  IntegrationInvoiceQueryDto,
  IntegrationNoteQueryDto,
} from '../dto/integration-api.dto';
import type { IntegrationPrincipal } from '../guards/integration-api-key.guard';
import { INTEGRATION_API_VERSION } from '../integration-catalog';
import {
  INVOICE_SHAPE_INCLUDE,
  serializeCustomer,
  serializeInvoice,
} from '../integration-serializers';

const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{1,200}$/;
const IDEMPOTENCY_TTL_HOURS = 24;

/**
 * JSON with the object keys sorted at every depth (arrays keep their order), so the same payload
 * sent with another key order gets the same Idempotency-Key fingerprint.
 */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value ?? null, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}

/** The fingerprint an Idempotency-Key is bound to: method, path and the serialized body. */
function requestFingerprint(request: { method: string; path: string }, body: string): string {
  return createHash('sha256').update(`${request.method} ${request.path}\n${body}`).digest('hex');
}

export interface IdempotentResult {
  status: number;
  body: unknown;
  replayed: boolean;
}

/** Database handle for reads that must see the caller's uncommitted writes. */
type Db = Prisma.TransactionClient | PrismaService;

/**
 * An integration write. It runs inside the transaction that also stores its idempotency record,
 * and registers side effects that must wait for the commit (realtime pushes) with `afterCommit`.
 */
export type IntegrationWrite = (
  tx: Prisma.TransactionClient,
  afterCommit: (effect: () => void) => void,
) => Promise<unknown>;

/** Room for a document write plus the idempotency record on the Pi (Prisma's default is 5 s). */
const WRITE_TX_OPTIONS = { maxWait: 5_000, timeout: 15_000 };

const CUSTOMER_SHAPE_SELECT = {
  id: true,
  name: true,
  displayName: true,
  email: true,
  phone: true,
  taxId: true,
  currency: true,
  paymentTerms: true,
  createdAt: true,
} satisfies Prisma.CustomerSelect;

/**
 * The FlowLine-facing REST surface. Writes go through the same sales commands as the web app
 * (validation, numbering, tenant checks, outbox events); invoices are created as DRAFTs only,
 * because posting to the ledger stays an explicit accountant action.
 */
@Injectable()
export class IntegrationApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly invoices: InvoicesService,
    private readonly events: EventEmitter2,
  ) {}

  async me(p: IntegrationPrincipal) {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: p.organizationId },
      select: { id: true, name: true, baseCurrency: true },
    });
    return {
      apiVersion: INTEGRATION_API_VERSION,
      organization: org,
      key: { id: p.apiKeyId, name: p.apiKeyName, scopes: p.scopes },
      actingUser: { id: p.id, name: p.name },
    };
  }

  // ── Customers ─────────────────────────────────────────

  async listCustomers(orgId: string, q: IntegrationCustomerQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 25;
    const where: Prisma.CustomerWhereInput = { organizationId: orgId, deletedAt: null };
    if (q.email) where.email = { equals: q.email, mode: 'insensitive' };
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { email: { contains: q.search, mode: 'insensitive' } },
        { phone: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        select: CUSTOMER_SHAPE_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return {
      data: rows.map(serializeCustomer),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getCustomer(orgId: string, id: string) {
    const c = await this.prisma.customer.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      select: CUSTOMER_SHAPE_SELECT,
    });
    if (!c) throw new NotFoundException('Customer not found');
    // No balance here: debts are only readable with the `balances:read` scope, through
    // GET /customers/:id/balance (a customer-directory key must not see receivables).
    return { data: serializeCustomer(c) };
  }

  async createCustomer(orgId: string, dto: CreateCustomerDto, tx?: Prisma.TransactionClient) {
    const created = await this.customers.create(orgId, dto, { tx });
    return { data: serializeCustomer(created) };
  }

  async getCustomerBalance(orgId: string, id: string) {
    const exists = await this.prisma.customer.count({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!exists) throw new NotFoundException('Customer not found');
    return { data: { customerId: id, ...(await this.customerBalance(orgId, id)) } };
  }

  // ── Invoices ──────────────────────────────────────────

  async listInvoices(orgId: string, q: IntegrationInvoiceQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 25;
    const where: Prisma.InvoiceWhereInput = { organizationId: orgId, deletedAt: null };
    if (q.status) where.status = q.status as InvoiceStatus;
    if (q.customerId) where.customerId = q.customerId;
    const [rows, total, base] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: INVOICE_SHAPE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
      this.baseCurrency(orgId),
    ]);
    return {
      data: rows.map((r) => serializeInvoice(r, base)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getInvoice(orgId: string, id: string, db: Db = this.prisma) {
    // Sequential: a transaction client runs one query at a time anyway.
    const inv = await db.invoice.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: INVOICE_SHAPE_INCLUDE,
    });
    const base = await this.baseCurrency(orgId, db);
    if (!inv) throw new NotFoundException('Invoice not found');
    return { data: serializeInvoice(inv, base) };
  }

  /** Creates a DRAFT invoice with the web app's command (an accountant sends it). */
  async createInvoice(orgId: string, dto: CreateInvoiceDto, tx?: Prisma.TransactionClient) {
    const created = await this.invoices.create(orgId, dto, { tx });
    return this.getInvoice(orgId, created.id, tx);
  }

  // ── Balances ──────────────────────────────────────────

  /**
   * Open receivables. `outstanding` is the sum of open invoice balances (what the customer
   * list shows); `netReceivable` subtracts unapplied credit notes, which is what AR ties to.
   */
  async balancesSummary(orgId: string) {
    return { data: await this.receivables(orgId) };
  }

  private async customerBalance(orgId: string, customerId: string) {
    return this.receivables(orgId, customerId);
  }

  private async receivables(orgId: string, customerId?: string) {
    const today = startOfTodayUtc();
    const base: Prisma.InvoiceWhereInput = {
      organizationId: orgId,
      deletedAt: null,
      status: { in: RECEIVABLE_INVOICE_STATUSES },
      balanceDue: { gt: 0 },
      ...(customerId ? { customerId } : {}),
    };
    const [open, overdue, credits, oldest, currency] = await Promise.all([
      this.prisma.invoice.aggregate({ where: base, _sum: { balanceDue: true }, _count: true }),
      this.prisma.invoice.aggregate({
        where: { ...base, dueDate: { lt: today } },
        _sum: { balanceDue: true },
        _count: true,
      }),
      this.prisma.creditNote.aggregate({
        where: {
          organizationId: orgId,
          deletedAt: null,
          type: CreditNoteType.APPLY_TO_INVOICE,
          appliedToInvoiceId: null,
          date: { lte: new Date() },
          ...(customerId ? { customerId } : {}),
        },
        _sum: { amount: true },
      }),
      this.prisma.invoice.findFirst({
        where: { ...base, dueDate: { lt: today } },
        orderBy: { dueDate: 'asc' },
        select: { dueDate: true },
      }),
      this.baseCurrency(orgId),
    ]);
    const zero = new Prisma.Decimal(0);
    const outstanding = open._sum.balanceDue ?? zero;
    const unapplied = credits._sum.amount ?? zero;
    return {
      currency,
      outstanding: outstanding.toFixed(4),
      overdue: (overdue._sum.balanceDue ?? zero).toFixed(4),
      unappliedCredits: unapplied.toFixed(4),
      netReceivable: outstanding.sub(unapplied).toFixed(4),
      openInvoices: open._count,
      overdueInvoices: overdue._count,
      oldestOverdueDueDate: oldest ? oldest.dueDate.toISOString().slice(0, 10) : null,
      asOf: new Date().toISOString(),
    };
  }

  // ── Notes ─────────────────────────────────────────────

  async createNote(
    p: IntegrationPrincipal,
    dto: CreateIntegrationNoteDto,
    tx?: Prisma.TransactionClient,
    afterCommit: (effect: () => void) => void = (effect) => effect(),
  ) {
    const orgId = p.organizationId;
    const label = await this.assertNoteTarget(orgId, dto.entityType, dto.entityId, tx);
    const write = async (db: Prisma.TransactionClient) => {
      const created = await db.integrationNote.create({
        data: {
          organizationId: orgId,
          apiKeyId: p.apiKeyId,
          entityType: dto.entityType,
          entityId: dto.entityId,
          body: dto.body,
        },
      });
      // The key owner sees the note in the in-app bell, linked to the record.
      await db.notification.create({
        data: {
          organizationId: orgId,
          userId: p.id,
          type: 'integration.note',
          title: `${p.apiKeyName}: ${label}`.slice(0, 200),
          message: dto.body.slice(0, 500),
          entityType: dto.entityType,
          entityId: dto.entityId,
        },
      });
      return created;
    };
    const note = await (tx ? write(tx) : this.prisma.$transaction(write));
    // Same realtime path as other in-app notifications (EntityEventListener -> gateway), once
    // the note has committed.
    afterCommit(() =>
      this.events.emit('notification.created', {
        organizationId: orgId,
        title: `${p.apiKeyName}: ${label}`.slice(0, 200),
        message: dto.body.slice(0, 500),
        type: 'integration.note',
        entityType: dto.entityType,
        entityId: dto.entityId,
      }),
    );
    return { data: this.noteShape(note, p.apiKeyName) };
  }

  async listNotes(orgId: string, q: IntegrationNoteQueryDto) {
    await this.assertNoteTarget(orgId, q.entityType, q.entityId);
    const limit = q.limit ?? 25;
    const rows = await this.prisma.integrationNote.findMany({
      where: { organizationId: orgId, entityType: q.entityType, entityId: q.entityId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: ((q.page ?? 1) - 1) * limit,
    });
    return { data: rows.map((n) => this.noteShape(n)) };
  }

  private noteShape(
    n: { id: string; entityType: string; entityId: string; body: string; createdAt: Date },
    source?: string,
  ) {
    return {
      id: n.id,
      entityType: n.entityType,
      entityId: n.entityId,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
      ...(source ? { source } : {}),
    };
  }

  private async assertNoteTarget(
    orgId: string,
    entityType: string,
    entityId: string,
    db: Db = this.prisma,
  ): Promise<string> {
    if (entityType === 'customer') {
      const c = await db.customer.findFirst({
        where: { id: entityId, organizationId: orgId, deletedAt: null },
        select: { name: true },
      });
      if (!c) throw new NotFoundException('Customer not found');
      return c.name;
    }
    if (entityType === 'invoice') {
      const i = await db.invoice.findFirst({
        where: { id: entityId, organizationId: orgId, deletedAt: null },
        select: { invoiceNumber: true },
      });
      if (!i) throw new NotFoundException('Invoice not found');
      return i.invoiceNumber;
    }
    throw new BadRequestException('Unsupported entityType');
  }

  // ── Idempotency ───────────────────────────────────────

  /**
   * Runs `fn` at most once per (key, Idempotency-Key). A repeat with the same body replays the
   * stored response; a different body is 422.
   *
   * The record `fn` writes, its outbox events and the idempotency record with the response
   * commit in one transaction (audit F1). A crash or a failed write leaves neither, so a retry
   * runs cleanly instead of getting 409 for a day or, after the purge, writing a duplicate. A
   * concurrent duplicate waits on the key's unique index and then replays the winner.
   */
  async idempotent(
    p: IntegrationPrincipal,
    idempotencyKey: string | undefined,
    request: { method: string; path: string; body: unknown },
    successStatus: number,
    fn: IntegrationWrite,
  ): Promise<IdempotentResult> {
    const effects: Array<() => void> = [];
    const afterCommit = (effect: () => void) => {
      effects.push(effect);
    };
    const committed = (body: unknown): IdempotentResult => {
      for (const effect of effects) effect();
      return { status: successStatus, body, replayed: false };
    };

    if (idempotencyKey === undefined || idempotencyKey === '') {
      return committed(
        await this.prisma.$transaction((tx) => fn(tx, afterCommit), WRITE_TX_OPTIONS),
      );
    }
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key must be 1-200 printable ASCII characters');
    }
    const requestHash = requestFingerprint(request, canonicalJson(request.body));
    // Keys stored before the canonical form (kept IDEMPOTENCY_TTL_HOURS) still replay a
    // byte-identical retry instead of answering 422 (review lessons 2: honour the old key).
    const legacyHash = requestFingerprint(request, JSON.stringify(request.body ?? null));
    const hashes = [requestHash, legacyHash];

    const existing = await this.findIdempotencyKey(p, idempotencyKey);
    if (existing) return this.replay(existing, hashes);

    let keyClaimed = false;
    try {
      const body = await this.prisma.$transaction(async (tx) => {
        const row = await tx.integrationIdempotencyKey.create({
          data: {
            organizationId: p.organizationId,
            apiKeyId: p.apiKeyId,
            key: idempotencyKey,
            requestHash,
          },
          select: { id: true },
        });
        keyClaimed = true;
        const result = await fn(tx, afterCommit);
        await tx.integrationIdempotencyKey.update({
          where: { id: row.id },
          data: {
            responseStatus: successStatus,
            responseBody: JSON.parse(JSON.stringify(result ?? null)) as Prisma.InputJsonValue,
          },
        });
        return result;
      }, WRITE_TX_OPTIONS);
      return committed(body);
    } catch (error) {
      // Only a unique violation on claiming the key means another request won it.
      const lostTheKey =
        !keyClaimed &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002';
      if (!lostTheKey) throw error;
      const winner = await this.findIdempotencyKey(p, idempotencyKey);
      if (!winner) throw new ConflictException('Idempotency-Key is being reused; retry');
      return this.replay(winner, hashes);
    }
  }

  private findIdempotencyKey(p: IntegrationPrincipal, key: string) {
    return this.prisma.integrationIdempotencyKey.findUnique({
      where: { apiKeyId_key: { apiKeyId: p.apiKeyId, key } },
    });
  }

  private replay(
    existing: { requestHash: string; responseStatus: number | null; responseBody: unknown },
    requestHashes: string[],
  ): IdempotentResult {
    if (!requestHashes.includes(existing.requestHash)) {
      throw new UnprocessableEntityException(
        'Idempotency-Key was already used with a different request',
      );
    }
    if (existing.responseStatus === null) {
      // Only rows written before records and keys committed together can lack a response.
      throw new ConflictException('A request with this Idempotency-Key is still in progress');
    }
    return { status: existing.responseStatus, body: existing.responseBody, replayed: true };
  }

  @Cron('0 23 3 * * *', { name: 'integration-idempotency-cleanup' })
  async purgeIdempotencyKeys(): Promise<number> {
    const { count } = await this.prisma.integrationIdempotencyKey.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - IDEMPOTENCY_TTL_HOURS * 3_600_000) } },
    });
    return count;
  }

  private async baseCurrency(orgId: string, db: Db = this.prisma): Promise<string> {
    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { baseCurrency: true },
    });
    return org?.baseCurrency ?? 'EGP';
  }
}
