import { Prisma } from '@prisma/client';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { BulkResultDto } from '../../../common/dto/bulk-result.dto';
import { runBulk } from '../../../common/utils/run-bulk';
import { AgingReportsService } from '../../reports/services/aging-reports.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';

type CustomerAddress = CreateCustomerDto['billingAddress'];

/** The flat billing and shipping columns of the two address objects (undefined leaves a column). */
function flatAddresses(billing: CustomerAddress, shipping: CustomerAddress) {
  return {
    billingStreet: billing?.street,
    billingCity: billing?.city,
    billingState: billing?.state,
    billingPostalCode: billing?.postalCode,
    billingCountry: billing?.country,
    shippingStreet: shipping?.street,
    shippingCity: shipping?.city,
    shippingState: shipping?.state,
    shippingPostalCode: shipping?.postalCode,
    shippingCountry: shipping?.country,
  };
}

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private agingReports: AgingReportsService,
  ) {}

  async create(organizationId: string, createCustomerDto: CreateCustomerDto) {
    // The address objects map to flat columns; Prisma rejects them as fields of their own.
    const { billingAddress, shippingAddress, ...fields } = createCustomerDto;
    const customer = await this.prisma.customer.create({
      data: {
        ...fields,
        // A customer without an explicit currency uses the org base currency, never the
        // column's USD default (audit B5/F4).
        currency: fields.currency ?? (await this.baseCurrency(organizationId)),
        ...flatAddresses(billingAddress, shippingAddress),
        organizationId,
      },
    });

    return customer;
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

    const where = {
      organizationId,
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { displayName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.customer.count({ where }),
    ]);

    // Batch balance calculation: single groupBy query instead of N+1
    const customerIds = customers.map((c) => c.id);
    const balances =
      customerIds.length > 0
        ? await this.prisma.invoice.groupBy({
            by: ['customerId'],
            where: {
              customerId: { in: customerIds },
              deletedAt: null,
              status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
            },
            _sum: { balanceDue: true },
          })
        : [];

    const balanceMap = new Map(
      balances.map((b) => [b.customerId, b._sum.balanceDue?.toFixed(4) ?? '0.0000']),
    );

    const customersWithBalance = customers.map((customer) => ({
      ...customer,
      outstandingBalance: balanceMap.get(customer.id) ?? '0.0000',
    }));

    return {
      data: customersWithBalance,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findAllCursor(organizationId: string, query: CursorPaginationDto) {
    const { cursor, take = 50, search, sortBy = 'name', sortOrder = 'asc' } = query;

    const where: Prisma.CustomerWhereInput = { organizationId, deletedAt: null };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' as const } },
        { displayName: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
        { phone: { contains: search, mode: 'insensitive' as const } },
      ];
    }

    return cursorPaginate(
      this.prisma.customer,
      where,
      { [sortBy]: sortOrder },
      {
        cursor,
        take,
      },
    );
  }

  async findOne(organizationId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const outstandingBalance = await this.calculateOutstandingBalance(id);

    return { ...customer, outstandingBalance };
  }

  /**
   * Statement of account for the sales UI. Delegates to the reconciling reports service so the
   * figures match the AR ledger (exact Decimal, voids on their own date). Defaults to the full
   * history up to today.
   */
  async getStatement(organizationId: string, id: string, startDate?: string, endDate?: string) {
    const statement = await this.agingReports.getCustomerStatement(
      organizationId,
      id,
      startDate || '2000-01-01',
      endDate || new Date().toISOString().slice(0, 10),
    );
    if (!statement) throw new NotFoundException('Customer not found');
    return statement;
  }

  async update(organizationId: string, id: string, updateCustomerDto: UpdateCustomerDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const { billingAddress, shippingAddress, ...fields } = updateCustomerDto;
    const updatedCustomer = await this.prisma.customer.update({
      where: { id },
      data: { ...fields, ...flatAddresses(billingAddress, shippingAddress) },
    });

    return updatedCustomer;
  }

  async remove(organizationId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        invoices: { take: 1, where: { deletedAt: null } },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (customer.invoices.length > 0) {
      throw new BadRequestException('Cannot delete customer with existing invoices');
    }

    // Soft delete
    await this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Customer deleted successfully' };
  }

  // === Bulk Operations ===

  async bulkDelete(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.remove(organizationId, id));
  }

  private async calculateOutstandingBalance(customerId: string): Promise<string> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        customerId,
        deletedAt: null,
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
      select: { balanceDue: true },
    });

    const total = invoices.reduce(
      (sum, invoice) => sum.add(invoice.balanceDue),
      new Prisma.Decimal(0),
    );

    return total.toFixed(4);
  }
}
