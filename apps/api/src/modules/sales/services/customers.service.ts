import { Prisma } from '@prisma/client';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, createCustomerDto: CreateCustomerDto) {
    const customer = await this.prisma.customer.create({
      data: {
        ...createCustomerDto,
        billingStreet: createCustomerDto.billingAddress?.street,
        billingCity: createCustomerDto.billingAddress?.city,
        billingState: createCustomerDto.billingAddress?.state,
        billingPostalCode: createCustomerDto.billingAddress?.postalCode,
        billingCountry: createCustomerDto.billingAddress?.country,
        shippingStreet: createCustomerDto.shippingAddress?.street,
        shippingCity: createCustomerDto.shippingAddress?.city,
        shippingState: createCustomerDto.shippingAddress?.state,
        shippingPostalCode: createCustomerDto.shippingAddress?.postalCode,
        shippingCountry: createCustomerDto.shippingAddress?.country,
        organizationId,
      },
    });

    return customer;
  }

  async findAll(organizationId: string, query: PaginationDto) {
    const { page = 1, limit = 20, search, sortBy = 'name', sortOrder = 'asc' } = query;

    const where = {
      organizationId,
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
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

  async getStatement(organizationId: string, id: string) {
    const customer = await this.findOne(organizationId, id);

    const [invoices, payments, creditNotes] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { customerId: id, deletedAt: null },
        orderBy: { date: 'desc' },
        select: {
          id: true,
          invoiceNumber: true,
          date: true,
          dueDate: true,
          grandTotal: true,
          balanceDue: true,
          status: true,
        },
      }),
      this.prisma.paymentReceived.findMany({
        where: { customerId: id, deletedAt: null },
        orderBy: { date: 'desc' },
        select: {
          id: true,
          paymentNumber: true,
          date: true,
          amount: true,
          paymentMode: true,
        },
      }),
      this.prisma.creditNote.findMany({
        where: { customerId: id, deletedAt: null },
        orderBy: { date: 'desc' },
        select: {
          id: true,
          creditNoteNumber: true,
          date: true,
          amount: true,
          type: true,
        },
      }),
    ]);

    return {
      customer,
      invoices,
      payments,
      creditNotes,
    };
  }

  async update(organizationId: string, id: string, updateCustomerDto: UpdateCustomerDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const updatedCustomer = await this.prisma.customer.update({
      where: { id },
      data: {
        ...updateCustomerDto,
        billingStreet: updateCustomerDto.billingAddress?.street,
        billingCity: updateCustomerDto.billingAddress?.city,
        billingState: updateCustomerDto.billingAddress?.state,
        billingPostalCode: updateCustomerDto.billingAddress?.postalCode,
        billingCountry: updateCustomerDto.billingAddress?.country,
        shippingStreet: updateCustomerDto.shippingAddress?.street,
        shippingCity: updateCustomerDto.shippingAddress?.city,
        shippingState: updateCustomerDto.shippingAddress?.state,
        shippingPostalCode: updateCustomerDto.shippingAddress?.postalCode,
        shippingCountry: updateCustomerDto.shippingAddress?.country,
      },
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
      (sum, invoice) => sum + parseFloat(invoice.balanceDue.toString()),
      0,
    );

    return total.toFixed(4);
  }
}
