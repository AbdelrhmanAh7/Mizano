import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateAccountDto } from '../dto/create-account.dto';
import { UpdateAccountDto } from '../dto/update-account.dto';

type DefaultAccountSettings = {
  defaultCashAccountId?: string;
  defaultBankAccountId?: string;
  defaultArAccountId?: string;
  defaultApAccountId?: string;
  defaultVatPayableAccountId?: string;
  defaultVatReceivableAccountId?: string;
  defaultRevenueAccountId?: string;
};

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, createAccountDto: CreateAccountDto) {
    const { code, name, type, parentId, currency, description } = createAccountDto;

    // Check if code already exists
    const existingAccount = await this.prisma.account.findFirst({
      where: { code, organizationId },
    });

    if (existingAccount) {
      throw new ConflictException('Account code already exists');
    }

    // Verify parent exists if specified
    if (parentId) {
      const parent = await this.prisma.account.findFirst({
        where: { id: parentId, organizationId },
      });

      if (!parent) {
        throw new BadRequestException('Parent account not found');
      }

      if (parent.type !== type) {
        throw new BadRequestException('Child account type must match parent account type');
      }
    }

    const account = await this.prisma.account.create({
      data: {
        code,
        name,
        type,
        parentId,
        currency: currency || 'USD',
        description,
        organizationId,
      },
      include: {
        parent: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    return account;
  }

  async findAll(organizationId: string, query: PaginationDto) {
    const { page = 1, limit = 100, search, sortBy = 'code', sortOrder = 'asc', type } = query;

    const where: Prisma.AccountWhereInput = {
      organizationId,
      deletedAt: null,
      ...(type && { type: type as AccountType }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { code: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [accounts, total] = await Promise.all([
      this.prisma.account.findMany({
        where,
        include: {
          parent: {
            select: { id: true, code: true, name: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.account.count({ where }),
    ]);

    return {
      data: accounts,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findAllCursor(organizationId: string, query: CursorPaginationDto) {
    const { cursor, take, search, sortBy = 'code', sortOrder = 'asc' } = query;
    const where: Prisma.AccountWhereInput = { organizationId, deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }
    return cursorPaginate(
      this.prisma.account,
      where,
      { [sortBy]: sortOrder },
      {
        cursor,
        take,
        include: { parent: { select: { id: true, code: true, name: true } } },
      },
    );
  }

  async getTree(organizationId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { organizationId, parentId: null, deletedAt: null },
      include: {
        children: {
          include: {
            children: {
              include: {
                children: true,
              },
            },
          },
        },
      },
      orderBy: { code: 'asc' },
    });

    return accounts;
  }

  async findByType(organizationId: string, type: string) {
    const accountType = type.toUpperCase() as AccountType;

    const accounts = await this.prisma.account.findMany({
      where: { organizationId, type: accountType, isActive: true, deletedAt: null },
      orderBy: { code: 'asc' },
    });

    return accounts;
  }

  async findOne(organizationId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        parent: {
          select: { id: true, code: true, name: true },
        },
        children: {
          select: { id: true, code: true, name: true, type: true },
        },
      },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    return account;
  }

  async update(organizationId: string, id: string, updateAccountDto: UpdateAccountDto) {
    const account = await this.prisma.account.findFirst({
      where: { id, organizationId },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    // System accounts cannot be modified
    if (account.isSystem) {
      throw new BadRequestException('System accounts cannot be modified');
    }

    // Check code uniqueness if changing
    if (updateAccountDto.code && updateAccountDto.code !== account.code) {
      const existingAccount = await this.prisma.account.findFirst({
        where: { code: updateAccountDto.code, organizationId, id: { not: id } },
      });

      if (existingAccount) {
        throw new ConflictException('Account code already exists');
      }
    }

    // Verify new parent if changing
    if (updateAccountDto.parentId) {
      // Prevent circular reference
      if (updateAccountDto.parentId === id) {
        throw new BadRequestException('Account cannot be its own parent');
      }

      const parent = await this.prisma.account.findFirst({
        where: { id: updateAccountDto.parentId, organizationId },
      });

      if (!parent) {
        throw new BadRequestException('Parent account not found');
      }

      if (parent.type !== account.type) {
        throw new BadRequestException('Child account type must match parent account type');
      }
    }

    const updatedAccount = await this.prisma.account.update({
      where: { id },
      data: updateAccountDto,
      include: {
        parent: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    return updatedAccount;
  }

  async remove(organizationId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, organizationId },
      include: {
        _count: { select: { children: true, journalLines: true } },
      },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    if (account.isSystem) {
      throw new BadRequestException('System accounts cannot be deleted');
    }

    if (account._count.children > 0) {
      throw new BadRequestException('Cannot delete account with child accounts');
    }

    if (account._count.journalLines > 0) {
      throw new BadRequestException('Cannot delete account with transactions');
    }

    await this.prisma.account.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Account deleted successfully' };
  }

  async getBalance(organizationId: string, accountId: string, asOfDate?: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, organizationId, deletedAt: null },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const dateFilter: Prisma.JournalWhereInput = {};
    if (asOfDate) {
      dateFilter.date = { lte: new Date(asOfDate) };
    }

    const aggregation = await this.prisma.journalLine.aggregate({
      where: {
        accountId,
        journal: {
          organizationId,
          isPosted: true,
          deletedAt: null,
          ...dateFilter,
        },
      },
      _sum: {
        debit: true,
        credit: true,
      },
    });

    const totalDebits = new Decimal(aggregation._sum.debit?.toString() || '0');
    const totalCredits = new Decimal(aggregation._sum.credit?.toString() || '0');
    const openingBalance = new Decimal(account.openingBalance?.toString() || '0');

    // Debit-normal: ASSET, EXPENSE; Credit-normal: LIABILITY, EQUITY, INCOME, REVENUE
    const debitNormalTypes: string[] = [AccountType.ASSET, AccountType.EXPENSE];
    const balance = debitNormalTypes.includes(account.type)
      ? totalDebits.minus(totalCredits).plus(openingBalance)
      : totalCredits.minus(totalDebits).plus(openingBalance);

    return {
      accountId,
      accountCode: account.code,
      accountName: account.name,
      accountType: account.type,
      balance,
      totalDebits,
      totalCredits,
      openingBalance,
      asOfDate: asOfDate || null,
    };
  }

  async seedDefaultAccounts(organizationId: string) {
    return this.seedIndustryAccounts(organizationId, 'services');
  }

  async seedIndustryAccounts(
    organizationId: string,
    industry: 'services' | 'retail' | 'construction',
  ) {
    const templates: Record<
      string,
      Array<{ code: string; name: string; type: AccountType; parentId: null }>
    > = {
      services: this.getServicesCOA(),
      retail: this.getRetailCOA(),
      construction: this.getConstructionCOA(),
    };

    const accounts = templates[industry] || templates.services;

    const createdAccounts = await this.prisma.$transaction(
      accounts.map((account) =>
        this.prisma.account.upsert({
          where: {
            code_organizationId: {
              code: account.code,
              organizationId,
            },
          },
          update: {},
          create: {
            ...account,
            organizationId,
            isSystem: true,
          },
        }),
      ),
    );

    await this.linkDefaultAccounts(organizationId, industry, createdAccounts);

    return {
      message: `Created ${createdAccounts.length} ${industry} industry accounts`,
      accounts: createdAccounts,
    };
  }

  /**
   * Template account code for each organization default. Templates are not numbered
   * identically, so each one declares its own mapping.
   */
  private static readonly DEFAULT_ACCOUNT_CODES: Record<
    'services' | 'retail' | 'construction',
    Partial<Record<keyof DefaultAccountSettings, string>>
  > = {
    services: {
      defaultCashAccountId: '1000',
      defaultBankAccountId: '1010',
      defaultArAccountId: '1200',
      defaultApAccountId: '2000',
      defaultVatPayableAccountId: '2200',
      defaultVatReceivableAccountId: '2210',
      defaultRevenueAccountId: '4000',
    },
    retail: {
      defaultCashAccountId: '1000',
      defaultBankAccountId: '1010',
      defaultArAccountId: '1200',
      defaultApAccountId: '2000',
      defaultVatPayableAccountId: '2210',
      defaultVatReceivableAccountId: '2220',
      defaultRevenueAccountId: '4000',
    },
    construction: {
      defaultCashAccountId: '1000',
      defaultBankAccountId: '1010',
      defaultArAccountId: '1100',
      defaultApAccountId: '2000',
      defaultVatPayableAccountId: '2200',
      defaultVatReceivableAccountId: '2210',
      defaultRevenueAccountId: '4000',
    },
  };

  /** Fills organization default accounts that are still unset; never overwrites a choice. */
  private async linkDefaultAccounts(
    organizationId: string,
    industry: 'services' | 'retail' | 'construction',
    accounts: { id: string; code: string }[],
  ): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        defaultCashAccountId: true,
        defaultBankAccountId: true,
        defaultArAccountId: true,
        defaultApAccountId: true,
        defaultVatPayableAccountId: true,
        defaultVatReceivableAccountId: true,
        defaultRevenueAccountId: true,
      },
    });
    if (!org) return;

    const codes = AccountsService.DEFAULT_ACCOUNT_CODES[industry] ?? {};
    const data: DefaultAccountSettings = {};
    for (const [field, code] of Object.entries(codes) as [keyof DefaultAccountSettings, string][]) {
      const account = accounts.find((a) => a.code === code);
      if (account && !org[field]) data[field] = account.id;
    }
    if (Object.keys(data).length > 0) {
      await this.prisma.organization.update({ where: { id: organizationId }, data });
    }
  }

  private getServicesCOA() {
    return [
      // Assets (1xxx)
      { code: '1000', name: 'Cash', type: AccountType.ASSET, parentId: null },
      { code: '1010', name: 'Bank Account', type: AccountType.ASSET, parentId: null },
      { code: '1200', name: 'Accounts Receivable', type: AccountType.ASSET, parentId: null },
      { code: '1300', name: 'Prepaid Expenses', type: AccountType.ASSET, parentId: null },
      { code: '1500', name: 'Office Equipment', type: AccountType.ASSET, parentId: null },
      { code: '1510', name: 'Computer Equipment', type: AccountType.ASSET, parentId: null },
      { code: '1600', name: 'Accumulated Depreciation', type: AccountType.ASSET, parentId: null },

      // Liabilities (2xxx)
      { code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, parentId: null },
      { code: '2100', name: 'Accrued Expenses', type: AccountType.LIABILITY, parentId: null },
      { code: '2200', name: 'VAT Payable', type: AccountType.LIABILITY, parentId: null },
      { code: '2210', name: 'VAT Input', type: AccountType.LIABILITY, parentId: null },
      { code: '2300', name: 'Payroll Payable', type: AccountType.LIABILITY, parentId: null },
      { code: '2400', name: 'Unearned Revenue', type: AccountType.LIABILITY, parentId: null },

      // Equity (3xxx)
      { code: '3000', name: "Owner's Capital", type: AccountType.EQUITY, parentId: null },
      { code: '3100', name: 'Retained Earnings', type: AccountType.EQUITY, parentId: null },

      // Revenue (4xxx)
      { code: '4000', name: 'Consulting Revenue', type: AccountType.INCOME, parentId: null },
      { code: '4010', name: 'Project Revenue', type: AccountType.INCOME, parentId: null },
      { code: '4020', name: 'Retainer Revenue', type: AccountType.INCOME, parentId: null },
      { code: '4100', name: 'Other Income', type: AccountType.INCOME, parentId: null },

      // Cost of Services (5xxx)
      { code: '5000', name: 'Cost of Services', type: AccountType.EXPENSE, parentId: null },
      { code: '5100', name: 'Subcontractor Costs', type: AccountType.EXPENSE, parentId: null },

      // Operating Expenses (6xxx)
      { code: '6000', name: 'Salaries & Wages', type: AccountType.EXPENSE, parentId: null },
      { code: '6010', name: 'Employee Benefits', type: AccountType.EXPENSE, parentId: null },
      { code: '6100', name: 'Rent Expense', type: AccountType.EXPENSE, parentId: null },
      { code: '6110', name: 'Utilities', type: AccountType.EXPENSE, parentId: null },
      { code: '6200', name: 'Software & Subscriptions', type: AccountType.EXPENSE, parentId: null },
      { code: '6300', name: 'Travel & Entertainment', type: AccountType.EXPENSE, parentId: null },
      { code: '6400', name: 'Professional Services', type: AccountType.EXPENSE, parentId: null },
      { code: '6500', name: 'Marketing & Advertising', type: AccountType.EXPENSE, parentId: null },
      { code: '6600', name: 'Office Supplies', type: AccountType.EXPENSE, parentId: null },
      { code: '6700', name: 'Depreciation Expense', type: AccountType.EXPENSE, parentId: null },
      { code: '6800', name: 'Insurance', type: AccountType.EXPENSE, parentId: null },
      { code: '6900', name: 'Bank Charges', type: AccountType.EXPENSE, parentId: null },
      { code: '6999', name: 'Miscellaneous Expense', type: AccountType.EXPENSE, parentId: null },
    ];
  }

  private getRetailCOA() {
    return [
      // Assets (1xxx)
      { code: '1000', name: 'Cash', type: AccountType.ASSET, parentId: null },
      { code: '1010', name: 'Bank Account', type: AccountType.ASSET, parentId: null },
      { code: '1050', name: 'Petty Cash', type: AccountType.ASSET, parentId: null },
      { code: '1100', name: 'Inventory', type: AccountType.ASSET, parentId: null },
      { code: '1110', name: 'Inventory - Merchandise', type: AccountType.ASSET, parentId: null },
      { code: '1120', name: 'Inventory - Supplies', type: AccountType.ASSET, parentId: null },
      { code: '1200', name: 'Accounts Receivable', type: AccountType.ASSET, parentId: null },
      { code: '1300', name: 'Prepaid Expenses', type: AccountType.ASSET, parentId: null },
      { code: '1400', name: 'Store Equipment', type: AccountType.ASSET, parentId: null },
      { code: '1410', name: 'Display Fixtures', type: AccountType.ASSET, parentId: null },
      { code: '1420', name: 'Point of Sale Systems', type: AccountType.ASSET, parentId: null },
      { code: '1500', name: 'Leasehold Improvements', type: AccountType.ASSET, parentId: null },
      { code: '1600', name: 'Accumulated Depreciation', type: AccountType.ASSET, parentId: null },

      // Liabilities (2xxx)
      { code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, parentId: null },
      { code: '2100', name: 'Accrued Expenses', type: AccountType.LIABILITY, parentId: null },
      { code: '2150', name: 'Customer Deposits', type: AccountType.LIABILITY, parentId: null },
      { code: '2200', name: 'Sales Tax Payable', type: AccountType.LIABILITY, parentId: null },
      { code: '2210', name: 'VAT Payable', type: AccountType.LIABILITY, parentId: null },
      { code: '2220', name: 'VAT Input', type: AccountType.LIABILITY, parentId: null },
      { code: '2300', name: 'Payroll Payable', type: AccountType.LIABILITY, parentId: null },
      { code: '2400', name: 'Gift Card Liability', type: AccountType.LIABILITY, parentId: null },
      { code: '2500', name: 'Short-term Loans', type: AccountType.LIABILITY, parentId: null },

      // Equity (3xxx)
      { code: '3000', name: "Owner's Capital", type: AccountType.EQUITY, parentId: null },
      { code: '3100', name: 'Retained Earnings', type: AccountType.EQUITY, parentId: null },
      { code: '3200', name: "Owner's Drawings", type: AccountType.EQUITY, parentId: null },

      // Revenue (4xxx)
      { code: '4000', name: 'Sales Revenue', type: AccountType.INCOME, parentId: null },
      { code: '4010', name: 'In-Store Sales', type: AccountType.INCOME, parentId: null },
      { code: '4020', name: 'Online Sales', type: AccountType.INCOME, parentId: null },
      { code: '4030', name: 'Wholesale Sales', type: AccountType.INCOME, parentId: null },
      {
        code: '4100',
        name: 'Shipping & Handling Income',
        type: AccountType.INCOME,
        parentId: null,
      },
      {
        code: '4200',
        name: 'Sales Returns & Allowances',
        type: AccountType.INCOME,
        parentId: null,
      },
      { code: '4300', name: 'Sales Discounts', type: AccountType.INCOME, parentId: null },
      { code: '4900', name: 'Other Income', type: AccountType.INCOME, parentId: null },

      // Cost of Goods Sold (5xxx)
      { code: '5000', name: 'Cost of Goods Sold', type: AccountType.EXPENSE, parentId: null },
      { code: '5100', name: 'Merchandise Purchases', type: AccountType.EXPENSE, parentId: null },
      { code: '5200', name: 'Freight-In', type: AccountType.EXPENSE, parentId: null },
      {
        code: '5300',
        name: 'Purchase Returns & Allowances',
        type: AccountType.EXPENSE,
        parentId: null,
      },
      { code: '5400', name: 'Purchase Discounts', type: AccountType.EXPENSE, parentId: null },
      { code: '5500', name: 'Inventory Shrinkage', type: AccountType.EXPENSE, parentId: null },

      // Operating Expenses (6xxx)
      { code: '6000', name: 'Salaries & Wages', type: AccountType.EXPENSE, parentId: null },
      { code: '6010', name: 'Employee Benefits', type: AccountType.EXPENSE, parentId: null },
      { code: '6020', name: 'Sales Commissions', type: AccountType.EXPENSE, parentId: null },
      { code: '6100', name: 'Rent Expense', type: AccountType.EXPENSE, parentId: null },
      { code: '6110', name: 'Utilities', type: AccountType.EXPENSE, parentId: null },
      { code: '6200', name: 'Marketing & Advertising', type: AccountType.EXPENSE, parentId: null },
      { code: '6210', name: 'Store Displays', type: AccountType.EXPENSE, parentId: null },
      {
        code: '6300',
        name: 'Credit Card Processing Fees',
        type: AccountType.EXPENSE,
        parentId: null,
      },
      { code: '6400', name: 'Shipping & Delivery', type: AccountType.EXPENSE, parentId: null },
      { code: '6500', name: 'Store Supplies', type: AccountType.EXPENSE, parentId: null },
      { code: '6600', name: 'Depreciation Expense', type: AccountType.EXPENSE, parentId: null },
      { code: '6700', name: 'Insurance', type: AccountType.EXPENSE, parentId: null },
      { code: '6800', name: 'Security Expense', type: AccountType.EXPENSE, parentId: null },
      { code: '6900', name: 'Bank Charges', type: AccountType.EXPENSE, parentId: null },
      { code: '6999', name: 'Miscellaneous Expense', type: AccountType.EXPENSE, parentId: null },
    ];
  }

  private getConstructionCOA() {
    return [
      // Assets (1xxx)
      { code: '1000', name: 'Cash', type: AccountType.ASSET, parentId: null },
      { code: '1010', name: 'Bank Account - Operating', type: AccountType.ASSET, parentId: null },
      { code: '1020', name: 'Bank Account - Payroll', type: AccountType.ASSET, parentId: null },
      { code: '1100', name: 'Accounts Receivable', type: AccountType.ASSET, parentId: null },
      { code: '1110', name: 'Retainage Receivable', type: AccountType.ASSET, parentId: null },
      { code: '1200', name: 'Materials Inventory', type: AccountType.ASSET, parentId: null },
      { code: '1210', name: 'Work in Progress', type: AccountType.ASSET, parentId: null },
      { code: '1300', name: 'Prepaid Expenses', type: AccountType.ASSET, parentId: null },
      { code: '1310', name: 'Prepaid Insurance', type: AccountType.ASSET, parentId: null },
      { code: '1400', name: 'Construction Equipment', type: AccountType.ASSET, parentId: null },
      { code: '1410', name: 'Heavy Machinery', type: AccountType.ASSET, parentId: null },
      { code: '1420', name: 'Vehicles', type: AccountType.ASSET, parentId: null },
      { code: '1430', name: 'Small Tools & Equipment', type: AccountType.ASSET, parentId: null },
      { code: '1500', name: 'Office Equipment', type: AccountType.ASSET, parentId: null },
      {
        code: '1600',
        name: 'Accumulated Depreciation - Equipment',
        type: AccountType.ASSET,
        parentId: null,
      },
      {
        code: '1610',
        name: 'Accumulated Depreciation - Vehicles',
        type: AccountType.ASSET,
        parentId: null,
      },

      // Liabilities (2xxx)
      { code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, parentId: null },
      { code: '2010', name: 'Subcontractor Payables', type: AccountType.LIABILITY, parentId: null },
      { code: '2100', name: 'Accrued Expenses', type: AccountType.LIABILITY, parentId: null },
      { code: '2110', name: 'Retainage Payable', type: AccountType.LIABILITY, parentId: null },
      { code: '2200', name: 'VAT Payable', type: AccountType.LIABILITY, parentId: null },
      { code: '2210', name: 'VAT Input', type: AccountType.LIABILITY, parentId: null },
      { code: '2300', name: 'Payroll Payable', type: AccountType.LIABILITY, parentId: null },
      { code: '2310', name: 'Union Dues Payable', type: AccountType.LIABILITY, parentId: null },
      { code: '2400', name: 'Customer Deposits', type: AccountType.LIABILITY, parentId: null },
      { code: '2500', name: 'Equipment Loans', type: AccountType.LIABILITY, parentId: null },
      { code: '2510', name: 'Line of Credit', type: AccountType.LIABILITY, parentId: null },

      // Equity (3xxx)
      { code: '3000', name: "Owner's Capital", type: AccountType.EQUITY, parentId: null },
      { code: '3100', name: 'Retained Earnings', type: AccountType.EQUITY, parentId: null },
      { code: '3200', name: "Owner's Drawings", type: AccountType.EQUITY, parentId: null },

      // Revenue (4xxx)
      { code: '4000', name: 'Contract Revenue', type: AccountType.INCOME, parentId: null },
      { code: '4010', name: 'Residential Contracts', type: AccountType.INCOME, parentId: null },
      { code: '4020', name: 'Commercial Contracts', type: AccountType.INCOME, parentId: null },
      { code: '4030', name: 'Government Contracts', type: AccountType.INCOME, parentId: null },
      { code: '4100', name: 'Change Orders', type: AccountType.INCOME, parentId: null },
      { code: '4200', name: 'Service & Repair Revenue', type: AccountType.INCOME, parentId: null },
      { code: '4300', name: 'Equipment Rental Income', type: AccountType.INCOME, parentId: null },
      { code: '4900', name: 'Other Income', type: AccountType.INCOME, parentId: null },

      // Direct Job Costs (5xxx)
      { code: '5000', name: 'Direct Labor', type: AccountType.EXPENSE, parentId: null },
      { code: '5010', name: 'Direct Labor - Regular', type: AccountType.EXPENSE, parentId: null },
      { code: '5020', name: 'Direct Labor - Overtime', type: AccountType.EXPENSE, parentId: null },
      { code: '5100', name: 'Materials Cost', type: AccountType.EXPENSE, parentId: null },
      { code: '5110', name: 'Lumber & Wood Products', type: AccountType.EXPENSE, parentId: null },
      { code: '5120', name: 'Concrete & Masonry', type: AccountType.EXPENSE, parentId: null },
      { code: '5130', name: 'Electrical Materials', type: AccountType.EXPENSE, parentId: null },
      { code: '5140', name: 'Plumbing Materials', type: AccountType.EXPENSE, parentId: null },
      { code: '5150', name: 'HVAC Materials', type: AccountType.EXPENSE, parentId: null },
      { code: '5200', name: 'Subcontractor Costs', type: AccountType.EXPENSE, parentId: null },
      {
        code: '5210',
        name: 'Electrical Subcontractors',
        type: AccountType.EXPENSE,
        parentId: null,
      },
      { code: '5220', name: 'Plumbing Subcontractors', type: AccountType.EXPENSE, parentId: null },
      { code: '5230', name: 'HVAC Subcontractors', type: AccountType.EXPENSE, parentId: null },
      { code: '5240', name: 'Roofing Subcontractors', type: AccountType.EXPENSE, parentId: null },
      { code: '5300', name: 'Equipment Rental', type: AccountType.EXPENSE, parentId: null },
      { code: '5400', name: 'Permits & Fees', type: AccountType.EXPENSE, parentId: null },
      { code: '5500', name: 'Job Site Expenses', type: AccountType.EXPENSE, parentId: null },

      // Operating Expenses (6xxx)
      {
        code: '6000',
        name: 'Salaries - Office & Admin',
        type: AccountType.EXPENSE,
        parentId: null,
      },
      { code: '6010', name: 'Employee Benefits', type: AccountType.EXPENSE, parentId: null },
      { code: '6020', name: 'Payroll Taxes', type: AccountType.EXPENSE, parentId: null },
      { code: '6100', name: 'Office Rent', type: AccountType.EXPENSE, parentId: null },
      { code: '6110', name: 'Utilities', type: AccountType.EXPENSE, parentId: null },
      { code: '6200', name: 'Vehicle Expense', type: AccountType.EXPENSE, parentId: null },
      { code: '6210', name: 'Fuel', type: AccountType.EXPENSE, parentId: null },
      {
        code: '6220',
        name: 'Vehicle Repairs & Maintenance',
        type: AccountType.EXPENSE,
        parentId: null,
      },
      { code: '6300', name: 'Equipment Maintenance', type: AccountType.EXPENSE, parentId: null },
      {
        code: '6400',
        name: 'Insurance - General Liability',
        type: AccountType.EXPENSE,
        parentId: null,
      },
      { code: '6410', name: 'Insurance - Workers Comp', type: AccountType.EXPENSE, parentId: null },
      { code: '6420', name: 'Insurance - Vehicle', type: AccountType.EXPENSE, parentId: null },
      { code: '6500', name: 'Bonding Expense', type: AccountType.EXPENSE, parentId: null },
      { code: '6600', name: 'Professional Services', type: AccountType.EXPENSE, parentId: null },
      { code: '6700', name: 'Depreciation Expense', type: AccountType.EXPENSE, parentId: null },
      { code: '6800', name: 'Office Supplies', type: AccountType.EXPENSE, parentId: null },
      { code: '6900', name: 'Bank Charges', type: AccountType.EXPENSE, parentId: null },
      { code: '6999', name: 'Miscellaneous Expense', type: AccountType.EXPENSE, parentId: null },
    ];
  }
}
