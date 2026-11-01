import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { BulkResultDto } from '../../../common/dto/bulk-result.dto';
import { runBulk } from '../../../common/utils/run-bulk';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateVendorDto } from '../dto/create-vendor.dto';
import { UpdateVendorDto } from '../dto/update-vendor.dto';

@Injectable()
export class VendorsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateVendorDto) {
    const { billingAddress, ...rest } = dto;
    return this.prisma.vendor.create({
      data: {
        ...rest,
        // Without an explicit currency a vendor uses the org base currency, never the USD
        // schema default (#83), like customers.
        currency: rest.currency || (await this.baseCurrency(organizationId)),
        billingStreet: billingAddress?.street,
        billingCity: billingAddress?.city,
        billingState: billingAddress?.state,
        billingPostalCode: billingAddress?.postalCode,
        billingCountry: billingAddress?.country,
        organizationId,
      },
    });
  }

  private async baseCurrency(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org.baseCurrency;
  }

  async findAll(organizationId: string, query: PaginationDto) {
    const { page = 1, limit = 20, search, sortBy = 'name', sortOrder = 'asc' } = query;
    const where: Prisma.VendorWhereInput = { organizationId, deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
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
    const where: Prisma.VendorWhereInput = { organizationId, deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
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

  async update(organizationId: string, id: string, dto: UpdateVendorDto) {
    await this.findOne(organizationId, id);
    const { billingAddress, ...rest } = dto;
    const data: Prisma.VendorUpdateInput = {
      ...rest,
      ...(billingAddress && {
        billingStreet: billingAddress.street,
        billingCity: billingAddress.city,
        billingState: billingAddress.state,
        billingPostalCode: billingAddress.postalCode,
        billingCountry: billingAddress.country,
      }),
    };
    return this.prisma.vendor.update({ where: { id }, data });
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

  // Same command as the single-record route: a vendor with bills or an already deleted one is
  // reported per record in `failures` instead of being skipped silently.
  async bulkDelete(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.remove(organizationId, id));
  }
}
