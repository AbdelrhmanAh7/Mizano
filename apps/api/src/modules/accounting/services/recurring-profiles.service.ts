import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateRecurringProfileDto } from '../dto/create-recurring-profile.dto';
import { UpdateRecurringProfileDto } from '../dto/update-recurring-profile.dto';
import { RecurringFrequency } from '@prisma/client';

@Injectable()
export class RecurringProfilesService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, createRecurringProfileDto: CreateRecurringProfileDto) {
    const { name, frequency, startDate, endDate, autoPost, templateData, entityType } =
      createRecurringProfileDto;

    const nextRunDate = this.calculateNextRunDate(new Date(startDate), frequency);

    const profile = await this.prisma.recurringProfile.create({
      data: {
        name,
        frequency,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        nextRunDate,
        autoPost: autoPost || false,
        templateData,
        entityType,
        organizationId,
      },
    });

    return profile;
  }

  async findAll(organizationId: string) {
    const profiles = await this.prisma.recurringProfile.findMany({
      where: { organizationId },
      orderBy: { nextRunDate: 'asc' },
    });

    return profiles;
  }

  async findOne(organizationId: string, id: string) {
    const profile = await this.prisma.recurringProfile.findFirst({
      where: { id, organizationId },
    });

    if (!profile) {
      throw new NotFoundException('Recurring profile not found');
    }

    return profile;
  }

  async update(
    organizationId: string,
    id: string,
    updateRecurringProfileDto: UpdateRecurringProfileDto,
  ) {
    const profile = await this.prisma.recurringProfile.findFirst({
      where: { id, organizationId },
    });

    if (!profile) {
      throw new NotFoundException('Recurring profile not found');
    }

    // Recalculate next run date if frequency changes
    let nextRunDate = profile.nextRunDate;
    if (updateRecurringProfileDto.frequency && updateRecurringProfileDto.frequency !== profile.frequency) {
      nextRunDate = this.calculateNextRunDate(
        new Date(),
        updateRecurringProfileDto.frequency,
      );
    }

    const updatedProfile = await this.prisma.recurringProfile.update({
      where: { id },
      data: {
        ...updateRecurringProfileDto,
        nextRunDate,
        startDate: updateRecurringProfileDto.startDate
          ? new Date(updateRecurringProfileDto.startDate)
          : undefined,
        endDate: updateRecurringProfileDto.endDate
          ? new Date(updateRecurringProfileDto.endDate)
          : undefined,
      },
    });

    return updatedProfile;
  }

  async toggle(organizationId: string, id: string) {
    const profile = await this.prisma.recurringProfile.findFirst({
      where: { id, organizationId },
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
      where: { id, organizationId },
    });

    if (!profile) {
      throw new NotFoundException('Recurring profile not found');
    }

    await this.prisma.recurringProfile.delete({ where: { id } });

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
        nextRunDate: { lte: today },
        OR: [
          { endDate: null },
          { endDate: { gte: today } },
        ],
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

  private async executeRecurringProfile(profile: any) {
    // This would be extended to handle different entity types
    // For now, it creates journal entries
    if (profile.entityType === 'journal') {
      const templateData = profile.templateData as any;

      // Create journal entry from template
      await this.prisma.journal.create({
        data: {
          journalNumber: await this.generateJournalNumber(profile.organizationId),
          date: new Date(),
          reference: `Recurring: ${profile.name}`,
          notes: templateData.notes,
          isPosted: profile.autoPost,
          organizationId: profile.organizationId,
          lines: {
            create: templateData.lines.map((line: any) => ({
              accountId: line.accountId,
              debit: line.debit,
              credit: line.credit,
              description: line.description,
            })),
          },
        },
      });
    }
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
}
