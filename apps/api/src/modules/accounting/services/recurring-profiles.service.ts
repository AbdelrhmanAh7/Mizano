import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalSourceType, JournalsService } from './journals.service';
import { CreateRecurringProfileDto } from '../dto/create-recurring-profile.dto';
import { RecurringProfileQueryDto } from '../dto/recurring-profile-query.dto';
import { UpdateRecurringProfileDto } from '../dto/update-recurring-profile.dto';
import { RecurringFrequency, RecurringType, Prisma, RecurringProfile } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

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
  lines: BillTemplateLine[];
}

interface ExpenseTemplateData {
  vendorId?: string;
  accountId: string;
  paidThroughAccountId: string;
  amount: number | string;
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

    if (
      restDto.templateData !== undefined &&
      (mappedType ?? profile.type) === RecurringType.JOURNAL
    ) {
      await this.assertValidJournalTemplate(organizationId, restDto.templateData);
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
    const endOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );

    const profiles = await this.prisma.recurringProfile.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        nextRunDate: { lt: endOfToday },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
    });

    for (const profile of profiles) {
      try {
        if (this.isJournalProfile(profile)) {
          await this.catchUpJournalProfile(profile, endOfToday);
          continue;
        }

        await this.executeRecurringProfile(profile);

        // Update next run date
        const nextRunDate = this.calculateNextRunDate(profile.nextRunDate, profile.frequency);

        await this.prisma.recurringProfile.update({
          where: { id: profile.id },
          data: { nextRunDate },
        });
      } catch (error) {
        this.logger.error(
          `Failed to process recurring profile ${profile.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private isJournalProfile(profile: RecurringProfile): boolean {
    return (profile.type ?? profile.entityType ?? '').toLowerCase() === 'journal';
  }

  /** Executes each due occurrence of a journal profile, oldest first, until one fails. */
  private async catchUpJournalProfile(profile: RecurringProfile, before: Date): Promise<void> {
    let current: RecurringProfile = profile;
    for (let run = 0; run < MAX_CATCH_UP_RUNS; run++) {
      if (current.nextRunDate >= before) return;
      if (current.endDate && current.nextRunDate > current.endDate) return;
      const result = await this.executeJournalProfile(current);
      if (!result.success) return;
      const refreshed = await this.prisma.recurringProfile.findFirst({
        where: { id: profile.id, organizationId: profile.organizationId, deletedAt: null },
      });
      if (!refreshed || !refreshed.isActive) return;
      current = refreshed;
    }
  }

  async executeProfile(organizationId: string, profileId: string): Promise<ExecutionResult> {
    const profile = await this.findOne(organizationId, profileId);
    return this.executeRecurringProfile(profile);
  }

  private async executeRecurringProfile(profile: RecurringProfile): Promise<ExecutionResult> {
    if (this.isJournalProfile(profile)) return this.executeJournalProfile(profile);

    const templateData = profile.templateData as Record<string, unknown>;
    const entityType: string = profile.type || profile.entityType || '';
    let createdEntityId: string = '';
    const createdEntityType: string = entityType;

    try {
      switch (entityType?.toLowerCase()) {
        case 'invoice':
          createdEntityId = await this.createInvoiceFromTemplate(
            profile,
            templateData as unknown as InvoiceTemplateData,
          );
          break;

        case 'bill':
          createdEntityId = await this.createBillFromTemplate(
            profile,
            templateData as unknown as BillTemplateData,
          );
          break;

        case 'expense':
          createdEntityId = await this.createExpenseFromTemplate(
            profile,
            templateData as unknown as ExpenseTemplateData,
          );
          break;

        default:
          throw new BadRequestException(`Unsupported recurring type: ${entityType}`);
      }

      // Record execution
      await this.prisma.recurringExecution.create({
        data: {
          profileId: profile.id,
          createdEntityType,
          createdEntityId,
          status: 'success',
          organizationId: profile.organizationId,
        },
      });

      // Update profile
      await this.prisma.recurringProfile.update({
        where: { id: profile.id },
        data: {
          executionCount: { increment: 1 },
          lastExecutedAt: new Date(),
        },
      });

      return { success: true, createdEntityType, createdEntityId };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Record failed execution
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

      return { success: false, createdEntityType, createdEntityId: '', error: errorMessage };
    }
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
  private async executeJournalProfile(profile: RecurringProfile): Promise<ExecutionResult> {
    const occurrence = profile.nextRunDate;
    const createdEntityType: string = profile.type || profile.entityType || '';
    const sourceId = `${profile.id}:${runDay(occurrence)}`;
    const next = this.calculateNextRunDate(occurrence, profile.frequency, profile.startDate);

    try {
      if (profile.endDate && occurrence > profile.endDate) {
        throw new BadRequestException('This recurring profile has passed its end date');
      }
      const template = profile.templateData as unknown as JournalTemplateData;
      const lines = this.journalLinesFromTemplate(template);

      const journalId = await this.prisma.$transaction(async (tx) => {
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

  private async createInvoiceFromTemplate(
    profile: RecurringProfile,
    templateData: InvoiceTemplateData,
  ): Promise<string> {
    // Calculate totals
    let subtotal = 0;
    let taxAmount = 0;
    const lines = templateData.lines.map((line: InvoiceTemplateLine) => {
      const qty = Number(line.quantity ?? 1);
      const rate = Number(line.rate ?? 0);
      const discount = Number(line.discount ?? 0);
      const taxRate = Number(line.taxRate ?? 0);

      const lineTotal = qty * rate * (1 - discount / 100);
      const lineTax = lineTotal * (taxRate / 100);

      subtotal += lineTotal;
      taxAmount += lineTax;

      return {
        itemId: line.itemId,
        description: line.description,
        quantity: new Decimal(qty),
        rate: new Decimal(rate),
        discount: new Decimal(discount),
        taxRate: new Decimal(taxRate),
        amount: new Decimal(lineTotal),
      };
    });

    const shippingAmount = Number(templateData.shippingAmount ?? 0);
    const grandTotal = subtotal + taxAmount + shippingAmount;

    // Calculate due date based on customer payment terms
    const customer = await this.prisma.customer.findFirst({
      where: { id: templateData.customerId, organizationId: profile.organizationId },
    });
    if (!customer) {
      throw new NotFoundException(
        `Customer ${templateData.customerId} not found for this organization`,
      );
    }
    const paymentTerms = customer.paymentTerms || 30;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + paymentTerms);

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber: await this.generateInvoiceNumber(profile.organizationId),
        customerId: templateData.customerId,
        date: new Date(),
        dueDate,
        subtotal: new Decimal(subtotal),
        taxAmount: new Decimal(taxAmount),
        shippingAmount: new Decimal(shippingAmount),
        grandTotal: new Decimal(grandTotal),
        balanceDue: new Decimal(grandTotal),
        notes: templateData.notes,
        terms: templateData.terms,
        status: profile.autoPost ? 'SENT' : 'DRAFT',
        organizationId: profile.organizationId,
        lines: { create: lines },
      },
    });

    return invoice.id;
  }

  private async createBillFromTemplate(
    profile: RecurringProfile,
    templateData: BillTemplateData,
  ): Promise<string> {
    let subtotal = 0;
    let taxAmount = 0;
    const lines = templateData.lines.map((line: BillTemplateLine) => {
      const qty = Number(line.quantity ?? 1);
      const rate = Number(line.rate ?? 0);
      const taxRate = Number(line.taxRate ?? 0);

      const lineTotal = qty * rate;
      const lineTax = lineTotal * (taxRate / 100);

      subtotal += lineTotal;
      taxAmount += lineTax;

      return {
        itemId: line.itemId,
        description: line.description,
        quantity: new Decimal(qty),
        rate: new Decimal(rate),
        taxRate: new Decimal(taxRate),
        amount: new Decimal(lineTotal),
      };
    });

    const grandTotal = subtotal + taxAmount;

    const vendor = await this.prisma.vendor.findFirst({
      where: { id: templateData.vendorId, organizationId: profile.organizationId },
    });
    if (!vendor) {
      throw new NotFoundException(
        `Vendor ${templateData.vendorId} not found for this organization`,
      );
    }
    const paymentTerms = vendor.paymentTerms || 30;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + paymentTerms);

    const bill = await this.prisma.bill.create({
      data: {
        billNumber: await this.generateBillNumber(profile.organizationId),
        vendorId: templateData.vendorId,
        date: new Date(),
        dueDate,
        reference: `Recurring: ${profile.name}`,
        subtotal: new Decimal(subtotal),
        taxAmount: new Decimal(taxAmount),
        grandTotal: new Decimal(grandTotal),
        balanceDue: new Decimal(grandTotal),
        status: 'PENDING',
        organizationId: profile.organizationId,
        lines: { create: lines },
      },
    });

    return bill.id;
  }

  private async createExpenseFromTemplate(
    profile: RecurringProfile,
    templateData: ExpenseTemplateData,
  ): Promise<string> {
    const expense = await this.prisma.expense.create({
      data: {
        date: new Date(),
        vendorId: templateData.vendorId,
        accountId: templateData.accountId,
        paidThroughAccountId: templateData.paidThroughAccountId,
        amount: new Decimal(templateData.amount),
        taxAmount: templateData.taxAmount ? new Decimal(templateData.taxAmount) : undefined,
        reference: `Recurring: ${profile.name}`,
        description: templateData.description,
        status: profile.autoPost ? 'POSTED' : 'PENDING',
        organizationId: profile.organizationId,
      },
    });

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

  private async generateInvoiceNumber(organizationId: string): Promise<string> {
    const lastInvoice = await this.prisma.invoice.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { invoiceNumber: true },
    });

    if (!lastInvoice) {
      return 'INV-001';
    }

    const lastNumber = parseInt(lastInvoice.invoiceNumber.split('-')[1], 10);
    return `INV-${String(lastNumber + 1).padStart(3, '0')}`;
  }

  private async generateBillNumber(organizationId: string): Promise<string> {
    const lastBill = await this.prisma.bill.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { billNumber: true },
    });

    if (!lastBill) {
      return 'BILL-001';
    }

    const lastNumber = parseInt(lastBill.billNumber.split('-')[1], 10);
    return `BILL-${String(lastNumber + 1).padStart(3, '0')}`;
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
