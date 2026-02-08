import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateJournalDto } from '../dto/create-journal.dto';
import { UpdateJournalDto } from '../dto/update-journal.dto';
import { JournalQueryDto } from '../dto/journal-query.dto';
import { OrganizationsService } from '../../organizations/organizations.service';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';

@Injectable()
export class JournalsService {
  constructor(
    private prisma: PrismaService,
    private organizationsService: OrganizationsService,
  ) {}

  async create(organizationId: string, createJournalDto: CreateJournalDto) {
    const { date, reference, notes, lines } = createJournalDto;

    // Check lock date
    await this.checkLockDate(organizationId, new Date(date));

    // Validate debits = credits
    const totalDebit = lines.reduce(
      (sum, line) => sum + parseFloat(line.debit || '0'),
      0,
    );
    const totalCredit = lines.reduce(
      (sum, line) => sum + parseFloat(line.credit || '0'),
      0,
    );

    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      throw new BadRequestException('Total debits must equal total credits');
    }

    // Validate accounts exist
    const accountIds = lines.map((line) => line.accountId);
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: accountIds }, organizationId },
    });

    if (accounts.length !== accountIds.length) {
      throw new BadRequestException('One or more accounts not found');
    }

    // Generate journal number and create in a transaction with retry for race conditions
    const journal = await this.createJournalWithRetry(organizationId, {
      date: new Date(date),
      reference,
      notes,
      organizationId,
      lines: {
        create: lines.map((line) => ({
          accountId: line.accountId,
          debit: new Decimal(line.debit || '0'),
          credit: new Decimal(line.credit || '0'),
          description: line.description,
        })),
      },
    });

    return {
      ...journal,
      totalDebit: totalDebit.toFixed(4),
      totalCredit: totalCredit.toFixed(4),
    };
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

    const where: any = {
      organizationId,
      deletedAt: null,
    };

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
        include: {
          lines: {
            include: {
              account: {
                select: { id: true, code: true, name: true, type: true },
              },
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.journal.count({ where }),
    ]);

    // Calculate totals for each journal
    const journalsWithTotals = journals.map((journal) => {
      const totalDebit = journal.lines.reduce(
        (sum, line) => sum + parseFloat(line.debit.toString()),
        0,
      );
      const totalCredit = journal.lines.reduce(
        (sum, line) => sum + parseFloat(line.credit.toString()),
        0,
      );

      return {
        ...journal,
        totalDebit: totalDebit.toFixed(4),
        totalCredit: totalCredit.toFixed(4),
      };
    });

    return {
      data: journalsWithTotals,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(organizationId: string, id: string) {
    const journal = await this.prisma.journal.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        lines: {
          include: {
            account: {
              select: { id: true, code: true, name: true, type: true },
            },
          },
        },
      },
    });

    if (!journal) {
      throw new NotFoundException('Journal not found');
    }

    const totalDebit = journal.lines.reduce(
      (sum, line) => sum + parseFloat(line.debit.toString()),
      0,
    );
    const totalCredit = journal.lines.reduce(
      (sum, line) => sum + parseFloat(line.credit.toString()),
      0,
    );

    return {
      ...journal,
      totalDebit: totalDebit.toFixed(4),
      totalCredit: totalCredit.toFixed(4),
    };
  }

  async update(organizationId: string, id: string, updateJournalDto: UpdateJournalDto) {
    const journal = await this.prisma.journal.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!journal) {
      throw new NotFoundException('Journal not found');
    }

    // Check lock date for original date
    await this.checkLockDate(organizationId, journal.date);

    // Check lock date for new date if provided
    if (updateJournalDto.date) {
      await this.checkLockDate(organizationId, new Date(updateJournalDto.date));
    }

    // If updating lines, validate totals
    if (updateJournalDto.lines) {
      const totalDebit = updateJournalDto.lines.reduce(
        (sum, line) => sum + parseFloat(line.debit || '0'),
        0,
      );
      const totalCredit = updateJournalDto.lines.reduce(
        (sum, line) => sum + parseFloat(line.credit || '0'),
        0,
      );

      if (Math.abs(totalDebit - totalCredit) > 0.0001) {
        throw new BadRequestException('Total debits must equal total credits');
      }
    }

    // Update in transaction
    const updatedJournal = await this.prisma.$transaction(async (tx) => {
      // Delete existing lines if new lines provided
      if (updateJournalDto.lines) {
        await tx.journalLine.deleteMany({ where: { journalId: id } });
      }

      return tx.journal.update({
        where: { id },
        data: {
          date: updateJournalDto.date ? new Date(updateJournalDto.date) : undefined,
          reference: updateJournalDto.reference,
          notes: updateJournalDto.notes,
          ...(updateJournalDto.lines && {
            lines: {
              create: updateJournalDto.lines.map((line) => ({
                accountId: line.accountId,
                debit: new Decimal(line.debit || '0'),
                credit: new Decimal(line.credit || '0'),
                description: line.description,
              })),
            },
          }),
        },
        include: {
          lines: {
            include: {
              account: {
                select: { id: true, code: true, name: true, type: true },
              },
            },
          },
        },
      });
    });

    return updatedJournal;
  }

  async remove(organizationId: string, id: string) {
    const journal = await this.prisma.journal.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!journal) {
      throw new NotFoundException('Journal not found');
    }

    // Check lock date
    await this.checkLockDate(organizationId, journal.date);

    // Soft delete
    await this.prisma.journal.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Journal deleted successfully' };
  }

  async reverse(organizationId: string, id: string, dto?: { date?: string }) {
    const journal = await this.prisma.journal.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        lines: true,
        reversedBy: true,
      },
    });

    if (!journal) {
      throw new NotFoundException('Journal not found');
    }

    if (journal.reversedBy) {
      throw new BadRequestException('This journal has already been reversed');
    }

    if (journal.reversalOfId) {
      throw new BadRequestException('Cannot reverse a reversal journal');
    }

    const reversalDate = dto?.date ? new Date(dto.date) : new Date();

    // Check lock date for both original and reversal dates
    await this.checkLockDate(organizationId, journal.date);
    await this.checkLockDate(organizationId, reversalDate);

    const reversalJournal = await this.createJournalWithRetry(organizationId, {
      date: reversalDate,
      reference: `REV-${journal.journalNumber}`,
      notes: `Reversal of ${journal.journalNumber}`,
      isPosted: true,
      reversalOfId: journal.id,
      organizationId,
      lines: {
        create: journal.lines.map((line) => ({
          accountId: line.accountId,
          debit: line.credit,
          credit: line.debit,
          description: `Reversal: ${line.description || ''}`.trim(),
        })),
      },
    });

    const totalDebit = reversalJournal.lines.reduce(
      (sum: number, line: any) => sum + parseFloat(line.debit.toString()),
      0,
    );
    const totalCredit = reversalJournal.lines.reduce(
      (sum: number, line: any) => sum + parseFloat(line.credit.toString()),
      0,
    );

    return {
      ...reversalJournal,
      totalDebit: totalDebit.toFixed(4),
      totalCredit: totalCredit.toFixed(4),
    };
  }

  private async generateJournalNumberTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<string> {
    const lastJournal = await tx.journal.findFirst({
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

  /**
   * Create a journal with retry logic for unique constraint conflicts on journalNumber.
   */
  private async createJournalWithRetry(
    organizationId: string,
    data: Record<string, any>,
    maxRetries: number = 3,
  ): Promise<any> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const journalNumber = await this.generateJournalNumberTx(tx, organizationId);
          return tx.journal.create({
            data: { ...data, journalNumber } as any,
            include: {
              lines: {
                include: {
                  account: {
                    select: { id: true, code: true, name: true, type: true },
                  },
                },
              },
            },
          });
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt < maxRetries - 1
        ) {
          continue;
        }
        throw error;
      }
    }
  }

  private async checkLockDate(organizationId: string, transactionDate: Date) {
    const lockDate = await this.organizationsService.getLockDate(organizationId);

    if (lockDate && transactionDate <= lockDate) {
      throw new BadRequestException(
        `This period is locked. Transactions before ${lockDate.toISOString().split('T')[0]} cannot be modified.`,
      );
    }
  }
}
