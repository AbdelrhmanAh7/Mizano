import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
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

@Injectable()
export class RecurringProfilesService {
  constructor(private prisma: PrismaService) {}

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

  // Run daily at midnight to process recurring profiles
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processRecurringProfiles() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const profiles = await this.prisma.recurringProfile.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        nextRunDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
    });

    for (const profile of profiles) {
      try {
        await this.executeRecurringProfile(profile);

        // Update next run date
        const nextRunDate = this.calculateNextRunDate(profile.nextRunDate, profile.frequency);

        await this.prisma.recurringProfile.update({
          where: { id: profile.id },
          data: { nextRunDate },
        });
      } catch (error) {
        console.error(`Failed to process recurring profile ${profile.id}:`, error);
      }
    }
  }

  async executeProfile(organizationId: string, profileId: string): Promise<ExecutionResult> {
    const profile = await this.findOne(organizationId, profileId);
    return this.executeRecurringProfile(profile);
  }

  private async executeRecurringProfile(profile: RecurringProfile): Promise<ExecutionResult> {
    const templateData = profile.templateData as Record<string, unknown>;
    const entityType: string = profile.type || profile.entityType || '';
    let createdEntityId: string = '';
    const createdEntityType: string = entityType;

    try {
      switch (entityType?.toLowerCase()) {
        case 'journal':
          createdEntityId = await this.createJournalFromTemplate(
            profile,
            templateData as unknown as JournalTemplateData,
          );
          break;

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

  private async createJournalFromTemplate(
    profile: RecurringProfile,
    templateData: JournalTemplateData,
  ): Promise<string> {
    const journal = await this.prisma.journal.create({
      data: {
        journalNumber: await this.generateJournalNumber(profile.organizationId),
        date: new Date(),
        reference: `Recurring: ${profile.name}`,
        notes: templateData.notes,
        isPosted: profile.autoPost,
        organizationId: profile.organizationId,
        lines: {
          create: templateData.lines.map((line: JournalTemplateLine) => ({
            accountId: line.accountId,
            debit: new Decimal(line.debit || 0),
            credit: new Decimal(line.credit || 0),
            description: line.description,
          })),
        },
      },
    });
    return journal.id;
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

  private calculateNextRunDate(fromDate: Date, frequency: RecurringFrequency): Date {
    const nextDate = new Date(fromDate);

    switch (frequency) {
      case RecurringFrequency.DAILY:
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case RecurringFrequency.WEEKLY:
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case RecurringFrequency.MONTHLY:
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case RecurringFrequency.YEARLY:
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
    }

    return nextDate;
  }

  private async generateJournalNumber(organizationId: string): Promise<string> {
    const lastJournal = await this.prisma.journal.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { journalNumber: true },
    });

    if (!lastJournal) {
      return 'JRN-001';
    }

    const lastNumber = parseInt(lastJournal.journalNumber.split('-')[1], 10);
    return `JRN-${String(lastNumber + 1).padStart(3, '0')}`;
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
