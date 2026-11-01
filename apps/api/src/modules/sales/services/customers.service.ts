import { Prisma } from '@prisma/client';
import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { BulkResultDto } from '../../../common/dto/bulk-result.dto';
import { runBulk } from '../../../common/utils/run-bulk';
import { AgingReportsService } from '../../reports/services/aging-reports.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { WebhookOutboxService } from '../../integrations/services/webhook-outbox.service';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { RECEIVABLE_INVOICE_STATUSES } from './invoices.service';
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

/** Customer columns a list may sort by; anything else (e.g. the computed balance) sorts by name. */
const SORTABLE_FIELDS = new Set(['name', 'displayName', 'email', 'phone', 'currency', 'createdAt']);

function customerSort(sortBy: string | undefined): string {
  return sortBy && SORTABLE_FIELDS.has(sortBy) ? sortBy : 'name';
}

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private agingReports: AgingReportsService,
    @Optional() private outbox?: WebhookOutboxService,
  ) {}

  /**
   * Creates a customer and its customer.created outbox event in one transaction. Pass
   * `options.tx` to compose it into a caller's transaction (integration idempotency, audit F1).
   */
  async create(
    organizationId: string,
    createCustomerDto: CreateCustomerDto,
    options: { tx?: Prisma.TransactionClient } = {},
  ) {
    // The address objects map to flat columns; Prisma rejects them as fields of their own.
    const { billingAddress, shippingAddress, ...fields } = createCustomerDto;
    const run = async (tx: Prisma.TransactionClient) => {
      await this.assertPriceListBelongsToOrg(tx, organizationId, fields.priceListId);
      const customer = await tx.customer.create({
        data: {
          ...fields,
          // Without an explicit currency a customer uses the org base currency, never the
          // column's USD default (FlowLine and web alike; audit B5/F4).
          currency: fields.currency ?? (await this.baseCurrency(tx, organizationId)),
          ...flatAddresses(billingAddress, shippingAddress),
          organizationId,
        },
      });
      await this.outbox?.customerCreated(tx, organizationId, customer);
      return customer;
    };
    return options.tx ? run(options.tx) : this.prisma.$transaction(run);
  }

  /** A customer may only point at a price list of its own organization. */
  private async assertPriceListBelongsToOrg(
    tx: Prisma.TransactionClient,
    organizationId: string,
    priceListId: string | null | undefined,
  ): Promise<void> {
    if (!priceListId) return;
    const priceList = await tx.priceList.findFirst({
      where: { id: priceListId, organizationId },
      select: { id: true },
    });
    if (!priceList) throw new BadRequestException('Price list not found');
  }

  private async baseCurrency(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<string> {
    const org = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org.baseCurrency;
  }

  async findAll(organizationId: string, query: PaginationDto) {
    const { page = 1, limit = 20, search, sortOrder = 'asc' } = query;
    const sortBy = customerSort(query.sortBy);

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

    return {
      data: await this.withOutstandingBalances(organizationId, customers),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findAllCursor(organizationId: string, query: CursorPaginationDto) {
    const { cursor, take = 50, search, sortOrder = 'asc' } = query;
    const sortBy = customerSort(query.sortBy);

    const where: Prisma.CustomerWhereInput = { organizationId, deletedAt: null };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' as const } },
        { displayName: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
        { phone: { contains: search, mode: 'insensitive' as const } },
      ];
    }

    const page = await cursorPaginate(
      this.prisma.customer,
      where,
      { [sortBy]: sortOrder },
      {
        cursor,
        take,
      },
    );
    // The customer list reads this endpoint: without the balance every row showed 0.00 (#668).
    return { ...page, data: await this.withOutstandingBalances(organizationId, page.data) };
  }

  /** Each customer's open invoice balance, in one groupBy query for the whole page. */
  private async withOutstandingBalances<T extends { id: string }>(
    organizationId: string,
    customers: T[],
  ): Promise<Array<T & { outstandingBalance: string }>> {
    const customerIds = customers.map((c) => c.id);
    const balances =
      customerIds.length > 0
        ? await this.prisma.invoice.groupBy({
            by: ['customerId'],
            where: {
              organizationId,
              customerId: { in: customerIds },
              deletedAt: null,
              status: { in: RECEIVABLE_INVOICE_STATUSES },
            },
            _sum: { balanceDue: true },
          })
        : [];
    const balanceMap = new Map(
      balances.map((b) => [b.customerId, b._sum.balanceDue?.toFixed(4) ?? '0.0000']),
    );
    return customers.map((customer) => ({
      ...customer,
      outstandingBalance: balanceMap.get(customer.id) ?? '0.0000',
    }));
  }

  async findOne(organizationId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const outstandingBalance = await this.calculateOutstandingBalance(organizationId, id);

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
    // The change and its customer.updated outbox event commit together (audit F3).
    return this.prisma.$transaction(async (tx) => {
      await this.assertPriceListBelongsToOrg(tx, organizationId, fields.priceListId);
      const updatedCustomer = await tx.customer.update({
        where: { id },
        data: { ...fields, ...flatAddresses(billingAddress, shippingAddress) },
      });
      await this.outbox?.customerEvent(tx, organizationId, 'customer.updated', updatedCustomer);
      return updatedCustomer;
    });
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

  private async calculateOutstandingBalance(
    organizationId: string,
    customerId: string,
  ): Promise<string> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        customerId,
        deletedAt: null,
        status: { in: RECEIVABLE_INVOICE_STATUSES },
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
