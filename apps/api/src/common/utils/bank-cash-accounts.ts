import { AccountType, BankAccountType, Prisma } from '@prisma/client';

/**
 * Authoritative rule for "bank or cash account" in sales: an active, non-deleted ASSET account
 * of the organization that is either the organization's default bank/cash account, or the
 * linked ledger account of an active bank-register account (BANK or PETTY_CASH; credit cards
 * are liabilities and excluded). The ledger is single-currency, so only a bank register carries
 * a meaningful currency: an account linked to a bank register whose currency differs from the
 * organization's base currency is rejected. Shared by sales refunds and VAT payments (list the eligible accounts and validate a pick).
 */
export async function bankCashAccountWhere(
  db: Prisma.TransactionClient,
  organizationId: string,
): Promise<Prisma.AccountWhereInput> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { defaultBankAccountId: true, defaultCashAccountId: true, baseCurrency: true },
  });
  const baseCurrency = org?.baseCurrency;
  const defaultIds = [org?.defaultBankAccountId, org?.defaultCashAccountId].filter(
    (id): id is string => !!id,
  );
  return {
    organizationId,
    deletedAt: null,
    isActive: true,
    type: AccountType.ASSET,
    // A refund account linked to a foreign-currency bank register would post foreign amounts as
    // base currency.
    ...(baseCurrency
      ? {
          NOT: {
            bankAccounts: {
              some: {
                organizationId,
                deletedAt: null,
                NOT: { currency: { equals: baseCurrency, mode: 'insensitive' } },
              },
            },
          },
        }
      : {}),
    OR: [
      { id: { in: defaultIds } },
      {
        bankAccounts: {
          some: {
            organizationId,
            deletedAt: null,
            isActive: true,
            type: { in: [BankAccountType.BANK, BankAccountType.PETTY_CASH] },
          },
        },
      },
    ],
  };
}
