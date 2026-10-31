import { BadRequestException } from '@nestjs/common';
import { AccountType, Prisma } from '@prisma/client';

/** Error codes the web maps to `purchases.bills.validation.<code>` (#552). */
export const ACCOUNT_INVALID_TYPE = 'accountInvalidType';
export const ACCOUNT_REQUIRED = 'accountRequired';

/** A bill line debits what was bought: an expense or an asset (inventory, equipment, prepaid). */
export const BILL_LINE_ACCOUNT_TYPES: AccountType[] = [AccountType.EXPENSE, AccountType.ASSET];

/**
 * The organization's control accounts. Bill approval posts them itself (Cr AP, Dr VAT
 * receivable), and AR, VAT payable, bank and cash are settled by their own documents, so a bill
 * line must never debit one of them directly (Dr AP / Cr AP, a receivable paid by a bill, ...).
 */
const CONTROL_ACCOUNT_SELECT = {
  defaultApAccountId: true,
  defaultArAccountId: true,
  defaultVatPayableAccountId: true,
  defaultVatReceivableAccountId: true,
  defaultBankAccountId: true,
  defaultCashAccountId: true,
} satisfies Prisma.OrganizationSelect;

/**
 * Accounts a bill line may use: active, non-deleted EXPENSE or ASSET accounts of the organization,
 * excluding its control accounts and any account linked to a live bank register. Shared by
 * create, update, approve and the form's account options so the picker offers exactly what the
 * API accepts.
 */
export async function billLineAccountWhere(
  db: Prisma.TransactionClient,
  organizationId: string,
): Promise<Prisma.AccountWhereInput> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: CONTROL_ACCOUNT_SELECT,
  });
  const controlIds = org
    ? [
        org.defaultApAccountId,
        org.defaultArAccountId,
        org.defaultVatPayableAccountId,
        org.defaultVatReceivableAccountId,
        org.defaultBankAccountId,
        org.defaultCashAccountId,
      ].filter((id): id is string => !!id)
    : [];
  return {
    organizationId,
    deletedAt: null,
    isActive: true,
    type: { in: BILL_LINE_ACCOUNT_TYPES },
    bankAccounts: { none: { organizationId, deletedAt: null } },
    ...(controlIds.length > 0 ? { NOT: { id: { in: controlIds } } } : {}),
  };
}

export function accountInvalidTypeError(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: ACCOUNT_INVALID_TYPE,
    message:
      'Bill line accounts must be active expense or asset accounts, not payables, receivables, VAT, bank or cash',
    error: 'Bad Request',
  });
}

/**
 * Throws unless every id is a usable bill-line account. Ids outside the organization (or deleted)
 * are "Account not found"; accounts of the organization that are inactive, of another type or a
 * control account are `accountInvalidType`.
 */
export async function assertBillLineAccounts(
  db: Prisma.TransactionClient,
  organizationId: string,
  accountIds: string[],
): Promise<void> {
  const ids = [...new Set(accountIds.filter(Boolean))];
  if (ids.length === 0) return;
  const eligible = await db.account.count({
    where: { ...(await billLineAccountWhere(db, organizationId)), id: { in: ids } },
  });
  if (eligible === ids.length) return;
  const owned = await db.account.count({
    where: { id: { in: ids }, organizationId, deletedAt: null },
  });
  if (owned !== ids.length) throw new BadRequestException('Account not found');
  throw accountInvalidTypeError();
}
