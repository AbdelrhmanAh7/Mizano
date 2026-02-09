import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LeadSource, LeadStatus } from '@prisma/client';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CreateLeadDto {
  leadName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  source?: LeadSource;
  status?: LeadStatus;
  notes?: string;
  customFields?: Record<string, any>;
  assignedToId?: string;
}

export interface UpdateLeadDto extends Partial<CreateLeadDto> {}

export interface LeadQueryDto {
  status?: LeadStatus;
  source?: LeadSource;
  assignedToId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateLeadDto, userId: string) {
    return this.prisma.lead.create({
      data: {
        leadName: dto.leadName,
        companyName: dto.companyName,
        email: dto.email,
        phone: dto.phone,
        source: dto.source || LeadSource.WEBSITE,
        status: dto.status || LeadStatus.NEW,
        notes: dto.notes,
        customFields: dto.customFields,
        assignedToId: dto.assignedToId || userId,
        organizationId,
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        score: true,
      },
    });
  }

  async findAll(organizationId: string, query: LeadQueryDto) {
    const where: any = { organizationId, deletedAt: null };

    if (query.status) where.status = query.status;
    if (query.source) where.source = query.source;
    if (query.assignedToId) where.assignedToId = query.assignedToId;

    if (query.search) {
      where.OR = [
        { leadName: { contains: query.search, mode: 'insensitive' } },
        { companyName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          score: { select: { totalScore: true, tier: true } },
          _count: { select: { deals: true, activities: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit || 50,
        skip: query.offset || 0,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { data, total };
  }

  async findAllCursor(organizationId: string, query: CursorPaginationDto) {
    const where: Record<string, unknown> = { organizationId, deletedAt: null };

    if (query.search) {
      where.OR = [
        { leadName: { contains: query.search, mode: 'insensitive' } },
        { companyName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderBy = { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' };

    return cursorPaginate(this.prisma.lead, where, orderBy, {
      cursor: query.cursor,
      take: query.take,
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        score: { select: { totalScore: true, tier: true } },
        _count: { select: { deals: true, activities: true } },
      },
    });
  }

  async findOne(organizationId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        deals: {
          where: { deletedAt: null },
          include: {
            assignedTo: { select: { id: true, name: true } },
          },
        },
        activities: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { date: 'desc' },
          take: 20,
        },
        score: true,
      },
    });

    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async update(organizationId: string, id: string, dto: UpdateLeadDto) {
    await this.findOne(organizationId, id);

    return this.prisma.lead.update({
      where: { id },
      data: {
        leadName: dto.leadName,
        companyName: dto.companyName,
        email: dto.email,
        phone: dto.phone,
        source: dto.source,
        status: dto.status,
        notes: dto.notes,
        customFields: dto.customFields,
        assignedToId: dto.assignedToId,
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        score: true,
      },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);

    await this.prisma.lead.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Lead deleted' };
  }

  async convertToCustomer(
    organizationId: string,
    id: string,
    options?: { createDeal?: boolean; dealValue?: number },
  ) {
    const lead = await this.findOne(organizationId, id);

    if (lead.convertedToCustomerId) {
      throw new BadRequestException('Lead has already been converted');
    }

    // Check if customer with same email already exists
    if (lead.email) {
      const existingCustomer = await this.prisma.customer.findFirst({
        where: { organizationId, email: lead.email, deletedAt: null },
      });
      if (existingCustomer) {
        throw new BadRequestException('A customer with this email already exists');
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Create customer
      const customer = await tx.customer.create({
        data: {
          name: lead.companyName || lead.leadName,
          email: lead.email,
          phone: lead.phone,
          organizationId,
        },
      });

      // Update lead
      await tx.lead.update({
        where: { id },
        data: {
          status: LeadStatus.QUALIFIED,
          convertedToCustomerId: customer.id,
          convertedAt: new Date(),
        },
      });

      let deal = null;

      // Optionally create a deal
      if (options?.createDeal) {
        deal = await tx.deal.create({
          data: {
            dealName: `Deal for ${customer.name}`,
            leadId: id,
            customerId: customer.id,
            expectedAmount: options.dealValue || 0,
            assignedToId: lead.assignedToId,
            organizationId,
          },
        });
      }

      return { customer, deal };
    });

    return result;
  }

  async getLeadStats(organizationId: string) {
    const [byStatus, bySource, total, recentLeads] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['status'],
        where: { organizationId, deletedAt: null },
        _count: { id: true },
      }),
      this.prisma.lead.groupBy({
        by: ['source'],
        where: { organizationId, deletedAt: null },
        _count: { id: true },
      }),
      this.prisma.lead.count({
        where: { organizationId, deletedAt: null },
      }),
      this.prisma.lead.count({
        where: {
          organizationId,
          deletedAt: null,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    // Conversion rate
    const qualified = byStatus.find((s) => s.status === LeadStatus.QUALIFIED)?._count.id || 0;
    const conversionRate = total > 0 ? Math.round((qualified / total) * 1000) / 10 : 0;

    return {
      total,
      recentLeads,
      conversionRate,
      byStatus: byStatus.map((l) => ({
        status: l.status,
        count: l._count.id,
      })),
      bySource: bySource.map((s) => ({
        source: s.source,
        count: s._count.id,
      })),
    };
  }

  async assignLead(organizationId: string, id: string, assignedToId: string) {
    await this.findOne(organizationId, id);

    return this.prisma.lead.update({
      where: { id },
      data: { assignedToId },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async bulkAssign(organizationId: string, leadIds: string[], assignedToId: string) {
    await this.prisma.lead.updateMany({
      where: {
        id: { in: leadIds },
        organizationId,
        deletedAt: null,
      },
      data: { assignedToId },
    });

    return { updated: leadIds.length };
  }
}
