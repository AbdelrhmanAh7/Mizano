import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma, TaxType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { CreateTaxRateDto } from '../dto/create-tax-rate.dto';
import { UpdateTaxRateDto } from '../dto/update-tax-rate.dto';
import { TaxRateQueryDto } from '../dto/tax-rate-query.dto';

@Injectable()
export class TaxRatesService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateTaxRateDto) {
    // Check for duplicate name
    const existing = await this.prisma.taxRate.findFirst({
      where: { organizationId, name: dto.name },
    });
    if (existing) throw new BadRequestException('Tax rate with this name already exists');

    return this.prisma.taxRate.create({
      data: {
        name: dto.name,
        description: dto.description,
        rate: new Decimal(dto.rate),
        type: dto.type || TaxType.BOTH,
        linkedAccountId: dto.linkedAccountId,
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
        collectAccountId: dto.collectAccountId,
        organizationId,
      },
    });
  }

  async findAll(organizationId: string, query: TaxRateQueryDto) {
    const where: Prisma.TaxRateWhereInput = { organizationId, deletedAt: null };
    if (query.type) where.type = query.type;
    if (query.isActive !== undefined) where.isActive = query.isActive;

    const data = await this.prisma.taxRate.findMany({
      where,
      include: {
        linkedAccount: { select: { id: true, code: true, name: true } },
        collectAccount: { select: { id: true, code: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    return { data, meta: { total: data.length } };
  }

  async findOne(organizationId: string, id: string) {
    const taxRate = await this.prisma.taxRate.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        linkedAccount: true,
        collectAccount: true,
      },
    });
    if (!taxRate) throw new NotFoundException('Tax rate not found');
    return taxRate;
  }

  async update(organizationId: string, id: string, dto: UpdateTaxRateDto) {
    await this.findOne(organizationId, id);

    const data: Record<string, unknown> = { ...dto };
    if (dto.rate !== undefined) data.rate = new Decimal(dto.rate);

    // If setting as default, unset other defaults
    if (dto.isDefault) {
      await this.prisma.taxRate.updateMany({
        where: { organizationId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.taxRate.update({
      where: { id },
      data,
    });
  }

  async remove(organizationId: string, id: string) {
    const taxRate = await this.prisma.taxRate.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!taxRate) throw new NotFoundException('Tax rate not found');

    // Check if used in any transactions
    const invoiceLinesCount = await this.prisma.invoiceLine.count({ where: { taxRateId: id } });
    const billLinesCount = await this.prisma.billLine.count({ where: { taxRateId: id } });

    if (invoiceLinesCount > 0 || billLinesCount > 0) {
      throw new BadRequestException('Tax rate is in use and cannot be deleted');
    }

    await this.prisma.taxRate.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Tax rate deleted' };
  }

  async getDefaultTaxRate(organizationId: string) {
    return this.prisma.taxRate.findFirst({
      where: { organizationId, isDefault: true, isActive: true, deletedAt: null },
    });
  }

  async seedDefaultTaxRates(organizationId: string, linkedAccountId: string) {
    const defaults = [
      { name: 'Standard Rate (15%)', rate: 15, type: TaxType.BOTH, isDefault: true },
      { name: 'Zero Rate (0%)', rate: 0, type: TaxType.BOTH, isDefault: false },
      { name: 'Sales Tax', rate: 0, type: TaxType.SALES, isDefault: false },
    ];

    for (const tax of defaults) {
      const existing = await this.prisma.taxRate.findFirst({
        where: { organizationId, name: tax.name },
      });
      if (!existing) {
        await this.prisma.taxRate.create({
          data: {
            name: tax.name,
            rate: new Decimal(tax.rate),
            type: tax.type,
            linkedAccountId,
            isDefault: tax.isDefault,
            isActive: true,
            organizationId,
          },
        });
      }
    }
    return { message: 'Default tax rates seeded' };
  }
}
