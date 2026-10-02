import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalSourceType, JournalsService } from './journals.service';
import { CreateRecurringProfileDto } from '../dto/create-recurring-profile.dto';
import { RecurringProfileQueryDto } from '../dto/recurring-profile-query.dto';
import { UpdateRecurringProfileDto } from '../dto/update-recurring-profile.dto';
import { RecurringFrequency, RecurringType, Prisma, RecurringProfile } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { CreateInvoiceDto } from '../../sales/dto/create-invoice.dto';
import { InvoicesService } from '../../sales/services/invoices.service';
import { CreateBillDto } from '../../purchases/dto/create-bill.dto';
import { CreateExpenseDto } from '../../purchases/dto/create-expense.dto';
import { BillsService } from '../../purchases/services/bills.service';
import { ExpensesService } from '../../purchases/services/expenses.service';
import { describeError } from '../../../common/utils/redact';

/** Shared shape for a single line in journal/invoice/bill templates */
interface JournalTemplateLine {
  accountId: string;
  debit?: number | string;
  credit?: number | string;
  description?: string;
}

interface InvoiceTemplateLine {
  itemId?: string | null;
  description: string;
  quantity?: number | string;
  rate?: number | string;
  discount?: number | string;
  taxRate?: number | string;
}

interface BillTemplateLine {
  itemId?: string | null;
  accountId?: string | null;
  description: string;
  quantity?: number | string;
  rate?: number | string;
  taxRate?: number | string;
}

interface JournalTemplateData {
  notes?: string;
  lines: JournalTemplateLine[];
}

interface InvoiceTemplateData {
  customerId: string;
  notes?: string;
  terms?: string;
  shippingAmount?: number | string;
  lines: InvoiceTemplateLine[];
}

interface BillTemplateData {
  vendorId: string;
  notes?: string;
  lines: BillTemplateLine[];
}

interface ExpenseTemplateData {
  vendorId?: string;
  accountId: string;
  paidThroughAccountId: string;
  amount: number | string;
  /** VAT percentage (14 => 14%). */
  taxRate?: number | string;
  taxInclusive?: boolean;
  /** Legacy templates stored a VAT amount; it is converted to a percentage of the amount. */
  taxAmount?: number | string;
  description?: string;
}

export interface ExecutionResult {
  success: boolean;
  createdEntityType: string;
  createdEntityId: string;
  error?: string;
}

/** Upper bound of missed scheduled runs one profile may catch up on in a single cron pass. */
const MAX_CATCH_UP_RUNS = 12;

/** UTC calendar day (YYYY-MM-DD) of a scheduled run: the idempotency key of that run. */
/** First instant after the end date's whole (UTC) day. */
function endOfEndDay(endDate: Date): Date {
  return new Date(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate() + 1),
  );
}

/** An occurrence is past the end when it falls after the end date's last day (inclusive). */
function isPastEnd(occurrence: Date, endDate: Date | null): boolean {
  return endDate !== null && occurrence >= endOfEndDay(endDate);
}

function runDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toLedgerDecimal(value: unknown, field: string): Decimal {
  if (value === undefined || value === null || value === '') return new Decimal(0);
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new BadRequestException(`${field} must be a decimal amount`);
  }
  let amount: Decimal;
  try {
    // Numbers in stored templates are converted through their decimal text, never arithmetic.
    amount = new Decimal(typeof value === 'number' ? value.toString() : value);
  } catch {
    throw new BadRequestException(`${field} must be a valid decimal amount`);
  }
  if (!amount.isFinite() || amount.isNegative()) {
    throw new BadRequestException(`${field} must be a non-negative decimal amount`);
  }
  return amount;
}

@Injectable()
export class RecurringProfilesService {
  private readonly logger = new Logger(RecurringProfilesService.name);

  constructor(
    private prisma: PrismaService,
    private journalsService: JournalsService,
    // Resolved lazily: the sales and purchases modules import AccountingModule, so injecting
    // their services directly would create a module cycle.
    private moduleRef: ModuleRef,
  ) {}

  async create(organizationId: string, createRecurringProfileDto: CreateRecurringProfileDto) {
    const {
      name,
      frequency,
      startDate,
      endDate,
      autoPost,
      autoSend,
      templateData,
      entityType,
      type,
    } = createRecurringProfileDto;

    const nextRunDate = this.calculateNextRunDate(new Date(startDate), frequency);

    // Map the type string to RecurringType enum if provided
    const mappedType = type
      ? this.mapEntityTypeToRecurringType(type)
      : this.mapEntityTypeToRecurringType(entityType);

    // A journal template that can never post must fail now, not every night.
    if (mappedType === RecurringType.JOURNAL) {
      await this.assertValidJournalTemplate(organizationId, templateData);
    }

    const profile = await this.prisma.recurringProfile.create({
      data: {
        name,
        frequency,
        type: mappedType,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        nextRunDate,
        autoPost: autoPost || false,
        autoSend: autoSend || false,
        templateData: templateData as Prisma.InputJsonValue,
        entityType,
        organizationId,
      },
      include: {
        executions: {
          orderBy: { executedAt: 'desc' },
          take: 5,
        },
      },
    });

    return profile;
  }

  private mapEntityTypeToRecurringType(entityType: string): RecurringType | null {
    const mapping: Record<string, RecurringType> = {
      journal: RecurringType.JOURNAL,
      invoice: RecurringType.INVOICE,
      bill: RecurringType.BILL,
      expense: RecurringType.EXPENSE,
    };
    return mapping[entityType.toLowerCase()] || null;
  }

  private static readonly ALLOWED_SORT_FIELDS = [
    'name',
    'frequency',
    'nextRunDate',
    'createdAt',
    'updatedAt',
    'isActive',
    'executionCount',
  ];

  async findAll(organizationId: string, query: RecurringProfileQueryDto) {
    const { page = 1, limit = 20, search, sortOrder = 'asc', isActive, type } = query;
    const sortBy = RecurringProfilesService.ALLOWED_SORT_FIELDS.includes(query.sortBy || '')
      ? query.sortBy!
      : 'nextRunDate';

    const where: Prisma.RecurringProfileWhereInput = { organizationId, deletedAt: null };
    if (isActive !== undefined) where.isActive = isActive;
    if (type) where.type = type as RecurringType;

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { entityType: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [profiles, total] = await Promise.all([
      this.prisma.recurringProfile.findMany({
        where,
        include: {
          executions: {
            orderBy: { executedAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.recurringProfile.count({ where }),
    ]);

    return {
      data: profiles,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(organizationId: string, id: string) {
    const profile = await this.prisma.recurringProfile.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        executions: {
          orderBy: { executedAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Recurring profile not found');
    }

    return profile;
  }

  async getExecutionHistory(organizationId: string, profileId: string, limit: number = 50) {
    const profile = await this.prisma.recurringProfile.findFirst({
      where: { id: profileId, organizationId, deletedAt: null },
    });

    if (!profile) {
      throw new NotFoundException('Recurring profile not found');
    }

    return this.prisma.recurringExecution.findMany({
      where: { profileId },
      orderBy: { executedAt: 'desc' },
      take: limit,
    });
  }

  async update(
    organizationId: string,
    id: string,
    updateRecurringProfileDto: UpdateRecurringProfileDto,
  ) {
    const profile = await this.prisma.recurringProfile.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!profile) {
      throw new NotFoundException('Recurring profile not found');
    }

    // Recalculate next run date if frequency changes
    let nextRunDate = profile.nextRunDate;
    if (
      updateRecurringProfileDto.frequency &&
      updateRecurringProfileDto.frequency !== profile.frequency
    ) {
      nextRunDate = this.calculateNextRunDate(new Date(), updateRecurringProfileDto.frequency);
    }

    // Build update data, excluding type and entityType which need special handling
    const { type, entityType, ...restDto } = updateRecurringProfileDto;

    // Map the type string to RecurringType enum if provided
    const mappedType = type
      ? this.mapEntityTypeToRecurringType(type)
      : entityType
        ? this.mapEntityTypeToRecurringType(entityType)
        : undefined;

    // Whenever the resulting profile is a journal profile (changed or unchanged type), the
    // effective template (new or retained) must be a valid journal template.
    const effectiveType =
      mappedType ?? profile.type ?? this.mapEntityTypeToRecurringType(profile.entityType ?? '');
    if (effectiveType === RecurringType.JOURNAL) {
      await this.assertValidJournalTemplate(
        organizationId,
        restDto.templateData ?? (profile.templateData as Record<string, unknown>),
      );
    }

    // Build update payload, converting templateData to Prisma-compatible type
    const updateData: Prisma.RecurringProfileUpdateInput = {
      ...(restDto.name !== undefined && { name: restDto.name }),
      ...(restDto.frequency !== undefined && { frequency: restDto.frequency }),
      ...(restDto.autoPost !== undefined && { autoPost: restDto.autoPost }),
      ...(restDto.autoSend !== undefined && { autoSend: restDto.autoSend }),
      ...(restDto.templateData !== undefined && {
        templateData: restDto.templateData as Prisma.InputJsonValue,
      }),
      ...(mappedType !== undefined && { type: mappedType }),
      ...(entityType !== undefined && { entityType }),
      nextRunDate,
      startDate: updateRecurringProfileDto.startDate
        ? new Date(updateRecurringProfileDto.startDate)
        : undefined,
      endDate: updateRecurringProfileDto.endDate
        ? new Date(updateRecurringProfileDto.endDate)
        : undefined,
    };
    const updatedProfile = await this.prisma.recurringProfile.update({
      where: { id },
      data: updateData,
    });

    return updatedProfile;
  }

  async toggle(organizationId: string, id: string) {
    const profile = await this.prisma.recurringProfile.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!profile) {
      throw new NotFoundException('Recurring profile not found');
    }

    const updatedProfile = await this.prisma.recurringProfile.update({
      where: { id },
      data: { isActive: !profile.isActive },
    });

    return updatedProfile;
  }

  async remove(organizationId: string, id: string) {
    const profile = await this.prisma.recurringProfile.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!profile) {
      throw new NotFoundException('Recurring profile not found');
    }

    await this.prisma.recurringProfile.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Recurring profile deleted successfully' };
  }

  /**
   * Runs every due profile. Journal profiles are idempotent per scheduled run (see
   * executeJournalProfile) and catch up on missed runs oldest-first, stopping at the first
   * failure. The other types keep their original one-run-per-night behavior.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processRecurringProfiles(): Promise<void> {
    const now = new Date();

    // Due means nextRunDate <= now. The end date is inclusive of its whole day and only limits
    // which occurrences may run (nextRunDate before the end of the end date), so missed runs are
    // still caught up after the end date has passed.
    const due = await this.prisma.recurringProfile.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        nextRunDate: { lte: now },
      },
    });
    const profiles = due.filter((p) => !isPastEnd(p.nextRunDate, p.endDate));

    for (const profile of profiles) {
      try {
        if (this.isJournalProfile(profile)) {
          await this.catchUpJournalProfile(profile, now);
          continue;
        }

        // Advances nextRunDate in the same transaction as the document it creates; a failed
        // run is recorded and retried on the next pass instead of silently skipping the date.
        await this.executeRecurringProfile(profile);
      } catch (error) {
        this.logger.error(
          `Failed to process recurring profile ${profile.id}: ${describeError(error)}`,
        );
      }
    }
  }

  private isJournalProfile(profile: RecurringProfile): boolean {
    return (profile.type ?? profile.entityType ?? '').toLowerCase() === 'journal';
  }

  /** Executes each due occurrence of a journal profile, oldest first, until one fails. */
  private async catchUpJournalProfile(profile: RecurringProfile, asOf: Date): Promise<void> {
    let current: RecurringProfile = profile;
    for (let run = 0; run < MAX_CATCH_UP_RUNS; run++) {
      if (current.nextRunDate > asOf) return;
      if (isPastEnd(current.nextRunDate, current.endDate)) return;
      const result = await this.executeJournalProfile(current);
      if (!result.success) return;
      const refreshed = await this.prisma.recurringProfile.findFirst({
        where: { id: profile.id, organizationId: profile.organizationId, deletedAt: null },
      });
      if (!refreshed || !refreshed.isActive) return;
      current = refreshed;
    }
  }

  async executeProfile(
    organizationId: string,
    profileId: string,
    idempotencyKey: string,
  ): Promise<ExecutionResult> {
    const profile = await this.findOne(organizationId, profileId);
    // A manual run of a journal profile is its own explicit event, identified by the caller's
    // idempotency key (see executeJournalProfile).
    if (this.isJournalProfile(profile)) return this.executeJournalProfile(profile, idempotencyKey);
    return this.executeRecurringProfile(profile, idempotencyKey);
  }

  /**
   * Executes an invoice, bill or expense profile through the real domain commands, as one
   * transaction: guarded advance of nextRunDate (scheduled runs), the document (INVOICE and BILL
   * as DRAFT, EXPENSE posts its journal), the execution record. The occurrence key
   * `${profileId}:${YYYY-MM-DD}` (`${profileId}:manual:${key}` for a manual run) is the
   * idempotency marker: it is the nextRunDate transition and is also written into the document
   * (bill/expense reference, invoice notes) so a duplicate cron pass or a retried manual request
   * returns the document already created instead of creating another.
   */
  private async executeRecurringProfile(
    profile: RecurringProfile,
    manualKey?: string,
  ): Promise<ExecutionResult> {
    if (this.isJournalProfile(profile)) return this.executeJournalProfile(profile, manualKey);

    const manual = manualKey !== undefined;
    const entityType: string = profile.type || profile.entityType || '';
    const createdEntityType: string = entityType;
    const occurrence = manual ? new Date() : profile.nextRunDate;
    const sourceId = manual
      ? `${profile.id}:manual:${manualKey}`
      : `${profile.id}:${runDay(occurrence)}`;
    const next = this.calculateNextRunDate(
      profile.nextRunDate,
      profile.frequency,
      profile.startDate,
    );

    try {
      const kind = entityType.toLowerCase();
      if (kind !== 'invoice' && kind !== 'bill' && kind !== 'expense') {
        throw new BadRequestException(`Unsupported recurring type: ${entityType}`);
      }
      if (!manual && isPastEnd(occurrence, profile.endDate)) {
        throw new BadRequestException('This recurring profile has passed its end date');
      }
      const templateData = profile.templateData as Record<string, unknown>;

      const createdEntityId = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`recurring:${sourceId}`}))`;

        const existing = await this.findOccurrenceDocument(
          tx,
          profile.organizationId,
          kind,
          sourceId,
        );
        if (existing) return existing;

        if (!manual) {
          const { count } = await tx.recurringProfile.updateMany({
            where: {
              id: profile.id,
              organizationId: profile.organizationId,
              deletedAt: null,
              nextRunDate: occurrence,
            },
            data: { nextRunDate: next },
          });
          if (count === 0) throw new ConflictException('This scheduled run was already executed');
        }

        let id: string;
        if (kind === 'invoice') {
          id = await this.createInvoiceFromTemplate(
            tx,
            profile,
            templateData as unknown as InvoiceTemplateData,
            occurrence,
            sourceId,
          );
        } else if (kind === 'bill') {
          id = await this.createBillFromTemplate(
            tx,
            profile,
            templateData as unknown as BillTemplateData,
            occurrence,
            sourceId,
          );
        } else {
          id = await this.createExpenseFromTemplate(
            tx,
            profile,
            templateData as unknown as ExpenseTemplateData,
            occurrence,
            sourceId,
          );
        }

        await tx.recurringProfile.updateMany({
          where: { id: profile.id, organizationId: profile.organizationId },
          data: { executionCount: { increment: 1 }, lastExecutedAt: new Date() },
        });
        await tx.recurringExecution.create({
          data: {
            profileId: profile.id,
            createdEntityType,
            createdEntityId: id,
            status: 'success',
            organizationId: profile.organizationId,
          },
        });
        return id;
      });

      return { success: true, createdEntityType, createdEntityId };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // An already-executed run is not a failure of the schedule; everything else is recorded.
      if (!(error instanceof ConflictException)) {
        await this.prisma.recurringExecution.create({
          data: {
            profileId: profile.id,
            createdEntityType,
            createdEntityId: '',
            status: 'failed',
            error: errorMessage,
            organizationId: profile.organizationId,
          },
        });
      }
      return { success: false, createdEntityType, createdEntityId: '', error: errorMessage };
    }
  }

  private occurrenceMarker(sourceId: string): string {
    return `[recurring ${sourceId}]`;
  }

  /** The document an earlier run of this occurrence already created, if any. */
  private async findOccurrenceDocument(
    tx: Prisma.TransactionClient,
    organizationId: string,
    kind: 'invoice' | 'bill' | 'expense',
    sourceId: string,
  ): Promise<string | null> {
    const marker = this.occurrenceMarker(sourceId);
    if (kind === 'invoice') {
      const found = await tx.invoice.findFirst({
        where: { organizationId, notes: { contains: marker } },
        select: { id: true },
      });
      return found?.id ?? null;
    }
    const reference = { contains: marker };
    if (kind === 'bill') {
      const found = await tx.bill.findFirst({
        where: { organizationId, reference },
        select: { id: true },
      });
      return found?.id ?? null;
    }
    const found = await tx.expense.findFirst({
      where: { organizationId, reference },
      select: { id: true },
    });
    return found?.id ?? null;
  }

  /**
   * Executes the profile's next scheduled run (nextRunDate) as one transaction:
   *
   *  1. guarded advance of nextRunDate (updateMany where nextRunDate is still this occurrence),
   *  2. the journal through JournalsService.create, source (RECURRING_JOURNAL, `${profileId}:${YYYY-MM-DD}`),
   *  3. the execution record.
   *
   * The journal is dated on the scheduled run date. A duplicate or concurrent run loses the
   * guard (or the source uniqueness) and posts nothing. autoPost=false keeps the entry as an
   * unposted draft for review (it never reaches the ledger until posted).
   */
  private async executeJournalProfile(
    profile: RecurringProfile,
    manualKey?: string,
  ): Promise<ExecutionResult> {
    const manual = manualKey !== undefined;
    // A manual run is dated at execution time, never advances nextRunDate and never consumes a
    // scheduled run; each one is a separate event with its own source id.
    const occurrence = manual ? new Date() : profile.nextRunDate;
    const createdEntityType: string = profile.type || profile.entityType || '';
    const sourceId = manual
      ? `${profile.id}:manual:${manualKey}`
      : `${profile.id}:${runDay(occurrence)}`;
    const next = this.calculateNextRunDate(
      profile.nextRunDate,
      profile.frequency,
      profile.startDate,
    );

    // A retried manual request (same key) returns the journal it already posted.
    const replay = async (): Promise<ExecutionResult | null> => {
      const existing = await this.prisma.journal.findFirst({
        where: {
          organizationId: profile.organizationId,
          sourceType: JournalSourceType.RECURRING_JOURNAL,
          sourceId,
        },
        select: { id: true },
      });
      return existing ? { success: true, createdEntityType, createdEntityId: existing.id } : null;
    };
    if (manual) {
      const already = await replay();
      if (already) return already;
    }

    try {
      if (!manual && isPastEnd(occurrence, profile.endDate)) {
        throw new BadRequestException('This recurring profile has passed its end date');
      }
      const template = profile.templateData as unknown as JournalTemplateData;
      const lines = this.journalLinesFromTemplate(template);

      const journalId = await this.prisma.$transaction(async (tx) => {
        if (!manual) {
          const { count } = await tx.recurringProfile.updateMany({
            where: {
              id: profile.id,
              organizationId: profile.organizationId,
              deletedAt: null,
              nextRunDate: occurrence,
            },
            data: {
              nextRunDate: next,
              executionCount: { increment: 1 },
              lastExecutedAt: new Date(),
            },
          });
          if (count === 0) throw new ConflictException('This scheduled run was already executed');
        }

        const journal = await this.journalsService.create(
          profile.organizationId,
          {
            date: occurrence.toISOString(),
            reference: `Recurring: ${profile.name}`,
            notes: template.notes,
            lines,
          },
          { tx, source: { type: JournalSourceType.RECURRING_JOURNAL, id: sourceId } },
        );
        if (!profile.autoPost) {
          // Same transaction: the entry is never visible as posted to anyone else.
          await tx.journal.update({ where: { id: journal.id }, data: { isPosted: false } });
        }

        await tx.recurringExecution.create({
          data: {
            profileId: profile.id,
            createdEntityType,
            createdEntityId: journal.id,
            status: 'success',
            organizationId: profile.organizationId,
          },
        });
        return journal.id;
      });

      return { success: true, createdEntityType, createdEntityId: journalId };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (manual && error instanceof ConflictException) {
        // A concurrent request with the same key won the race: return its journal.
        const already = await replay();
        if (already) return already;
      }
      // An already-executed run is not a failure of the schedule; everything else is recorded.
      if (!(error instanceof ConflictException)) {
        await this.prisma.recurringExecution.create({
          data: {
            profileId: profile.id,
            createdEntityType,
            createdEntityId: '',
            status: 'failed',
            error: errorMessage,
            organizationId: profile.organizationId,
          },
        });
      }
      return { success: false, createdEntityType, createdEntityId: '', error: errorMessage };
    }
  }

  /** Template lines as ledger lines: exact decimal strings, no float arithmetic. */
  private journalLinesFromTemplate(
    template: JournalTemplateData,
  ): { accountId: string; debit: string; credit: string; description?: string }[] {
    if (!template || !Array.isArray(template.lines)) {
      throw new BadRequestException('Journal template has no lines');
    }
    return template.lines.map((line, i) => ({
      accountId: line.accountId,
      debit: toLedgerDecimal(line.debit, `lines[${i}].debit`).toFixed(4),
      credit: toLedgerDecimal(line.credit, `lines[${i}].credit`).toFixed(4),
      description: line.description,
    }));
  }

  /** A journal template must be balanced, have valid amounts and reference tenant accounts. */
  private async assertValidJournalTemplate(
    organizationId: string,
    templateData: Record<string, unknown>,
  ): Promise<void> {
    const template = templateData as unknown as JournalTemplateData;
    const lines = this.journalLinesFromTemplate(template);
    if (lines.length < 2) {
      throw new BadRequestException('A journal template needs at least two lines');
    }

    let debit = new Decimal(0);
    let credit = new Decimal(0);
    lines.forEach((line, i) => {
      const d = new Decimal(line.debit);
      const c = new Decimal(line.credit);
      if (d.isZero() === c.isZero()) {
        throw new BadRequestException(
          `lines[${i}] must have either a debit or a credit amount (not both)`,
        );
      }
      debit = debit.add(d);
      credit = credit.add(c);
    });
    if (!debit.equals(credit)) {
      throw new BadRequestException('Journal template debits must equal credits');
    }

    const accountIds = [...new Set(lines.map((l) => l.accountId))];
    const found = await this.prisma.account.count({
      where: { id: { in: accountIds }, organizationId, deletedAt: null },
    });
    if (found !== accountIds.length) {
      throw new BadRequestException('One or more accounts not found');
    }
  }

  private decimalText(value: unknown, field: string, fallback = '0'): string {
    if (value === undefined || value === null || value === '') return fallback;
    return toLedgerDecimal(value, field).toFixed();
  }

  private dueDateFrom(occurrence: Date, paymentTerms: number | null | undefined): Date {
    const due = new Date(occurrence);
    due.setUTCDate(due.getUTCDate() + (paymentTerms || 30));
    return due;
  }

  private async createInvoiceFromTemplate(
    tx: Prisma.TransactionClient,
    profile: RecurringProfile,
    templateData: InvoiceTemplateData,
    occurrence: Date,
    sourceId: string,
  ): Promise<string> {
    const customer = await tx.customer.findFirst({
      where: { id: templateData.customerId, organizationId: profile.organizationId },
    });
    if (!customer) {
      throw new NotFoundException(
        `Customer ${templateData.customerId} not found for this organization`,
      );
    }
    const dto: CreateInvoiceDto = {
      customerId: templateData.customerId,
      date: occurrence.toISOString(),
      dueDate: this.dueDateFrom(occurrence, customer.paymentTerms).toISOString(),
      shippingAmount: this.decimalText(templateData.shippingAmount, 'shippingAmount'),
      notes: [templateData.notes, this.occurrenceMarker(sourceId)].filter(Boolean).join('\n'),
      terms: templateData.terms,
      lines: templateData.lines.map((line, i) => ({
        itemId: line.itemId ?? undefined,
        description: line.description,
        quantity: this.decimalText(line.quantity, `lines[${i}].quantity`, '1'),
        rate: this.decimalText(line.rate, `lines[${i}].rate`),
        discount: this.decimalText(line.discount, `lines[${i}].discount`),
        taxRate: this.decimalText(line.taxRate, `lines[${i}].taxRate`),
      })),
    };
    // Always a DRAFT: sending/approving is the accountant's explicit posting step.
    const invoice = await this.moduleRef
      .get(InvoicesService, { strict: false })
      .create(profile.organizationId, dto, { tx });
    return invoice.id;
  }

  private async createBillFromTemplate(
    tx: Prisma.TransactionClient,
    profile: RecurringProfile,
    templateData: BillTemplateData,
    occurrence: Date,
    sourceId: string,
  ): Promise<string> {
    const vendor = await tx.vendor.findFirst({
      where: { id: templateData.vendorId, organizationId: profile.organizationId },
    });
    if (!vendor) {
      throw new NotFoundException(
        `Vendor ${templateData.vendorId} not found for this organization`,
      );
    }
    const dto: CreateBillDto = {
      vendorId: templateData.vendorId,
      date: occurrence.toISOString(),
      dueDate: this.dueDateFrom(occurrence, vendor.paymentTerms).toISOString(),
      reference: `Recurring: ${profile.name} ${this.occurrenceMarker(sourceId)}`,
      notes: templateData.notes,
      lines: templateData.lines.map((line, i) => ({
        itemId: line.itemId ?? undefined,
        accountId: line.accountId ?? undefined,
        description: line.description,
        quantity: this.decimalText(line.quantity, `lines[${i}].quantity`, '1'),
        rate: this.decimalText(line.rate, `lines[${i}].rate`),
        taxRate: this.decimalText(line.taxRate, `lines[${i}].taxRate`),
      })),
    };
    // Always a DRAFT: approving the bill is what posts it.
    const bill = await this.moduleRef
      .get(BillsService, { strict: false })
      .create(profile.organizationId, dto, { tx });
    return bill.id;
  }

  private async createExpenseFromTemplate(
    tx: Prisma.TransactionClient,
    profile: RecurringProfile,
    templateData: ExpenseTemplateData,
    occurrence: Date,
    sourceId: string,
  ): Promise<string> {
    const amount = toLedgerDecimal(templateData.amount, 'amount');
    let taxRate = this.decimalText(templateData.taxRate, 'taxRate', '');
    if (!taxRate && templateData.taxAmount !== undefined && amount.greaterThan(0)) {
      // Legacy template with a VAT amount: express it as the percentage that reproduces it.
      // Exclusive: the amount is net, so rate = tax / amount. Inclusive: the amount is gross, so
      // the net is amount - tax and rate = tax / (amount - tax).
      const legacyTax = toLedgerDecimal(templateData.taxAmount, 'taxAmount');
      const base = templateData.taxInclusive === true ? amount.sub(legacyTax) : amount;
      if (!base.greaterThan(0)) {
        throw new BadRequestException('taxAmount must be less than the inclusive amount');
      }
      taxRate = legacyTax.mul(100).div(base).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed();
    }
    const dto: CreateExpenseDto = {
      date: occurrence.toISOString(),
      vendorId: templateData.vendorId,
      accountId: templateData.accountId,
      paidThroughAccountId: templateData.paidThroughAccountId,
      amount: amount.toFixed(),
      taxRate: taxRate || undefined,
      taxInclusive: templateData.taxInclusive === true,
      reference: `Recurring: ${profile.name} ${this.occurrenceMarker(sourceId)}`,
      description: templateData.description,
    };
    // autoPost posts Dr expense / VAT, Cr paid-through account inside this transaction; without
    // it the expense is created PENDING with no journal until it is posted explicitly.
    const expense = await this.moduleRef
      .get(ExpensesService, { strict: false })
      .create(profile.organizationId, dto, { tx, post: profile.autoPost });
    return expense.id;
  }

  /**
   * The occurrence after `fromDate`. Month-based frequencies keep the day of `anchor` (the
   * profile start date) and clamp to the month's last day, so Jan 31 -> Feb 28 -> Mar 31.
   */
  private calculateNextRunDate(
    fromDate: Date,
    frequency: RecurringFrequency,
    anchor: Date = fromDate,
  ): Date {
    const nextDate = new Date(fromDate);

    switch (frequency) {
      case RecurringFrequency.DAILY:
        nextDate.setUTCDate(nextDate.getUTCDate() + 1);
        break;
      case RecurringFrequency.WEEKLY:
        nextDate.setUTCDate(nextDate.getUTCDate() + 7);
        break;
      case RecurringFrequency.MONTHLY:
        return this.addMonths(fromDate, 1, anchor.getUTCDate());
      case RecurringFrequency.QUARTERLY:
        return this.addMonths(fromDate, 3, anchor.getUTCDate());
      case RecurringFrequency.YEARLY:
        return this.addMonths(fromDate, 12, anchor.getUTCDate());
    }

    return nextDate;
  }

  private addMonths(date: Date, months: number, anchorDay: number): Date {
    const target = new Date(date);
    const lastDay = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months + 1, 0),
    ).getUTCDate();
    target.setUTCFullYear(
      date.getUTCFullYear(),
      date.getUTCMonth() + months,
      Math.min(anchorDay, lastDay),
    );
    return target;
  }

  // ============ Statistics ============

  async getStatistics(organizationId: string) {
    const [total, active, paused, byType, recentExecutions] = await Promise.all([
      this.prisma.recurringProfile.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.recurringProfile.count({
        where: { organizationId, isActive: true, deletedAt: null },
      }),
      this.prisma.recurringProfile.count({
        where: { organizationId, isActive: false, deletedAt: null },
      }),
      this.prisma.recurringProfile.groupBy({
        by: ['type'],
        where: { organizationId, deletedAt: null },
        _count: { id: true },
      }),
      this.prisma.recurringExecution.findMany({
        where: { profile: { organizationId } },
        orderBy: { executedAt: 'desc' },
        take: 10,
        include: {
          profile: { select: { name: true, type: true } },
        },
      }),
    ]);

    return {
      total,
      active,
      paused,
      byType: byType.map((t) => ({ type: t.type, count: t._count.id })),
      recentExecutions,
    };
  }

  // ============ Upcoming Profiles ============

  async getUpcoming(organizationId: string, days: number = 7) {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    return this.prisma.recurringProfile.findMany({
      where: {
        organizationId,
        isActive: true,
        deletedAt: null,
        nextRunDate: { lte: endDate },
      },
      orderBy: { nextRunDate: 'asc' },
      include: {
        executions: {
          orderBy: { executedAt: 'desc' },
          take: 1,
        },
      },
    });
  }
}
