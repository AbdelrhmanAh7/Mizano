import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ActivityType, Prisma } from '@prisma/client';

export interface CreateActivityDto {
  type: ActivityType;
  description: string;
  leadId?: string;
  dealId?: string;
  date?: string;
}

export interface ActivityQueryDto {
  leadId?: string;
  dealId?: string;
  type?: ActivityType;
  limit?: number;
  offset?: number;
}

@Injectable()
export class ActivitiesService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateActivityDto, userId: string) {
    // Validate that either leadId or dealId is provided
    if (!dto.leadId && !dto.dealId) {
      throw new NotFoundException('Either leadId or dealId must be provided');
    }

    // Verify lead exists if provided
    if (dto.leadId) {
      const lead = await this.prisma.lead.findFirst({
        where: { id: dto.leadId, organizationId, deletedAt: null },
      });
      if (!lead) throw new NotFoundException('Lead not found');
    }

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
        take: query.limit || 50,
        skip: query.offset || 0,
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

  async logCall(
    organizationId: string,
    userId: string,
    params: {
      leadId?: string;
      dealId?: string;
      description: string;
    },
  ) {
    return this.create(
      organizationId,
      {
        type: 'CALL',
        ...params,
      },
      userId,
    );
  }

  async logEmail(
    organizationId: string,
    userId: string,
    params: {
      leadId?: string;
      dealId?: string;
      description: string;
    },
  ) {
    return this.create(
      organizationId,
      {
        type: 'EMAIL',
        ...params,
      },
      userId,
    );
  }

  async logMeeting(
    organizationId: string,
    userId: string,
    params: {
      leadId?: string;
      dealId?: string;
      description: string;
      date?: string;
    },
  ) {
    return this.create(
      organizationId,
      {
        type: 'MEETING',
        ...params,
      },
      userId,
    );
  }

  async logNote(
    organizationId: string,
    userId: string,
    params: {
      leadId?: string;
      dealId?: string;
      description: string;
    },
  ) {
    return this.create(
      organizationId,
      {
        type: 'NOTE',
        ...params,
      },
      userId,
    );
  }

  async logTask(
    organizationId: string,
    userId: string,
    params: {
      leadId?: string;
      dealId?: string;
      description: string;
      date?: string;
    },
  ) {
    return this.create(
      organizationId,
      {
        type: 'TASK',
        ...params,
      },
      userId,
    );
  }
}
