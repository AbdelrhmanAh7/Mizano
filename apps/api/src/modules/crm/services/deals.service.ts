import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DealStage } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class DealsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: any, userId: string) {
    return this.prisma.deal.create({
      data: {
        name: dto.name,
        notes: dto.description,
        value: new Decimal(dto.value || 0),
        stage: dto.stage || DealStage.NEW,
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : null,
        customerId: dto.customerId,
        leadId: dto.leadId,
        assignedToId: dto.assignedToId || userId,
        organizationId,
      },
      include: {
        customer: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });
  }

  async findAll(organizationId: string, query: { stage?: string; assignedToId?: string; customerId?: string }) {
    const where: any = { organizationId };
    if (query.stage) where.stage = query.stage;
    if (query.assignedToId) where.assignedToId = query.assignedToId;
    if (query.customerId) where.customerId = query.customerId;

    return this.prisma.deal.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, organizationId },
      include: {
        customer: true,
        lead: true,
        assignedTo: true,
      },
    });
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  async update(organizationId: string, id: string, dto: any) {
    const deal = await this.findOne(organizationId, id);

    const data: any = { ...dto };
    if (dto.value !== undefined) data.value = new Decimal(dto.value);
    if (dto.expectedCloseDate) data.expectedCloseDate = new Date(dto.expectedCloseDate);

    // Track stage changes
    if (dto.stage && dto.stage !== deal.stage) {
      if (dto.stage === DealStage.WON) {
        data.closedAt = new Date();
        data.actualCloseDate = new Date();
      } else if (dto.stage === DealStage.LOST) {
        data.closedAt = new Date();
      }
    }

    return this.prisma.deal.update({
      where: { id },
      data,
      include: {
        customer: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.deal.delete({ where: { id } });
    return { message: 'Deal deleted' };
  }

  async getPipeline(organizationId: string) {
    const stages = Object.values(DealStage);
    const pipeline: Array<{
      stage: DealStage;
      deals: any[];
      count: number;
      totalValue: number;
      weightedValue: number;
    }> = [];

    // Define default probability by stage (since probability field doesn't exist on Deal)
    const stageProbability: Record<DealStage, number> = {
      [DealStage.NEW]: 10,
      [DealStage.MEETING_SCHEDULED]: 25,
      [DealStage.PROPOSAL_SENT]: 50,
      [DealStage.NEGOTIATION]: 75,
      [DealStage.WON]: 100,
      [DealStage.LOST]: 0,
    };

    for (const stage of stages) {
      const deals = await this.prisma.deal.findMany({
        where: { organizationId, stage },
        include: {
          customer: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
        },
        orderBy: { value: 'desc' },
      });

      const totalValue = deals.reduce((sum: number, d: { value: Decimal }) => sum + parseFloat(d.value.toString()), 0);
      const probability = stageProbability[stage];
      const weightedValue = deals.reduce((sum: number, d: { value: Decimal }) => sum + parseFloat(d.value.toString()) * (probability / 100), 0);

      pipeline.push({
        stage,
        deals,
        count: deals.length,
        totalValue,
        weightedValue,
      });
    }

    return pipeline;
  }

  async getDealStats(organizationId: string) {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfQuarter = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);

    // Won deals this month
    const wonThisMonth = await this.prisma.deal.aggregate({
      where: { organizationId, stage: DealStage.WON, closedAt: { gte: startOfMonth } },
      _sum: { value: true },
      _count: { id: true },
    });

    // Lost deals this month
    const lostThisMonth = await this.prisma.deal.aggregate({
      where: { organizationId, stage: DealStage.LOST, closedAt: { gte: startOfMonth } },
      _count: { id: true },
    });

    // Open deals
    const openDeals = await this.prisma.deal.aggregate({
      where: { organizationId, stage: { notIn: [DealStage.WON, DealStage.LOST] } },
      _sum: { value: true },
      _count: { id: true },
    });

    // Win rate
    const totalClosed = (wonThisMonth._count?.id || 0) + (lostThisMonth._count?.id || 0);
    const winRate = totalClosed > 0 ? ((wonThisMonth._count?.id || 0) / totalClosed) * 100 : 0;

    return {
      wonThisMonth: {
        count: wonThisMonth._count?.id || 0,
        value: parseFloat(wonThisMonth._sum?.value?.toString() || '0'),
      },
      lostThisMonth: lostThisMonth._count?.id || 0,
      openDeals: {
        count: openDeals._count?.id || 0,
        value: parseFloat(openDeals._sum?.value?.toString() || '0'),
      },
      winRate: Math.round(winRate * 10) / 10,
    };
  }

}
