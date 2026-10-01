import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BulkResultDto } from '../../../common/dto/bulk-result.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { lockOrganizationLedger } from '../../../common/utils/ledger-lock';
import { runBulk } from '../../../common/utils/run-bulk';
import { PrismaService } from '../../../prisma/prisma.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import { CreateJournalDto } from '../dto/create-journal.dto';
import { JournalCursorQueryDto } from '../dto/journal-cursor-query.dto';
import { JournalQueryDto } from '../dto/journal-query.dto';
import { UpdateJournalDto } from '../dto/update-journal.dto';

/** Business events that generate journals. Unique per (organization, type, id). */
export enum JournalSourceType {
  BILL_APPROVAL = 'BILL_APPROVAL',
  PAYMENT_MADE = 'PAYMENT_MADE',
  PAYMENT_MADE_VOID = 'PAYMENT_MADE_VOID',
  INVOICE_SEND = 'INVOICE_SEND',
  INVOICE_VOID = 'INVOICE_VOID',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  PAYMENT_RECEIVED_VOID = 'PAYMENT_RECEIVED_VOID',
  CREDIT_NOTE = 'CREDIT_NOTE',
  EXPENSE = 'EXPENSE',
  VENDOR_CREDIT = 'VENDOR_CREDIT',
  VAT_RETURN = 'VAT_RETURN',
  INVENTORY_ADJUSTMENT = 'INVENTORY_ADJUSTMENT',
  OPENING_BALANCE = 'OPENING_BALANCE',
}

export interface JournalSource {
  type: JournalSourceType;
  id: string;
}

export interface CreateJournalOptions {
  /** Run inside the caller's transaction so the journal commits/rolls back with it. */
  tx?: Prisma.TransactionClient;
  /** Links the journal to the business event that produced it (idempotency). */
  source?: JournalSource;
}

type JournalLineInput = CreateJournalDto['lines'][number];

const JOURNAL_INCLUDE = {
  lines: {
    include: {
      account: { select: { id: true, code: true, name: true, type: true } },
    },
  },
  // Lets clients see that a journal was already reversed (and link to the reversal).
  reversedBy: { select: { id: true, journalNumber: true } },
} satisfies Prisma.JournalInclude;

type JournalWithLines = Prisma.JournalGetPayload<{ include: typeof JOURNAL_INCLUDE }>;

function parseAmount(value: string | undefined, field: string): Decimal {
  if (value === undefined || value === null || value === '') return new Decimal(0);
  let amount: Decimal;
  try {
    amount = new Decimal(value);
  } catch {
    throw new BadRequestException(`${field} must be a valid decimal number`);
  }
  if (!amount.isFinite() || amount.isNegative()) {
    throw new BadRequestException(`${field} must be a non-negative decimal number`);
  }
  return amount;
}

function withTotals<T extends { lines: { debit: Decimal; credit: Decimal }[] }>(
  journal: T,
): T & { totalDebit: string; totalCredit: string } {
  const totalDebit = journal.lines.reduce((s, l) => s.add(l.debit), new Decimal(0));
  const totalCredit = journal.lines.reduce((s, l) => s.add(l.credit), new Decimal(0));
  return { ...journal, totalDebit: totalDebit.toFixed(4), totalCredit: totalCredit.toFixed(4) };
}

@Injectable()
export class JournalsService {
  constructor(
    private prisma: PrismaService,
    private organizationsService: OrganizationsService,
  ) {}

  /**
   * The single ledger command. Every manual, imported, bulk or automated posting goes through
   * here so balance, tenant, lock-date and idempotency rules are enforced in one place.
   */
  async create(
    organizationId: string,
    dto: CreateJournalDto,
    options: CreateJournalOptions = {},
  ): Promise<JournalWithLines & { totalDebit: string; totalCredit: string }> {
    const date = new Date(dto.date);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid journal date');

    await this.checkLockDate(organizationId, date);
    const lines = this.validateLines(dto.lines);

    const run = async (tx: Prisma.TransactionClient): Promise<JournalWithLines> => {
      await this.assertAccountsBelongToOrg(tx, organizationId, lines);
      await this.lockJournalSequence(tx, organizationId);
      const journalNumber = await this.nextJournalNumber(tx, organizationId);
      try {
        return await tx.journal.create({
          data: {
            journalNumber,
            date,
            reference: dto.reference,
            notes: dto.notes,
            organizationId,
            sourceType: options.source?.type,
            sourceId: options.source?.id,
            lines: {
              create: lines.map((line) => ({
                accountId: line.accountId,
                debit: line.debit,
                credit: line.credit,
                description: line.description,
              })),
            },
          },
          include: JOURNAL_INCLUDE,
        });
      } catch (error) {
        if (
          options.source &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException('This transaction has already been posted');
        }
        throw error;
      }
    };

    const journal = options.tx ? await run(options.tx) : await this.prisma.$transaction(run);
    return withTotals(journal);
  }

  async findAll(organizationId: string, query: JournalQueryDto) {
    const {
      page = 1,
      limit = 20,
      search,
      sortBy = 'date',
      sortOrder = 'desc',
      dateFrom,
      dateTo,
    } = query;

    const where: Prisma.JournalWhereInput = { organizationId, deletedAt: null };

    if (search) {
      where.OR = [
        { journalNumber: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const [journals, total] = await Promise.all([
      this.prisma.journal.findMany({
        where,
        include: JOURNAL_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.journal.count({ where }),
    ]);

    return {
      data: journals.map((j) => withTotals(j)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private static readonly ALLOWED_SORT_FIELDS = [
    'id',
    'journalNumber',
    'date',
    'createdAt',
    'updatedAt',
    'isPosted',
  ];

  async findAllCursor(organizationId: string, query: JournalCursorQueryDto) {
    const { cursor, take, search, sortOrder = 'desc', dateFrom, dateTo } = query;
    const sortBy = JournalsService.ALLOWED_SORT_FIELDS.includes(query.sortBy || '')
      ? query.sortBy!
      : 'date';
    const where: Prisma.JournalWhereInput = { organizationId, deletedAt: null };
    if (search) {
      where.OR = [
        { journalNumber: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }
    return cursorPaginate(
      this.prisma.journal,
      where,
      { [sortBy]: sortOrder },
      { cursor, take, include: JOURNAL_INCLUDE },
    );
  }

  async findOne(organizationId: string, id: string) {
    const journal = await this.prisma.journal.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: JOURNAL_INCLUDE,
    });
    if (!journal) throw new NotFoundException('Journal not found');
    return withTotals(journal);
  }

  /** Only unposted, manually created journals may be edited. Posted history is immutable. */
  async update(organizationId: string, id: string, dto: UpdateJournalDto) {
    const journal = await this.prisma.journal.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!journal) throw new NotFoundException('Journal not found');
    this.assertEditable(journal);

    await this.checkLockDate(organizationId, journal.date);
    if (dto.date) await this.checkLockDate(organizationId, new Date(dto.date));

    const lines = dto.lines ? this.validateLines(dto.lines) : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (lines) {
        await this.assertAccountsBelongToOrg(tx, organizationId, lines);
        await tx.journalLine.deleteMany({ where: { journalId: id } });
      }
      return tx.journal.update({
        where: { id },
        data: {
          date: dto.date ? new Date(dto.date) : undefined,
          reference: dto.reference,
          notes: dto.notes,
          ...(lines && {
            lines: {
              create: lines.map((line) => ({
                accountId: line.accountId,
                debit: line.debit,
                credit: line.credit,
                description: line.description,
              })),
            },
          }),
        },
        include: JOURNAL_INCLUDE,
      });
    });

    return withTotals(updated);
  }

  /** Only unposted, manually created journals may be deleted. Posted ones must be reversed. */
  async remove(organizationId: string, id: string) {
    const journal = await this.prisma.journal.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!journal) throw new NotFoundException('Journal not found');
    this.assertEditable(journal);
    await this.checkLockDate(organizationId, journal.date);

    await this.prisma.journal.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Journal deleted successfully' };
  }

  /** Creates a linked, posted reversal. The original is never modified. */
  async reverse(
    organizationId: string,
    id: string,
    dto?: { date?: string },
    options: CreateJournalOptions = {},
  ) {
    const run = async (tx: Prisma.TransactionClient) => {
      const journal = await tx.journal.findFirst({
        where: { id, organizationId, deletedAt: null },
        include: { lines: true, reversedBy: true },
      });
      if (!journal) throw new NotFoundException('Journal not found');
      if (!journal.isPosted) {
        throw new BadRequestException('Only posted journals can be reversed; delete drafts');
      }
      if (journal.reversedBy) {
        throw new BadRequestException('This journal has already been reversed');
      }
      if (journal.reversalOfId) {
        throw new BadRequestException('Cannot reverse a reversal journal');
      }
      // A system journal belongs to its source document (bill, payment...). Reversing it
      // directly would leave the document and the ledger out of sync.
      if (journal.sourceType && !options.source) {
        throw new BadRequestException(
          'System-generated journals are reversed by voiding their source document',
        );
      }

      const reversalDate = dto?.date ? new Date(dto.date) : new Date();
      await this.checkLockDate(organizationId, reversalDate);

      await this.lockJournalSequence(tx, organizationId);
      const journalNumber = await this.nextJournalNumber(tx, organizationId);
      return tx.journal.create({
        data: {
          journalNumber,
          date: reversalDate,
          reference: `REV-${journal.journalNumber}`,
          notes: `Reversal of ${journal.journalNumber}`,
          isPosted: true,
          reversalOfId: journal.id,
          organizationId,
          sourceType: options.source?.type,
          sourceId: options.source?.id,
          lines: {
            create: journal.lines.map((line) => ({
              accountId: line.accountId,
              debit: line.credit,
              credit: line.debit,
              description: `Reversal: ${line.description || ''}`.trim(),
            })),
          },
        },
        include: JOURNAL_INCLUDE,
      });
    };

    const reversal = options.tx ? await run(options.tx) : await this.prisma.$transaction(run);
    return withTotals(reversal);
  }

  async post(organizationId: string, id: string) {
    const journal = await this.prisma.journal.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!journal) throw new NotFoundException('Journal not found');
    if (journal.isPosted) throw new BadRequestException('Journal is already posted');
    await this.checkLockDate(organizationId, journal.date);

    // Guarded update: a concurrent post cannot flip it twice.
    const { count } = await this.prisma.journal.updateMany({
      where: { id, organizationId, isPosted: false, deletedAt: null },
      data: { isPosted: true },
    });
    if (count === 0) throw new BadRequestException('Journal is already posted');

    return this.findOne(organizationId, id);
  }

  // === Bulk Operations — reuse the single-record commands, return per-record outcomes ===

  bulkDelete(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.remove(organizationId, id));
  }

  bulkPost(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.post(organizationId, id));
  }

  // === Helpers ===

  private assertEditable(journal: { isPosted: boolean; sourceType: string | null }): void {
    if (journal.isPosted) {
      throw new BadRequestException(
        'Posted journals cannot be edited or deleted; create a reversal instead',
      );
    }
    if (journal.sourceType) {
      throw new BadRequestException(
        'System-generated journals cannot be edited; correct the source document instead',
      );
    }
  }

  private validateLines(
    lines: JournalLineInput[],
  ): { accountId: string; debit: Decimal; credit: Decimal; description?: string }[] {
    if (!lines || lines.length < 2) {
      throw new BadRequestException('A journal needs at least two lines');
    }
    const parsed = lines.map((line, i) => {
      const debit = parseAmount(line.debit, `lines[${i}].debit`);
      const credit = parseAmount(line.credit, `lines[${i}].credit`);
      if (debit.isZero() === credit.isZero()) {
        throw new BadRequestException(
          `lines[${i}] must have either a debit or a credit amount (not both)`,
        );
      }
      return { accountId: line.accountId, debit, credit, description: line.description };
    });

    const totalDebit = parsed.reduce((s, l) => s.add(l.debit), new Decimal(0));
    const totalCredit = parsed.reduce((s, l) => s.add(l.credit), new Decimal(0));
    if (!totalDebit.equals(totalCredit)) {
      throw new BadRequestException('Total debits must equal total credits');
    }
    return parsed;
  }

  private async assertAccountsBelongToOrg(
    tx: Prisma.TransactionClient,
    organizationId: string,
    lines: { accountId: string }[],
  ): Promise<void> {
    // Distinct ids: two lines may legitimately use the same account.
    const accountIds = [...new Set(lines.map((l) => l.accountId))];
    const accounts = await tx.account.findMany({
      where: { id: { in: accountIds }, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (accounts.length !== accountIds.length) {
      throw new BadRequestException('One or more accounts not found');
    }
  }

  /** Serializes journal numbering per organization for the life of the transaction. */
  private async lockJournalSequence(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<void> {
    await lockOrganizationLedger(tx, organizationId);
  }

  private async nextJournalNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<string> {
    const rows = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(CAST(SUBSTRING("journalNumber" FROM '^JRN-([0-9]+)$') AS INTEGER)) AS max
      FROM "journals" WHERE "organizationId" = ${organizationId}`;
    const last = Number(rows?.[0]?.max ?? 0);
    return `JRN-${String(last + 1).padStart(3, '0')}`;
  }

  private async checkLockDate(organizationId: string, transactionDate: Date): Promise<void> {
    const lockDate = await this.organizationsService.getLockDate(organizationId);
    if (lockDate && transactionDate <= lockDate) {
      throw new BadRequestException(
        `This period is locked. Transactions on or before ${lockDate.toISOString().split('T')[0]} cannot be modified.`,
      );
    }
  }
}
