import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LeadStatus, LeadSource } from '@prisma/client';

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: any, userId: string) {
    return this.prisma.lead.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        company: dto.company,
        source: dto.source || LeadSource.WEBSITE,
        status: dto.status || LeadStatus.NEW,
        notes: dto.notes,
        assignedToId: dto.assignedToId || userId,
        organizationId,
      },
      include: {
        assignedTo: { select: { id: true, name: true } },
      },
    });
  }

  async findAll(organizationId: string, query: { status?: string; assignedToId?: string; source?: string }) {
    const where: any = { organizationId };
    if (query.status) where.status = query.status;
    if (query.assignedToId) where.assignedToId = query.assignedToId;
    if (query.source) where.source = query.source;

    return this.prisma.lead.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, organizationId },
      include: {
        assignedTo: true,
        deals: true,
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async update(organizationId: string, id: string, dto: any) {
    await this.findOne(organizationId, id);

    const data: any = { ...dto };

    return this.prisma.lead.update({
      where: { id },
      data,
      include: {
        assignedTo: { select: { id: true, name: true } },
      },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.lead.delete({ where: { id } });
    return { message: 'Lead deleted' };
  }

  async convertToCustomer(organizationId: string, id: string) {
    const lead = await this.findOne(organizationId, id);

    // Check if customer already exists
    const existingCustomer = await this.prisma.customer.findFirst({
      where: { organizationId, email: lead.email, deletedAt: null },
    });
    if (existingCustomer) {
      throw new BadRequestException('A customer with this email already exists');
    }

    // Create customer
    const customer = await this.prisma.customer.create({
      data: {
        name: lead.company || lead.name,
        email: lead.email,
        phone: lead.phone,
        organizationId,
      },
    });

    // Update lead status to QUALIFIED (closest status to "converted")
    await this.prisma.lead.update({
      where: { id },
      data: { status: LeadStatus.QUALIFIED },
    });

    return { lead, customer };
  }

  async getLeadStats(organizationId: string) {
    const leads = await this.prisma.lead.groupBy({
      by: ['status'],
      where: { organizationId },
      _count: { id: true },
    });

    const bySource = await this.prisma.lead.groupBy({
      by: ['source'],
      where: { organizationId },
      _count: { id: true },
    });

    return {
      byStatus: leads.map((l) => ({
        status: l.status,
        count: l._count.id,
      })),
      bySource: bySource.map((s) => ({ source: s.source, count: s._count.id })),
    };
  }
}
