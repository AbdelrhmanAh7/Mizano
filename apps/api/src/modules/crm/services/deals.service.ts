import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DealStage } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface CreateDealDto {
  dealName: string;
  leadId?: string;
  customerId?: string;
  stage?: DealStage;
  expectedAmount: number;
  probability?: number;
  expectedCloseDate?: string;
  assignedToId?: string;
  notes?: string;
}

export interface UpdateDealDto extends Partial<CreateDealDto> {
  lostReason?: string;
}

export interface DealQueryDto {
  stage?: DealStage;
  assignedToId?: string;
  customerId?: string;
  leadId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class DealsService {
  constructor(private prisma: PrismaService) {}

  // Default probabilities by stage
  private readonly stageProbability: Record<DealStage, number> = {
    [DealStage.NEW]: 10,
    [DealStage.MEETING_SCHEDULED]: 25,
    [DealStage.PROPOSAL_SENT]: 50,
    [DealStage.NEGOTIATION]: 75,
    [DealStage.WON]: 100,
    [DealStage.LOST]: 0,
  };

  async create(organizationId: string, dto: CreateDealDto, userId: string) {
    const stage = dto.stage || DealStage.NEW;
    const probability = dto.probability ?? this.stageProbability[stage];

    return this.prisma.deal.create({
      data: {
        dealName: dto.dealName,
        expectedAmount: new Decimal(dto.expectedAmount || 0),
        probability,
        stage,
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : null,
        customerId: dto.customerId,
        leadId: dto.leadId,
        assignedToId: dto.assignedToId || userId,
        organizationId,
      },
      include: {
        customer: { select: { id: true, name: true } },
        lead: { select: { id: true, leadName: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });
  }

  async findAll(organizationId: string, query: DealQueryDto) {
    const where: any = { organizationId, deletedAt: null };

    if (query.stage) where.stage = query.stage;
    if (query.assignedToId) where.assignedToId = query.assignedToId;
    if (query.customerId) where.customerId = query.customerId;
    if (query.leadId) where.leadId = query.leadId;

    if (query.search) {
      where.OR = [
        { dealName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.deal.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          lead: { select: { id: true, leadName: true } },
          assignedTo: { select: { id: true, name: true } },
          _count: { select: { activities: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit || 50,
        skip: query.offset || 0,
      }),
      this.prisma.deal.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(organizationId: string, id: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        customer: true,
        lead: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        activities: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { date: 'desc' },
          take: 20,
        },
        wonQuote: true,
      },
    });
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  async update(organizationId: string, id: string, dto: UpdateDealDto) {
    const deal = await this.findOne(organizationId, id);

    const data: any = {};

    if (dto.dealName !== undefined) data.dealName = dto.dealName;
    if (dto.expectedAmount !== undefined) data.expectedAmount = new Decimal(dto.expectedAmount);
    if (dto.probability !== undefined) data.probability = dto.probability;
    if (dto.expectedCloseDate !== undefined) data.expectedCloseDate = new Date(dto.expectedCloseDate);
    if (dto.customerId !== undefined) data.customerId = dto.customerId;
    if (dto.leadId !== undefined) data.leadId = dto.leadId;
    if (dto.assignedToId !== undefined) data.assignedToId = dto.assignedToId;

    // Track stage changes
    if (dto.stage && dto.stage !== deal.stage) {
      data.stage = dto.stage;

      // Update probability based on stage if not explicitly provided
      if (dto.probability === undefined) {
        data.probability = this.stageProbability[dto.stage];
      }

      if (dto.stage === DealStage.WON) {
        data.actualCloseDate = new Date();
      } else if (dto.stage === DealStage.LOST) {
        data.actualCloseDate = new Date();
        if (dto.lostReason) data.lostReason = dto.lostReason;
      }
    }

    return this.prisma.deal.update({
      where: { id },
      data,
      include: {
        customer: { select: { id: true, name: true } },
        lead: { select: { id: true, leadName: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);

    await this.prisma.deal.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Deal deleted' };
  }

  async markWon(
    organizationId: string,
    id: string,
    options?: { createQuote?: boolean },
  ) {
    const deal = await this.findOne(organizationId, id);

    if (deal.stage === DealStage.WON) {
      throw new BadRequestException('Deal is already won');
    }

    if (deal.stage === DealStage.LOST) {
      throw new BadRequestException('Cannot mark a lost deal as won');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let quoteId: string | null = null;

      // Optionally create a quote from the deal
      if (options?.createQuote && deal.customerId) {
        // Generate quote number
        const lastQuote = await tx.quote.findFirst({
          where: { organizationId },
          orderBy: { createdAt: 'desc' },
          select: { quoteNumber: true },
        });

        let quoteNumber = 'QT-001';
        if (lastQuote?.quoteNumber) {
          const lastNum = parseInt(lastQuote.quoteNumber.split('-')[1], 10);
          quoteNumber = `QT-${String(lastNum + 1).padStart(3, '0')}`;
        }

        const quote = await tx.quote.create({
          data: {
            quoteNumber,
            customerId: deal.customerId,
            date: new Date(),
            expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            subtotal: deal.expectedAmount,
            discount: new Decimal(0),
            taxAmount: new Decimal(0),
            grandTotal: deal.expectedAmount,
            status: 'DRAFT',
            notes: `Created from deal: ${deal.dealName}`,
            organizationId,
          },
        });

        quoteId = quote.id;
      }

      // Update deal
      const updatedDeal = await tx.deal.update({
        where: { id },
        data: {
          stage: DealStage.WON,
          probability: 100,
          actualCloseDate: new Date(),
          wonQuoteId: quoteId,
        },
      });

      return { deal: updatedDeal, quoteId };
    });

    return result;
  }

  async markLost(organizationId: string, id: string, reason?: string) {
    const deal = await this.findOne(organizationId, id);

    if (deal.stage === DealStage.LOST) {
      throw new BadRequestException('Deal is already lost');
    }

    if (deal.stage === DealStage.WON) {
      throw new BadRequestException('Cannot mark a won deal as lost');
    }

    return this.prisma.deal.update({
      where: { id },
      data: {
        stage: DealStage.LOST,
        probability: 0,
        actualCloseDate: new Date(),
        lostReason: reason,
      },
      include: {
        customer: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });
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

    for (const stage of stages) {
      const deals = await this.prisma.deal.findMany({
        where: { organizationId, stage, deletedAt: null },
        include: {
          customer: { select: { id: true, name: true } },
          lead: { select: { id: true, leadName: true } },
          assignedTo: { select: { id: true, name: true } },
        },
        orderBy: { expectedAmount: 'desc' },
      });

      const totalValue = deals.reduce(
        (sum, d) => sum + d.expectedAmount.toNumber(),
        0,
      );
      const weightedValue = deals.reduce(
        (sum, d) => sum + d.expectedAmount.toNumber() * (d.probability / 100),
        0,
      );

      pipeline.push({
        stage,
        deals: deals.map((d) => ({
          ...d,
          expectedAmount: d.expectedAmount.toNumber(),
        })),
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
    const startOfQuarter = new Date(
      today.getFullYear(),
      Math.floor(today.getMonth() / 3) * 3,
      1,
    );

    const [wonThisMonth, lostThisMonth, openDeals, wonThisQuarter] = await Promise.all([
      this.prisma.deal.aggregate({
        where: {
          organizationId,
          stage: DealStage.WON,
          actualCloseDate: { gte: startOfMonth },
          deletedAt: null,
        },
        _sum: { expectedAmount: true },
        _count: { id: true },
      }),
      this.prisma.deal.aggregate({
        where: {
          organizationId,
          stage: DealStage.LOST,
          actualCloseDate: { gte: startOfMonth },
          deletedAt: null,
        },
        _count: { id: true },
      }),
      this.prisma.deal.aggregate({
        where: {
          organizationId,
          stage: { notIn: [DealStage.WON, DealStage.LOST] },
          deletedAt: null,
        },
        _sum: { expectedAmount: true },
        _count: { id: true },
      }),
      this.prisma.deal.aggregate({
        where: {
          organizationId,
          stage: DealStage.WON,
          actualCloseDate: { gte: startOfQuarter },
          deletedAt: null,
        },
        _sum: { expectedAmount: true },
        _count: { id: true },
      }),
    ]);

    // Win rate
    const totalClosed = (wonThisMonth._count?.id || 0) + (lostThisMonth._count?.id || 0);
    const winRate = totalClosed > 0
      ? Math.round(((wonThisMonth._count?.id || 0) / totalClosed) * 1000) / 10
      : 0;

    // Weighted pipeline value
    const pipelineDeals = await this.prisma.deal.findMany({
      where: {
        organizationId,
        stage: { notIn: [DealStage.WON, DealStage.LOST] },
        deletedAt: null,
      },
      select: { expectedAmount: true, probability: true },
    });

    const weightedPipeline = pipelineDeals.reduce(
      (sum, d) => sum + d.expectedAmount.toNumber() * (d.probability / 100),
      0,
    );

    return {
      wonThisMonth: {
        count: wonThisMonth._count?.id || 0,
        value: wonThisMonth._sum?.expectedAmount?.toNumber() || 0,
      },
      wonThisQuarter: {
        count: wonThisQuarter._count?.id || 0,
        value: wonThisQuarter._sum?.expectedAmount?.toNumber() || 0,
      },
      lostThisMonth: lostThisMonth._count?.id || 0,
      openDeals: {
        count: openDeals._count?.id || 0,
        value: openDeals._sum?.expectedAmount?.toNumber() || 0,
      },
      winRate,
      weightedPipeline,
    };
  }

  async updateStage(organizationId: string, id: string, stage: DealStage) {
    const deal = await this.findOne(organizationId, id);

    // Validate stage transitions
    if (deal.stage === DealStage.WON || deal.stage === DealStage.LOST) {
      throw new BadRequestException('Cannot change stage of closed deal');
    }

    const data: any = {
      stage,
      probability: this.stageProbability[stage],
    };

    if (stage === DealStage.WON) {
      data.actualCloseDate = new Date();
    } else if (stage === DealStage.LOST) {
      data.actualCloseDate = new Date();
    }

    return this.prisma.deal.update({
      where: { id },
      data,
      include: {
        customer: { select: { id: true, name: true } },
        lead: { select: { id: true, leadName: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });
  }

  async assignDeal(organizationId: string, id: string, assignedToId: string) {
    await this.findOne(organizationId, id);

    return this.prisma.deal.update({
      where: { id },
      data: { assignedToId },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });
  }
}
