import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountType, BillStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BulkResultDto } from '../../../common/dto/bulk-result.dto';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { bankCashAccountWhere } from '../../../common/utils/bank-cash-accounts';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { lockOrganizationLedger } from '../../../common/utils/ledger-lock';
import { runBulk } from '../../../common/utils/run-bulk';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalSourceType, JournalsService } from '../../accounting/services/journals.service';
import {
  assertMoneyFits,
  mapDocumentNumberConflict,
  parseDocumentDate,
  parsePositiveDecimal,
} from '../../sales/utils/sales-helpers';
import { CreateVendorCreditDto } from '../dto/create-vendor-credit.dto';
import { RefundVendorCreditDto } from '../dto/refund-vendor-credit.dto';
import { VendorCreditQueryDto } from '../dto/vendor-credit-query.dto';
import { BillsService, PAYABLE_BILL_STATUSES } from './bills.service';
import { LookupAccount } from './expenses.service';

/** Bills that have been approved: only these carry AP a vendor credit can reduce. */
const POSTED_BILL_STATUSES: BillStatus[] = [...PAYABLE_BILL_STATUSES, BillStatus.PAID];

const VENDOR_CREDIT_VIEW_INCLUDE = {
  vendor: { select: { id: true, name: true } },
  bill: { select: { id: true, billNumber: true } },
  appliedToBill: { select: { id: true, billNumber: true } },
} satisfies Prisma.VendorCreditInclude;

@Injectable()
export class VendorCreditsService {
  constructor(
    private prisma: PrismaService,
    private billsService: BillsService,
    private journalsService: JournalsService,
  ) {}

  /**
   * Issues a vendor credit against a posted bill and posts it in one transaction:
   *   Dr Accounts Payable (amount) / Cr expense-or-returns account (amount - VAT) /
   *   Cr VAT Receivable (VAT), dated on the credit date.
   * VAT is the credit's proportional share of the bill VAT, computed cumulatively so the
   * credits of one bill never exceed the bill VAT. The credit stays unapplied until it is
   * applied to a bill (no journal: AP is already debited) or refunded.
   */
  async create(organizationId: string, dto: CreateVendorCreditDto) {
    const amount = parsePositiveDecimal(dto.amount, 'amount');
    assertMoneyFits(amount, 'amount');
    const date = dto.date ? parseDocumentDate(dto.date, 'vendor credit date') : new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const owned = await tx.bill.count({
          where: { id: dto.billId, organizationId, deletedAt: null },
        });
        if (owned === 0) throw new BadRequestException('Bill not found');
        // Lock order: bill -> ledger.
        await this.billsService.lockBills(tx, organizationId, [dto.billId]);
        const bill = await tx.bill.findFirst({
          where: { id: dto.billId, organizationId, deletedAt: null },
        });
        if (!bill) throw new BadRequestException('Bill not found');
        if (bill.vendorId !== dto.vendorId) {
          throw new BadRequestException('Bill does not belong to this vendor');
        }
        if (!POSTED_BILL_STATUSES.includes(bill.status)) {
          throw new BadRequestException('Vendor credits can only be issued against a posted bill');
        }

        await lockOrganizationLedger(tx, organizationId);
        const org = await tx.organization.findUnique({
          where: { id: organizationId },
          select: {
            defaultApAccountId: true,
            defaultVatReceivableAccountId: true,
            baseCurrency: true,
          },
        });
        const billCurrency = bill.currencyCode?.trim().toUpperCase();
        if (billCurrency && org && billCurrency !== org.baseCurrency.toUpperCase()) {
          throw new BadRequestException(
            `Bill currency ${billCurrency} differs from the base currency ${org.baseCurrency}; foreign-currency credits cannot be posted yet`,
          );
        }
        if (!org?.defaultApAccountId) {
          throw new BadRequestException(
            'Please configure the default Accounts Payable account in organization settings before creating vendor credits',
          );
        }

        const existing = await tx.vendorCredit.aggregate({
          where: { organizationId, billId: bill.id, deletedAt: null },
          _sum: { amount: true },
        });
        const alreadyCredited = existing._sum.amount ?? new Decimal(0);
        if (alreadyCredited.add(amount).greaterThan(bill.grandTotal)) {
          throw new BadRequestException(
            `Vendor credits would exceed the total of bill ${bill.billNumber}`,
          );
        }

        const creditAccountId = await this.resolveCreditAccount(
          tx,
          organizationId,
          bill.id,
          dto.accountId,
        );

        const tax = await this.cumulativeCreditTax(
          tx,
          organizationId,
          bill,
          alreadyCredited,
          amount,
          org.defaultVatReceivableAccountId,
        );
        if (tax.greaterThan(0) && !org.defaultVatReceivableAccountId) {
          throw new BadRequestException(
            'Please configure the default VAT Receivable account in organization settings before crediting taxed bills',
          );
        }
        const net = amount.sub(tax);

        const creditNumber = await this.nextCreditNumber(tx, organizationId);
        const credit = await tx.vendorCredit.create({
          data: {
            creditNumber,
            vendorId: dto.vendorId,
            billId: bill.id,
            date,
            reason: dto.reason || '',
            amount,
            organizationId,
          },
          include: VENDOR_CREDIT_VIEW_INCLUDE,
        });

        const lines = [
          {
            accountId: org.defaultApAccountId,
            debit: amount.toFixed(4),
            credit: '0',
            description: `${creditNumber} - Accounts Payable (reduction)`,
          },
          {
            accountId: creditAccountId,
            debit: '0',
            credit: net.toFixed(4),
            description: `${creditNumber} - Expense reversal`,
          },
        ];
        if (tax.greaterThan(0)) {
          lines.push({
            accountId: org.defaultVatReceivableAccountId as string,
            debit: '0',
            credit: tax.toFixed(4),
            description: `${creditNumber} - VAT Receivable`,
          });
        }
        await this.journalsService.create(
          organizationId,
          {
            date: date.toISOString(),
            reference: `Vendor Credit ${creditNumber}`,
            notes: `Vendor credit ${creditNumber} against bill ${bill.billNumber}`,
            lines,
          },
          { tx, source: { type: JournalSourceType.VENDOR_CREDIT, id: credit.id } },
        );

        return credit;
      });
    } catch (error) {
      throw mapDocumentNumberConflict(error, 'Vendor credit');
    }
  }

  /** Accounts a credit can be posted to, for users who hold purchases.create only. */
  async creditAccounts(organizationId: string): Promise<LookupAccount[]> {
    return this.prisma.account.findMany({
      where: { organizationId, deletedAt: null, isActive: true, type: AccountType.EXPENSE },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }

  /** Accounts a refund can be received into (same rule refund() enforces). */
  async refundAccounts(organizationId: string): Promise<LookupAccount[]> {
    return this.prisma.account.findMany({
      where: await bankCashAccountWhere(this.prisma, organizationId),
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }

  async findAll(organizationId: string, query: VendorCreditQueryDto) {
    const where: { organizationId: string; deletedAt: null; vendorId?: string } = {
      organizationId,
      deletedAt: null,
    };
    if (query.vendorId) where.vendorId = query.vendorId;

    const page = query.page || 1;
    const limit = query.limit || 20;

    const [data, total] = await Promise.all([
      this.prisma.vendorCredit.findMany({
        where,
        include: VENDOR_CREDIT_VIEW_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vendorCredit.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findAllCursor(organizationId: string, query: CursorPaginationDto) {
    const { cursor, take = 50, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const where = { organizationId, deletedAt: null };
    return cursorPaginate(
      this.prisma.vendorCredit,
      where,
      { [sortBy]: sortOrder },
      { cursor, take, include: VENDOR_CREDIT_VIEW_INCLUDE },
    );
  }

  async findOne(organizationId: string, id: string) {
    const credit = await this.prisma.vendorCredit.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        vendor: { select: { id: true, name: true, email: true } },
        bill: { select: { id: true, billNumber: true, total: true, status: true } },
        appliedToBill: { select: { id: true, billNumber: true, total: true, status: true } },
      },
    });
    if (!credit) throw new NotFoundException('Vendor credit not found');
    return credit;
  }

  /**
   * Applies an unapplied, unrefunded credit to a bill's balance. AP was already debited when the
   * credit was created, so no journal is written. The whole credit is applied (the credit has a
   * single application target), so it must fit within the bill's remaining balance. Lock order:
   * credit -> bill.
   */
  async applyToBill(organizationId: string, id: string, billId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockCredit(tx, organizationId, id);
      const credit = await tx.vendorCredit.findFirst({
        where: { id, organizationId, deletedAt: null },
      });
      if (!credit) throw new NotFoundException('Vendor credit not found');
      if (credit.appliedToBillId) {
        throw new BadRequestException('Vendor credit is already applied to a bill');
      }
      if (credit.refundedAt) {
        throw new BadRequestException('A refunded vendor credit cannot be applied');
      }

      const owned = await tx.bill.count({ where: { id: billId, organizationId, deletedAt: null } });
      if (owned === 0) throw new BadRequestException('Target bill not found');
      await this.billsService.lockBills(tx, organizationId, [billId]);
      const bill = await tx.bill.findFirst({
        where: { id: billId, organizationId, deletedAt: null },
      });
      if (!bill) throw new BadRequestException('Target bill not found');
      if (bill.vendorId !== credit.vendorId) {
        throw new BadRequestException(`Bill ${bill.billNumber} belongs to a different vendor`);
      }
      if (!PAYABLE_BILL_STATUSES.includes(bill.status)) {
        throw new BadRequestException(`Bill ${bill.billNumber} is not open for credit`);
      }
      if (credit.amount.greaterThan(bill.balanceDue)) {
        throw new BadRequestException(`Credit exceeds the balance due on bill ${bill.billNumber}`);
      }

      // Guarded: only one concurrent apply/refund/void can claim the credit.
      const { count } = await tx.vendorCredit.updateMany({
        where: { id, organizationId, deletedAt: null, appliedToBillId: null, refundedAt: null },
        data: { appliedToBillId: billId },
      });
      if (count === 0) throw new ConflictException('Vendor credit was changed concurrently');

      await this.billsService.recalculateBalance(tx, billId);
      return tx.vendorCredit.findUniqueOrThrow({
        where: { id },
        include: VENDOR_CREDIT_VIEW_INCLUDE,
      });
    });
  }

  /**
   * Refunds an unapplied credit: the vendor pays the money back, posting Dr bank or cash / Cr
   * Accounts Payable dated on the refund date. Lock order: credit -> ledger.
   */
  async refund(organizationId: string, id: string, dto: RefundVendorCreditDto) {
    const date = dto.date ? parseDocumentDate(dto.date, 'refund date') : new Date();
    return this.prisma.$transaction(async (tx) => {
      await this.lockCredit(tx, organizationId, id);
      const credit = await tx.vendorCredit.findFirst({
        where: { id, organizationId, deletedAt: null },
      });
      if (!credit) throw new NotFoundException('Vendor credit not found');
      if (credit.refundedAt) {
        throw new BadRequestException('Vendor credit has already been refunded');
      }
      if (credit.appliedToBillId) {
        throw new BadRequestException('An applied vendor credit cannot be refunded');
      }

      await lockOrganizationLedger(tx, organizationId);
      const bankAccount = await tx.account.findFirst({
        where: {
          AND: [{ id: dto.bankAccountId }, await bankCashAccountWhere(tx, organizationId)],
        },
        select: { id: true },
      });
      if (!bankAccount) {
        throw new BadRequestException(
          'Refund account must be an active bank or cash account of this organization',
        );
      }
      const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { defaultApAccountId: true },
      });
      if (!org?.defaultApAccountId) {
        throw new BadRequestException(
          'Please configure the default Accounts Payable account in organization settings before refunding vendor credits',
        );
      }

      const { count } = await tx.vendorCredit.updateMany({
        where: { id, organizationId, deletedAt: null, appliedToBillId: null, refundedAt: null },
        data: { refundedAt: date },
      });
      if (count === 0) throw new ConflictException('Vendor credit was changed concurrently');

      await this.journalsService.create(
        organizationId,
        {
          date: date.toISOString(),
          reference: `Vendor Refund ${credit.creditNumber}`,
          notes: `Refund of vendor credit ${credit.creditNumber}`,
          lines: [
            {
              accountId: bankAccount.id,
              debit: credit.amount.toFixed(4),
              credit: '0',
              description: `${credit.creditNumber} - Refund received`,
            },
            {
              accountId: org.defaultApAccountId,
              debit: '0',
              credit: credit.amount.toFixed(4),
              description: `${credit.creditNumber} - Accounts Payable`,
            },
          ],
        },
        { tx, source: { type: JournalSourceType.VENDOR_CREDIT_REFUND, id } },
      );

      return tx.vendorCredit.findUniqueOrThrow({
        where: { id },
        include: VENDOR_CREDIT_VIEW_INCLUDE,
      });
    });
  }

  /**
   * Voids a credit that has not been applied or refunded: soft-deletes it and posts a linked
   * reversal of its journal. Lock order: credit -> ledger.
   */
  async void(organizationId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockCredit(tx, organizationId, id);
      const credit = await tx.vendorCredit.findFirst({
        where: { id, organizationId, deletedAt: null },
        select: { id: true, appliedToBillId: true, refundedAt: true },
      });
      if (!credit) throw new NotFoundException('Vendor credit not found');
      if (credit.appliedToBillId || credit.refundedAt) {
        throw new BadRequestException('Only unapplied, unrefunded vendor credits can be voided');
      }

      const { count } = await tx.vendorCredit.updateMany({
        where: { id, organizationId, deletedAt: null, appliedToBillId: null, refundedAt: null },
        data: { deletedAt: new Date() },
      });
      if (count === 0) throw new ConflictException('Vendor credit was changed concurrently');

      const journal = await tx.journal.findFirst({
        where: {
          organizationId,
          sourceType: JournalSourceType.VENDOR_CREDIT,
          sourceId: id,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!journal) {
        // Legacy credits (created before journals were source-linked) cannot be voided safely.
        throw new BadRequestException(
          'This vendor credit has no linked ledger entry; reverse its journal manually before voiding',
        );
      }
      await this.journalsService.reverse(organizationId, journal.id, undefined, {
        tx,
        source: { type: JournalSourceType.VENDOR_CREDIT_VOID, id },
      });
      return { message: 'Vendor credit voided successfully' };
    });
  }

  // === Bulk Operations — same command as the single-record route ===

  bulkDelete(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.void(organizationId, id));
  }

  // === Helpers ===

  private async lockCredit(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "vendor_credits" WHERE id = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`;
  }

  /** The requested account (must be an active expense account) or the bill's largest expense line account. */
  private async resolveCreditAccount(
    tx: Prisma.TransactionClient,
    organizationId: string,
    billId: string,
    requested: string | undefined,
  ): Promise<string> {
    if (requested) {
      const account = await tx.account.findFirst({
        where: {
          id: requested,
          organizationId,
          deletedAt: null,
          isActive: true,
          type: AccountType.EXPENSE,
        },
        select: { id: true },
      });
      if (!account) {
        throw new BadRequestException('Credit account must be an active expense account');
      }
      return account.id;
    }
    const line = await tx.billLine.findFirst({
      where: {
        billId,
        accountId: { not: null },
        account: { organizationId, deletedAt: null, isActive: true, type: AccountType.EXPENSE },
      },
      orderBy: [{ amount: 'desc' }, { id: 'asc' }],
      select: { accountId: true },
    });
    if (!line?.accountId) {
      throw new BadRequestException('Choose the expense account the credit is posted to');
    }
    return line.accountId;
  }

  /**
   * VAT for this credit, computed cumulatively so the credits on one bill always sum to the bill
   * VAT: round4(billVat x credited-so-far-including-this / grandTotal) minus the VAT already
   * posted by the bill's live credits. A credit that exhausts the bill takes what is left.
   */
  private async cumulativeCreditTax(
    tx: Prisma.TransactionClient,
    organizationId: string,
    bill: { id: string; taxAmount: Decimal; grandTotal: Decimal },
    creditedBefore: Decimal,
    amount: Decimal,
    vatAccountId: string | null | undefined,
  ): Promise<Decimal> {
    if (bill.taxAmount.lessThanOrEqualTo(0)) return new Decimal(0);
    const live = await tx.vendorCredit.findMany({
      where: { organizationId, billId: bill.id, deletedAt: null },
      select: { id: true },
    });
    let previous = new Decimal(0);
    if (live.length > 0 && vatAccountId) {
      const posted = await tx.journalLine.aggregate({
        where: {
          accountId: vatAccountId,
          journal: {
            organizationId,
            sourceType: JournalSourceType.VENDOR_CREDIT,
            sourceId: { in: live.map((c) => c.id) },
            deletedAt: null,
          },
        },
        _sum: { credit: true },
      });
      previous = posted._sum.credit ?? new Decimal(0);
    }
    const creditedAfter = creditedBefore.add(amount);
    const cumulative = creditedAfter.greaterThanOrEqualTo(bill.grandTotal)
      ? bill.taxAmount
      : bill.taxAmount
          .mul(creditedAfter)
          .div(bill.grandTotal)
          .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    const tax = cumulative.sub(previous);
    return tax.isNegative() ? new Decimal(0) : tax;
  }

  /** Serialized per organization so concurrent credits never collide on a number. */
  private async nextCreditNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<string> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`vendor-credit:${organizationId}`}))`;
    const rows = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(CAST(SUBSTRING("creditNumber" FROM '^VC-([0-9]+)$') AS INTEGER)) AS max
      FROM "vendor_credits" WHERE "organizationId" = ${organizationId}`;
    const last = Number(rows?.[0]?.max ?? 0);
    return `VC-${String(last + 1).padStart(3, '0')}`;
  }
}
