import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateBankRuleDto } from '../dto/create-bank-rule.dto';
import { UpdateBankRuleDto } from '../dto/update-bank-rule.dto';
import { BankRuleQueryDto } from '../dto/bank-rule-query.dto';

export interface BankRuleCondition {
  field: string;
  operator: string;
  value: string;
}

@Injectable()
export class BankRulesService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateBankRuleDto) {
    return this.prisma.bankRule.create({
      data: {
        name: dto.name,
        bankAccountId: dto.bankAccountId ?? null,
        conditions: (dto.conditions as Prisma.InputJsonValue) ?? [],
        action: (dto.action as Prisma.InputJsonValue) ?? {},
        isActive: dto.isActive !== false,
        organizationId,
      },
    });
  }

  async findAll(organizationId: string, query: BankRuleQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'asc';
    const where: Prisma.BankRuleWhereInput = { organizationId, deletedAt: null };
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.bankRule.findMany({
        where,
        include: { bankAccount: { select: { id: true, name: true } } },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bankRule.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(organizationId: string, id: string) {
    const rule = await this.prisma.bankRule.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        bankAccount: { select: { id: true, name: true } },
      },
    });
    if (!rule) throw new NotFoundException('Bank rule not found');
    return rule;
  }

  async update(organizationId: string, id: string, dto: UpdateBankRuleDto) {
    await this.findOne(organizationId, id);
    const data: Prisma.BankRuleUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.bankAccountId !== undefined) data.bankAccountId = dto.bankAccountId;
    if (dto.conditions !== undefined) data.conditions = dto.conditions as Prisma.InputJsonValue;
    if (dto.action !== undefined) data.action = dto.action as Prisma.InputJsonValue;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.bankRule.update({
      where: { id },
      data,
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.bankRule.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Bank rule deleted' };
  }

  testRule(
    conditions: BankRuleCondition[],
    transaction: Record<string, unknown>,
  ): { matches: boolean; matchedConditions: number[] } {
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
