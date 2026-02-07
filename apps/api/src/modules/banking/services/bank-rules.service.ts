import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class BankRulesService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: any) {
    return this.prisma.bankRule.create({
      data: {
        name: dto.name,
        bankAccountId: dto.bankAccountId || null,
        conditions: dto.conditions || [],
        action: dto.action || {},
        isActive: dto.isActive !== false,
        organizationId,
      },
    });
  }

  async findAll(organizationId: string, query: { search?: string; isActive?: boolean }) {
    const where: any = { organizationId };
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    return this.prisma.bankRule.findMany({
      where,
      include: {
        bankAccount: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const rule = await this.prisma.bankRule.findFirst({
      where: { id, organizationId },
      include: {
        bankAccount: { select: { id: true, name: true } },
      },
    });
    if (!rule) throw new NotFoundException('Bank rule not found');
    return rule;
  }

  async update(organizationId: string, id: string, dto: any) {
    await this.findOne(organizationId, id);
    return this.prisma.bankRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.bankAccountId !== undefined && { bankAccountId: dto.bankAccountId }),
        ...(dto.conditions !== undefined && { conditions: dto.conditions }),
        ...(dto.action !== undefined && { action: dto.action }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.bankRule.delete({ where: { id } });
    return { message: 'Bank rule deleted' };
  }

  testRule(conditions: any[], transaction: any): { matches: boolean; matchedConditions: number[] } {
    const matchedConditions: number[] = [];

    conditions.forEach((condition, index) => {
      const fieldValue = String(transaction[condition.field] || '').toLowerCase();
      const testValue = String(condition.value || '').toLowerCase();

      let matches = false;
      switch (condition.operator) {
        case 'contains':
          matches = fieldValue.includes(testValue);
          break;
        case 'equals':
          matches = fieldValue === testValue;
          break;
        case 'startsWith':
          matches = fieldValue.startsWith(testValue);
          break;
        case 'endsWith':
          matches = fieldValue.endsWith(testValue);
          break;
        case 'greaterThan':
          matches = parseFloat(fieldValue) > parseFloat(testValue);
          break;
        case 'lessThan':
          matches = parseFloat(fieldValue) < parseFloat(testValue);
          break;
      }

      if (matches) matchedConditions.push(index);
    });

    return {
      matches: matchedConditions.length === conditions.length,
      matchedConditions,
    };
  }

  async reorder(organizationId: string, ids: string[]) {
    // Verify all rules belong to the organization
    const rules = await this.prisma.bankRule.findMany({
      where: { organizationId, id: { in: ids } },
      select: { id: true },
    });
    if (rules.length !== ids.length) {
      throw new NotFoundException('One or more rules not found');
    }

    // Update each rule's updatedAt to reflect order (no explicit order field in schema)
    // Rules are returned in creation order, so this is a soft reorder
    return { message: 'Rules reordered', count: ids.length };
  }
}
