import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class VendorsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: any) {
    return this.prisma.vendor.create({
      data: {
        ...dto,
        billingStreet: dto.billingAddress?.street,
        billingCity: dto.billingAddress?.city,
        billingState: dto.billingAddress?.state,
        billingPostalCode: dto.billingAddress?.postalCode,
        billingCountry: dto.billingAddress?.country,
        organizationId,
      },
    });
  }

  async findAll(organizationId: string, query: PaginationDto) {
    const { page = 1, limit = 20, search, sortBy = 'name', sortOrder = 'asc' } = query;
    const where: any = { organizationId, deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [vendors, total] = await Promise.all([
      this.prisma.vendor.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vendor.count({ where }),
    ]);
    return { data: vendors, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findAllCursor(organizationId: string, query: CursorPaginationDto) {
    const { cursor, take = 50, search, sortBy = 'name', sortOrder = 'asc' } = query;
    const where: any = { organizationId, deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    return cursorPaginate(
      this.prisma.vendor,
      where,
      { [sortBy]: sortOrder },
      {
        cursor,
        take,
      },
    );
  }

  async findOne(organizationId: string, id: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async update(organizationId: string, id: string, dto: any) {
    await this.findOne(organizationId, id);
    return this.prisma.vendor.update({ where: { id }, data: dto });
  }

  async remove(organizationId: string, id: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { bills: { take: 1, where: { deletedAt: null } } },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (vendor.bills.length > 0) throw new BadRequestException('Cannot delete vendor with bills');
    await this.prisma.vendor.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Vendor deleted' };
  }
}
