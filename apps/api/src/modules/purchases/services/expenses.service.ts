import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountType, ExpenseStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BulkResultDto } from '../../../common/dto/bulk-result.dto';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { bankCashAccountWhere } from '../../../common/utils/bank-cash-accounts';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { round } from '../../../common/utils/document-totals';
import { lockOrganizationLedger } from '../../../common/utils/ledger-lock';
import { runBulk } from '../../../common/utils/run-bulk';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalSourceType, JournalsService } from '../../accounting/services/journals.service';
import {
  assertMoneyFits,
  parseDocumentDate,
  parsePositiveDecimal,
} from '../../sales/utils/sales-helpers';
import { CreateExpenseDto } from '../dto/create-expense.dto';
import { ExpenseQueryDto } from '../dto/expense-query.dto';

export interface LookupAccount {
  id: string;
  code: string;
  name: string;
}

const EXPENSE_VIEW_INCLUDE = {
  account: { select: { id: true, code: true, name: true } },
  vendor: { select: { id: true, name: true } },
} satisfies Prisma.ExpenseInclude;

@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private journalsService: JournalsService,
  ) {}

  /**
   * Records an expense and posts it in one transaction:
   *   Dr expense account (net) / Dr VAT Receivable (VAT) / Cr paid-through bank or cash account
   * dated on the expense date. The VAT amount is always computed here from the VAT percentage
   * (never accepted from the client): exclusive => VAT = net x rate; inclusive => the entered
   * amount is gross and VAT = gross x rate / (100 + rate). `amount` is stored net of VAT.
   * Pass `options.tx` to compose this into a caller's transaction (recurring, reconciliation).
   */
  async create(
    organizationId: string,
    dto: CreateExpenseDto,
    options: { tx?: Prisma.TransactionClient; post?: boolean } = {},
  ) {
    // post=false records a PENDING expense with no journal (recurring profiles without autoPost);
    // it reaches the ledger only through post().
    const posting = options.post !== false;
    const entered = parsePositiveDecimal(dto.amount, 'amount');
    assertMoneyFits(entered, 'amount');
    const rate = dto.taxRate ? new Decimal(dto.taxRate) : new Decimal(0);
    if (!rate.isFinite() || rate.isNegative() || rate.greaterThan(100)) {
      throw new BadRequestException('taxRate must be between 0 and 100');
    }
    const date = parseDocumentDate(dto.date, 'expense date');
    const taxInclusive = dto.taxInclusive === true;

    const taxAmount = taxInclusive
      ? round(entered.mul(rate).div(rate.add(100)))
      : round(entered.mul(rate).div(100));
    const net = taxInclusive ? entered.sub(taxAmount) : entered;
    const gross = net.add(taxAmount);
    assertMoneyFits(gross, 'total');

    const run = async (tx: Prisma.TransactionClient) => {
      // Lock first: the settings and account checks below must see the same organization state
      // the journal is posted under.
      await lockOrganizationLedger(tx, organizationId);

      const expenseAccount = await tx.account.findFirst({
        where: {
          id: dto.accountId,
          organizationId,
          deletedAt: null,
          isActive: true,
          type: AccountType.EXPENSE,
        },
        select: { id: true },
      });
      if (!expenseAccount) {
        throw new BadRequestException('Expense account must be an active expense account');
      }
      const paidThrough = await tx.account.findFirst({
        where: {
          AND: [{ id: dto.paidThroughAccountId }, await bankCashAccountWhere(tx, organizationId)],
        },
        select: { id: true },
      });
      if (!paidThrough) {
        throw new BadRequestException(
          'Paid-through account must be an active bank or cash account of this organization',
        );
      }
      if (dto.vendorId) {
        const vendor = await tx.vendor.findFirst({
          where: { id: dto.vendorId, organizationId, deletedAt: null },
          select: { id: true },
        });
        if (!vendor) throw new BadRequestException('Vendor not found');
      }
      if (dto.projectId) {
        const project = await tx.project.findFirst({
          where: { id: dto.projectId, organizationId },
          select: { id: true },
        });
        if (!project) throw new BadRequestException('Project not found');
      }

      const vatAccountId = posting ? await this.vatAccountFor(tx, organizationId, taxAmount) : null;

      const expense = await tx.expense.create({
        data: {
          date,
          accountId: dto.accountId,
          vendorId: dto.vendorId,
          amount: net,
          taxAmount,
          taxInclusive,
          paidThroughAccountId: dto.paidThroughAccountId,
          description: dto.description,
          reference: dto.reference,
          projectId: dto.projectId,
          status: posting ? ExpenseStatus.POSTED : ExpenseStatus.PENDING,
          organizationId,
        },
        include: EXPENSE_VIEW_INCLUDE,
      });

      if (posting) await this.postJournal(tx, organizationId, expense, vatAccountId);
      return expense;
    };

    return options.tx ? run(options.tx) : this.prisma.$transaction(run);
  }

  /** The VAT Receivable account when the expense carries VAT (rejects when unconfigured). */
  private async vatAccountFor(
    tx: Prisma.TransactionClient,
    organizationId: string,
    taxAmount: Decimal,
  ): Promise<string | null> {
    if (!taxAmount.greaterThan(0)) return null;
    const org = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { defaultVatReceivableAccountId: true },
    });
    if (!org?.defaultVatReceivableAccountId) {
      throw new BadRequestException(
        'Please configure the default VAT Receivable account in organization settings before recording taxed expenses',
      );
    }
    return org.defaultVatReceivableAccountId;
  }

  /** Dr expense (net) / Dr VAT (tax) / Cr paid-through (gross), dated on the expense date. */
  private async postJournal(
    tx: Prisma.TransactionClient,
    organizationId: string,
    expense: {
      id: string;
      date: Date;
      accountId: string;
      paidThroughAccountId: string;
      description: string | null;
      amount: Decimal;
      taxAmount: Decimal;
    },
    vatAccountId: string | null,
  ): Promise<void> {
    const label = expense.description || 'General expense';
    const gross = expense.amount.add(expense.taxAmount);
    const lines = [
      {
        accountId: expense.accountId,
        debit: expense.amount.toFixed(4),
        credit: '0',
        description: `Expense - ${label}`,
      },
    ];
    if (expense.taxAmount.greaterThan(0)) {
      lines.push({
        accountId: vatAccountId as string,
        debit: expense.taxAmount.toFixed(4),
        credit: '0',
        description: 'Expense - VAT Receivable',
      });
    }
    lines.push({
      accountId: expense.paidThroughAccountId,
      debit: '0',
      credit: gross.toFixed(4),
      description: 'Expense - Payment',
    });
    await this.journalsService.create(
      organizationId,
      {
        date: expense.date.toISOString(),
        reference: `Expense ${expense.id.slice(-6)}`,
        notes: `Expense entry - ${label}`,
        lines,
      },
      { tx, source: { type: JournalSourceType.EXPENSE, id: expense.id } },
    );
  }

  /**
   * Posts a PENDING expense (guarded PENDING -> POSTED) through the same journal as create().
   * Lock order: expense -> ledger.
   */
  async post(organizationId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "expenses" WHERE id = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`;
      const expense = await tx.expense.findFirst({
        where: { id, organizationId, deletedAt: null },
      });
      if (!expense) throw new NotFoundException('Expense not found');
      if (expense.status !== ExpenseStatus.PENDING) {
        throw new BadRequestException('Only pending expenses can be posted');
      }

      await lockOrganizationLedger(tx, organizationId);
      const expenseAccount = await tx.account.findFirst({
        where: {
          id: expense.accountId,
          organizationId,
          deletedAt: null,
          isActive: true,
          type: AccountType.EXPENSE,
        },
        select: { id: true },
      });
      if (!expenseAccount) {
        throw new BadRequestException('Expense account must be an active expense account');
      }
      const paidThrough = await tx.account.findFirst({
        where: {
          AND: [
            { id: expense.paidThroughAccountId },
            await bankCashAccountWhere(tx, organizationId),
          ],
        },
        select: { id: true },
      });
      if (!paidThrough) {
        throw new BadRequestException(
          'Paid-through account must be an active bank or cash account of this organization',
        );
      }
      const vatAccountId = await this.vatAccountFor(tx, organizationId, expense.taxAmount);

      const { count } = await tx.expense.updateMany({
        where: { id, organizationId, deletedAt: null, status: ExpenseStatus.PENDING },
        data: { status: ExpenseStatus.POSTED },
      });
      if (count === 0) throw new ConflictException('Expense was changed concurrently');

      await this.postJournal(tx, organizationId, expense, vatAccountId);
      return tx.expense.findUniqueOrThrow({ where: { id }, include: EXPENSE_VIEW_INCLUDE });
    });
  }

  /** Expense accounts for the expense form (purchases.create without accounting.view). */
  async expenseAccounts(organizationId: string): Promise<LookupAccount[]> {
    return this.prisma.account.findMany({
      where: { organizationId, deletedAt: null, isActive: true, type: AccountType.EXPENSE },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }

  /** Bank/cash accounts an expense can be paid from; same rule create() enforces. */
  async paidThroughAccounts(organizationId: string): Promise<LookupAccount[]> {
    return this.prisma.account.findMany({
      where: await bankCashAccountWhere(this.prisma, organizationId),
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }

  async findAll(organizationId: string, query: ExpenseQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'date',
      sortOrder = 'desc',
      vendorId,
      accountId,
      dateFrom,
      dateTo,
    } = query;
    const where: {
      organizationId: string;
      deletedAt: null;
      vendorId?: string;
      accountId?: string;
      date?: { gte?: Date; lte?: Date };
    } = { organizationId, deletedAt: null };
    if (vendorId) where.vendorId = vendorId;
    if (accountId) where.accountId = accountId;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }
    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: EXPENSE_VIEW_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);
    return { data: expenses, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findAllCursor(organizationId: string, query: CursorPaginationDto) {
    const { cursor, take = 50, sortBy = 'date', sortOrder = 'desc' } = query;
    const where = { organizationId, deletedAt: null };
    return cursorPaginate(
      this.prisma.expense,
      where,
      { [sortBy]: sortOrder },
      { cursor, take, include: EXPENSE_VIEW_INCLUDE },
    );
  }

  async findOne(organizationId: string, id: string) {
    // Voided expenses stay readable (with deletedAt set) so journal source links resolve.
    const expense = await this.prisma.expense.findFirst({
      where: { id, organizationId },
      include: { account: true, vendor: true, paidThroughAccount: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  /**
   * Voids an expense: soft-deletes it and posts a linked reversal of its journal. History is
   * never rewritten, and posted expenses are not editable (void and re-enter instead).
   */
  async remove(organizationId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      // Lock order: expense -> ledger (the reversal takes the ledger lock).
      await tx.$queryRaw`SELECT id FROM "expenses" WHERE id = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`;
      const expense = await tx.expense.findFirst({
        where: { id, organizationId, deletedAt: null },
        select: { id: true, status: true },
      });
      if (!expense) throw new NotFoundException('Expense not found');

      const { count } = await tx.expense.updateMany({
        where: { id, organizationId, deletedAt: null },
        data: { deletedAt: new Date(), status: ExpenseStatus.CANCELLED },
      });
      if (count === 0) throw new NotFoundException('Expense not found');
      // A pending expense was never posted: there is nothing to reverse.
      if (expense.status === ExpenseStatus.PENDING) {
        return { message: 'Expense voided successfully' };
      }

      const journal = await tx.journal.findFirst({
        where: {
          organizationId,
          sourceType: JournalSourceType.EXPENSE,
          sourceId: id,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!journal) {
        // Legacy expenses (created before journals were source-linked) cannot be voided safely.
        throw new BadRequestException(
          'This expense has no linked ledger entry; reverse its journal manually before voiding',
        );
      }
      await this.journalsService.reverse(organizationId, journal.id, undefined, {
        tx,
        source: { type: JournalSourceType.EXPENSE_VOID, id },
      });
      return { message: 'Expense voided successfully' };
    });
  }

  // === Bulk Operations — same command as the single-record route ===

  bulkDelete(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.remove(organizationId, id));
  }

  /**
   * Re-categorising a posted expense would move its posted amount between accounts without a
   * journal, so it is rejected per record: void the expense and enter it again instead.
   */
  bulkCategorize(
    organizationId: string,
    ids: string[],
    _accountId: string,
  ): Promise<BulkResultDto> {
    return runBulk(ids, async (id) => {
      const expense = await this.prisma.expense.findFirst({
        where: { id, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!expense) throw new NotFoundException('Expense not found');
      throw new BadRequestException(
        'Posted expenses cannot be re-categorised; void the expense and enter it again',
      );
    });
  }

  /** Posts each pending expense through the same command as POST /expenses/:id/post. */
  bulkApprove(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.post(organizationId, id));
  }
}
