import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ActivityType, Prisma } from '@prisma/client';
import { ActivityQueryDto, CreateActivityDto, LogActivityDto } from '../dto/activity.dto';
import { crmPage } from '../dto/crm-list-query.dto';
import { assertLeadInOrg } from './crm-references';

@Injectable()
export class ActivitiesService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateActivityDto, userId: string) {
    // Validate that either leadId or dealId is provided
    if (!dto.leadId && !dto.dealId) {
      throw new BadRequestException('Either leadId or dealId must be provided');
    }

    // Verify lead exists if provided
    if (dto.leadId) await assertLeadInOrg(this.prisma, organizationId, dto.leadId);

    // Verify deal exists if provided
    if (dto.dealId) {
      const deal = await this.prisma.deal.findFirst({
        where: { id: dto.dealId, organizationId, deletedAt: null },
      });
      if (!deal) throw new NotFoundException('Deal not found');
    }

    return this.prisma.activityLog.create({
      data: {
        type: dto.type,
        description: dto.description,
        date: dto.date ? new Date(dto.date) : new Date(),
        leadId: dto.leadId,
        dealId: dto.dealId,
        userId,
        organizationId,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        lead: { select: { id: true, leadName: true } },
        deal: { select: { id: true, dealName: true } },
      },
    });
  }

  async findAll(organizationId: string, query: ActivityQueryDto) {
    const where: Prisma.ActivityLogWhereInput = { organizationId };

    if (query.leadId) where.leadId = query.leadId;
    if (query.dealId) where.dealId = query.dealId;
    if (query.type) where.type = query.type;

    const [data, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } },
          lead: { select: { id: true, leadName: true } },
          deal: { select: { id: true, dealName: true } },
        },
        orderBy: { date: 'desc' },
        ...crmPage(query),
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(organizationId: string, id: string) {
    const activity = await this.prisma.activityLog.findFirst({
      where: { id, organizationId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        lead: { select: { id: true, leadName: true } },
        deal: { select: { id: true, dealName: true } },
      },
    });

    if (!activity) throw new NotFoundException('Activity not found');
    return activity;
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);

    await this.prisma.activityLog.delete({
      where: { id },
    });

    return { message: 'Activity deleted' };
  }

  async getRecentActivities(organizationId: string, limit: number = 20) {
    return this.prisma.activityLog.findMany({
      where: { organizationId },
      include: {
        user: { select: { id: true, name: true } },
        lead: { select: { id: true, leadName: true } },
        deal: { select: { id: true, dealName: true } },
      },
      orderBy: { date: 'desc' },
      take: limit,
    });
  }

  async getActivityStats(organizationId: string) {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [byType, thisMonth, total] = await Promise.all([
      this.prisma.activityLog.groupBy({
        by: ['type'],
        where: { organizationId },
        _count: { id: true },
      }),
      this.prisma.activityLog.count({
        where: {
          organizationId,
          date: { gte: startOfMonth },
        },
      }),
      this.prisma.activityLog.count({
        where: { organizationId },
      }),
    ]);

    return {
      total,
      thisMonth,
      byType: byType.map((t) => ({
        type: t.type,
        count: t._count.id,
      })),
    };
  }

  /** Quick logging: the route fixes the type, the body carries only the shared fields. */
  private log(organizationId: string, userId: string, type: ActivityType, params: LogActivityDto) {
    return this.create(
      organizationId,
      {
        type,
        leadId: params.leadId,
        dealId: params.dealId,
        description: params.description,
        date: params.date,
      },
      userId,
    );
  }

  async logCall(organizationId: string, userId: string, params: LogActivityDto) {
    return this.log(organizationId, userId, ActivityType.CALL, params);
  }

  async logEmail(organizationId: string, userId: string, params: LogActivityDto) {
    return this.log(organizationId, userId, ActivityType.EMAIL, params);
  }

  async logMeeting(organizationId: string, userId: string, params: LogActivityDto) {
    return this.log(organizationId, userId, ActivityType.MEETING, params);
  }

  async logNote(organizationId: string, userId: string, params: LogActivityDto) {
    return this.log(organizationId, userId, ActivityType.NOTE, params);
  }

  async logTask(organizationId: string, userId: string, params: LogActivityDto) {
    return this.log(organizationId, userId, ActivityType.TASK, params);
  }
}
