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
import { startOfTodayUtc } from '../../sales/utils/sales-helpers';
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

export interface IdempotentResult {
  status: number;
  body: unknown;
  replayed: boolean;
}

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
    return { data: { ...serializeCustomer(c), balance: await this.customerBalance(orgId, id) } };
  }

  async createCustomer(orgId: string, dto: CreateCustomerDto) {
    const created = await this.customers.create(orgId, dto);
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

  async getInvoice(orgId: string, id: string) {
    const [inv, base] = await Promise.all([
      this.prisma.invoice.findFirst({
        where: { id, organizationId: orgId, deletedAt: null },
        include: INVOICE_SHAPE_INCLUDE,
      }),
      this.baseCurrency(orgId),
    ]);
    if (!inv) throw new NotFoundException('Invoice not found');
    return { data: serializeInvoice(inv, base) };
  }

  /** Creates a DRAFT invoice with the web app's command (an accountant sends it). */
  async createInvoice(orgId: string, dto: CreateInvoiceDto) {
    const created = await this.invoices.create(orgId, dto);
    return this.getInvoice(orgId, created.id);
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

  async createNote(p: IntegrationPrincipal, dto: CreateIntegrationNoteDto) {
    const orgId = p.organizationId;
    const label = await this.assertNoteTarget(orgId, dto.entityType, dto.entityId);
    const note = await this.prisma.$transaction(async (tx) => {
      const created = await tx.integrationNote.create({
        data: {
          organizationId: orgId,
          apiKeyId: p.apiKeyId,
          entityType: dto.entityType,
          entityId: dto.entityId,
          body: dto.body,
        },
      });
      // The key owner sees the note in the in-app bell, linked to the record.
      await tx.notification.create({
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
    });
    // Same realtime path as other in-app notifications (EntityEventListener -> gateway).
    this.events.emit('notification.created', {
      organizationId: orgId,
      title: `${p.apiKeyName}: ${label}`.slice(0, 200),
      message: dto.body.slice(0, 500),
      type: 'integration.note',
      entityType: dto.entityType,
      entityId: dto.entityId,
    });
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
  ): Promise<string> {
    if (entityType === 'customer') {
      const c = await this.prisma.customer.findFirst({
        where: { id: entityId, organizationId: orgId, deletedAt: null },
        select: { name: true },
      });
      if (!c) throw new NotFoundException('Customer not found');
      return c.name;
    }
    if (entityType === 'invoice') {
      const i = await this.prisma.invoice.findFirst({
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
   * stored response; a different body is 422; a repeat while the first is still running is 409
   * (retry later). A failed first attempt frees the key so the client can retry.
   */
  async idempotent(
    p: IntegrationPrincipal,
    idempotencyKey: string | undefined,
    request: { method: string; path: string; body: unknown },
    successStatus: number,
    fn: () => Promise<unknown>,
  ): Promise<IdempotentResult> {
    if (idempotencyKey === undefined || idempotencyKey === '') {
      return { status: successStatus, body: await fn(), replayed: false };
    }
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key must be 1-200 printable ASCII characters');
    }
    const requestHash = createHash('sha256')
      .update(`${request.method} ${request.path}\n${JSON.stringify(request.body ?? null)}`)
      .digest('hex');

    let rowId: string;
    try {
      const row = await this.prisma.integrationIdempotencyKey.create({
        data: {
          organizationId: p.organizationId,
          apiKeyId: p.apiKeyId,
          key: idempotencyKey,
          requestHash,
        },
        select: { id: true },
      });
      rowId = row.id;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))
        throw error;
      const existing = await this.prisma.integrationIdempotencyKey.findUnique({
        where: { apiKeyId_key: { apiKeyId: p.apiKeyId, key: idempotencyKey } },
      });
      if (!existing) throw new ConflictException('Idempotency-Key is being reused; retry');
      if (existing.requestHash !== requestHash) {
        throw new UnprocessableEntityException(
          'Idempotency-Key was already used with a different request',
        );
      }
      if (existing.responseStatus === null) {
        throw new ConflictException('A request with this Idempotency-Key is still in progress');
      }
      return { status: existing.responseStatus, body: existing.responseBody, replayed: true };
    }

    let body: unknown;
    try {
      body = await fn();
    } catch (error) {
      await this.prisma.integrationIdempotencyKey
        .delete({ where: { id: rowId } })
        .catch(() => undefined);
      throw error;
    }
    const stored = JSON.parse(JSON.stringify(body ?? null)) as Prisma.InputJsonValue;
    await this.prisma.integrationIdempotencyKey.update({
      where: { id: rowId },
      data: { responseStatus: successStatus, responseBody: stored },
    });
    return { status: successStatus, body, replayed: false };
  }

  @Cron('0 23 3 * * *', { name: 'integration-idempotency-cleanup' })
  async purgeIdempotencyKeys(): Promise<number> {
    const { count } = await this.prisma.integrationIdempotencyKey.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - IDEMPOTENCY_TTL_HOURS * 3_600_000) } },
    });
    return count;
  }

  private async baseCurrency(orgId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { baseCurrency: true },
    });
    return org?.baseCurrency ?? 'EGP';
  }
}
