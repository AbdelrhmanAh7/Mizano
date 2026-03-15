import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ImportService } from '../../import-export/services/import.service';
import { BankRulesService, BankRuleCondition } from './bank-rules.service';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

interface ColumnMapping {
  dateCol: string | null;
  descriptionCol: string | null;
  amountCol: string | null;
  debitCol: string | null;
  creditCol: string | null;
  referenceCol: string | null;
}

interface NormalizedTransaction {
  date: string;
  description: string;
  amount: number;
  reference: string | null;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  payee: string | null;
}

@Injectable()
export class BankStatementImportService {
  constructor(
    private prisma: PrismaService,
    private importService: ImportService,
    private bankRulesService: BankRulesService,
  ) {}

  async importStatement(
    organizationId: string,
    bankAccountId: string,
    buffer: Buffer,
    filename: string,
  ): Promise<{
    imported: number;
    skipped: number;
    duplicates: number;
    rulesApplied: number;
    total: number;
  }> {
    // Validate bank account
    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, organizationId },
    });
    if (!bankAccount) throw new NotFoundException('Bank account not found');

    // Parse file
    const parsed = await this.importService.parseFile(buffer, filename);
    const allRows = await this.importService.getAllRows(buffer, filename);

    if (allRows.length === 0) {
      throw new BadRequestException('No transactions found in file');
    }

    // Auto-detect column mapping
    const mapping = this.detectColumnMapping(parsed.headers);

    // Normalize transactions
    const normalized = this.normalizeTransactions(allRows, mapping);

    // Deduplicate
    const { newTransactions, duplicateCount } = await this.deduplicateTransactions(
      organizationId,
      bankAccountId,
      normalized,
    );

    // Import new transactions
    let rulesApplied = 0;
    if (newTransactions.length > 0) {
      await this.prisma.bankTransaction.createMany({
        data: newTransactions.map((t) => ({
          bankAccountId,
          date: new Date(t.date),
          type: t.type,
          amount: new Decimal(Math.abs(t.amount)),
          description: t.description || null,
          reference: t.reference || null,
          payee: t.payee || null,
          organizationId,
        })),
      });

      // Auto-apply bank rules to newly imported transactions
      rulesApplied = await this.applyBankRules(organizationId, bankAccountId, newTransactions);
    }

    return {
      imported: newTransactions.length,
      skipped: 0,
      duplicates: duplicateCount,
      rulesApplied,
      total: normalized.length,
    };
  }

  /**
   * Auto-detect column mapping from common bank statement header names.
   */
  detectColumnMapping(headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = {
      dateCol: null,
      descriptionCol: null,
      amountCol: null,
      debitCol: null,
      creditCol: null,
      referenceCol: null,
    };

    const lower = headers.map((h) => h.toLowerCase().trim());

    // Date column
    const datePatterns = [
      'date',
      'transaction date',
      'post date',
      'value date',
      'booking date',
      'trans date',
    ];
    mapping.dateCol = this.findMatchingHeader(headers, lower, datePatterns);

    // Description column
    const descPatterns = [
      'description',
      'memo',
      'narration',
      'details',
      'particulars',
      'narrative',
      'transaction description',
    ];
    mapping.descriptionCol = this.findMatchingHeader(headers, lower, descPatterns);

    // Amount column (single combined column)
    const amountPatterns = ['amount', 'transaction amount', 'sum', 'value'];
    mapping.amountCol = this.findMatchingHeader(headers, lower, amountPatterns);

    // Debit column (separate)
    const debitPatterns = ['debit', 'withdrawal', 'dr', 'money out', 'debit amount', 'withdrawals'];
    mapping.debitCol = this.findMatchingHeader(headers, lower, debitPatterns);

    // Credit column (separate)
    const creditPatterns = ['credit', 'deposit', 'cr', 'money in', 'credit amount', 'deposits'];
    mapping.creditCol = this.findMatchingHeader(headers, lower, creditPatterns);

    // Reference column
    const refPatterns = [
      'reference',
      'check no',
      'ref no',
      'cheque',
      'fitid',
      'transaction id',
      'ref',
      'check number',
    ];
    mapping.referenceCol = this.findMatchingHeader(headers, lower, refPatterns);

    // If no amount column but have debit/credit, that's fine
    // If no date column found, try the first column (many bank CSVs have date first)
    if (!mapping.dateCol && headers.length > 0) {
      mapping.dateCol = headers[0];
    }

    // If no description found, try second column
    if (!mapping.descriptionCol && headers.length > 1) {
      mapping.descriptionCol = headers[1];
    }

    return mapping;
  }

  private findMatchingHeader(
    headers: string[],
    lowerHeaders: string[],
    patterns: string[],
  ): string | null {
    for (const pattern of patterns) {
      // Exact match first
      const exactIdx = lowerHeaders.indexOf(pattern);
      if (exactIdx >= 0) return headers[exactIdx];

      // Contains match
      const containsIdx = lowerHeaders.findIndex((h) => h.includes(pattern));
      if (containsIdx >= 0) return headers[containsIdx];
    }
    return null;
  }

  /**
   * Normalize raw rows into standard transaction format.
   * Handles split debit/credit columns and flexible date parsing.
   */
  normalizeTransactions(
    rows: Record<string, unknown>[],
    mapping: ColumnMapping,
  ): NormalizedTransaction[] {
    const transactions: NormalizedTransaction[] = [];

    for (const row of rows) {
      let amount = 0;

      if (
        mapping.amountCol &&
        row[mapping.amountCol] !== undefined &&
        row[mapping.amountCol] !== ''
      ) {
        // Single amount column
        amount = this.parseAmount(row[mapping.amountCol]);
      } else if (mapping.debitCol || mapping.creditCol) {
        // Split debit/credit columns
        const debit = mapping.debitCol ? this.parseAmount(row[mapping.debitCol]) : 0;
        const credit = mapping.creditCol ? this.parseAmount(row[mapping.creditCol]) : 0;
        amount = credit - debit;
      }

      // Skip rows with zero amount (likely headers or summary rows)
      if (amount === 0) continue;

      const dateStr = mapping.dateCol ? this.parseDate(row[mapping.dateCol]) : null;
      if (!dateStr) continue; // Skip rows without valid date

      const description = mapping.descriptionCol
        ? String(row[mapping.descriptionCol] || '').trim()
        : '';
      const reference = mapping.referenceCol
        ? String(row[mapping.referenceCol] || '').trim() || null
        : null;

      transactions.push({
        date: dateStr,
        description,
        amount,
        reference,
        type: amount >= 0 ? 'DEPOSIT' : 'WITHDRAWAL',
        payee: null,
      });
    }

    return transactions;
  }

  /**
   * Parse amount from various formats: "1,234.56", "(1234.56)", "-1234.56", "1.234,56"
   */
  private parseAmount(value: unknown): number {
    if (value === null || value === undefined || value === '') return 0;
    const str = String(value).trim();

    // Handle parentheses for negative: (1234.56) → -1234.56
    const isNegative = str.startsWith('(') && str.endsWith(')');
    const cleaned = str.replace(/[()]/g, '').replace(/[^0-9.\-,]/g, ''); // Keep digits, dots, minus, commas

    // Detect format: if last separator is comma and has 2 digits after → European format
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');

    let normalized: string;
    if (lastComma > lastDot) {
      // European: 1.234,56 → 1234.56
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // Standard: 1,234.56 → 1234.56
      normalized = cleaned.replace(/,/g, '');
    }

    const num = parseFloat(normalized);
    if (isNaN(num)) return 0;
    return isNegative ? -Math.abs(num) : num;
  }

  /**
   * Parse date from various formats.
   */
  private parseDate(value: unknown): string | null {
    if (!value) return null;
    const str = String(value).trim();

    // Already ISO format
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }

    // DD/MM/YYYY or DD-MM-YYYY
    const ddmmyyyy = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (ddmmyyyy) {
      const [, d, m, y] = ddmmyyyy;
      const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
    }

    // MM/DD/YYYY (US format) - try if day > 12 it's clearly DD/MM, otherwise ambiguous
    // We already handled DD/MM above, so this is a fallback
    const mmddyyyy = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (mmddyyyy) {
      const [, m, d, y] = mmddyyyy;
      if (parseInt(m) <= 12 && parseInt(d) <= 31) {
        const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
      }
    }

    // DD-MMM-YYYY (e.g., 15-Jan-2024)
    const ddMmmYyyy = str.match(/^(\d{1,2})[/\-.\s]([A-Za-z]{3,})[/\-.\s](\d{4})$/);
    if (ddMmmYyyy) {
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }

    // Fallback: try native Date parsing
    const fallback = new Date(str);
    if (!isNaN(fallback.getTime())) return fallback.toISOString().split('T')[0];

    return null;
  }

  /**
   * Check for duplicate transactions already in the database.
   */
  async deduplicateTransactions(
    organizationId: string,
    bankAccountId: string,
    transactions: NormalizedTransaction[],
  ): Promise<{ newTransactions: NormalizedTransaction[]; duplicateCount: number }> {
    if (transactions.length === 0) {
      return { newTransactions: [], duplicateCount: 0 };
    }

    // Find date range of incoming transactions
    const dates = transactions.map((t) => new Date(t.date));
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

    // Add 1 day buffer on each side
    minDate.setDate(minDate.getDate() - 1);
    maxDate.setDate(maxDate.getDate() + 1);

    // Fetch existing transactions in this date range
    const existing = await this.prisma.bankTransaction.findMany({
      where: {
        organizationId,
        bankAccountId,
        date: { gte: minDate, lte: maxDate },
      },
      select: { date: true, amount: true, reference: true, description: true },
    });

    // Build a set of existing transaction signatures for fast lookup
    const existingSignatures = new Set<string>();
    for (const tx of existing) {
      const dateStr = tx.date.toISOString().split('T')[0];
      const amount = parseFloat(tx.amount.toString());
      // Primary key: date + amount + reference
      if (tx.reference) {
        existingSignatures.add(`${dateStr}|${amount}|ref:${tx.reference}`);
      }
      // Secondary key: date + amount + description prefix
      if (tx.description) {
        const descKey = tx.description.substring(0, 50).toLowerCase();
        existingSignatures.add(`${dateStr}|${amount}|desc:${descKey}`);
      }
    }

    const newTransactions: NormalizedTransaction[] = [];
    let duplicateCount = 0;

    for (const tx of transactions) {
      const dateStr = tx.date;
      const amount = Math.abs(tx.amount);
      const signedAmount = tx.type === 'WITHDRAWAL' ? -amount : amount;

      let isDuplicate = false;

      // Check by reference
      if (tx.reference) {
        if (
          existingSignatures.has(`${dateStr}|${signedAmount}|ref:${tx.reference}`) ||
          existingSignatures.has(`${dateStr}|${amount}|ref:${tx.reference}`)
        ) {
          isDuplicate = true;
        }
      }

      // Check by description
      if (!isDuplicate && tx.description) {
        const descKey = tx.description.substring(0, 50).toLowerCase();
        if (
          existingSignatures.has(`${dateStr}|${signedAmount}|desc:${descKey}`) ||
          existingSignatures.has(`${dateStr}|${amount}|desc:${descKey}`)
        ) {
          isDuplicate = true;
        }
      }

      if (isDuplicate) {
        duplicateCount++;
      } else {
        newTransactions.push(tx);
      }
    }

    return { newTransactions, duplicateCount };
  }

  /**
   * Apply active bank rules to newly imported transactions.
   * For each transaction, test against all active rules (in order).
   * First matching rule wins — applies the rule's action (e.g., set accountId/category).
   */
  private async applyBankRules(
    organizationId: string,
    bankAccountId: string,
    newTransactions: NormalizedTransaction[],
  ): Promise<number> {
    // Fetch active rules for this bank account (or global rules with no bankAccountId)
    const rules = await this.prisma.bankRule.findMany({
      where: {
        organizationId,
        deletedAt: null,
        isActive: true,
        OR: [{ bankAccountId }, { bankAccountId: null }],
      },
      orderBy: { createdAt: 'asc' },
    });

    if (rules.length === 0) return 0;

    // Fetch the newly created transactions from DB (we need their IDs)
    const dates = newTransactions.map((t) => new Date(t.date));
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
    minDate.setDate(minDate.getDate() - 1);
    maxDate.setDate(maxDate.getDate() + 1);

    const createdTxs = await this.prisma.bankTransaction.findMany({
      where: {
        organizationId,
        bankAccountId,
        status: 'PENDING',
        date: { gte: minDate, lte: maxDate },
      },
    });

    let appliedCount = 0;

    for (const tx of createdTxs) {
      for (const rule of rules) {
        const conditions = (rule.conditions as unknown as BankRuleCondition[]) || [];
        const { matches } = this.bankRulesService.testRule(conditions, {
          description: tx.description,
          payee: tx.payee,
          reference: tx.reference,
          amount: tx.amount.toString(),
          type: tx.type,
        });

        if (matches) {
          const action = (rule.action as Record<string, unknown>) || {};
          const updateData: Record<string, unknown> = {};
          if (action.accountId) updateData.matchedEntityType = 'account';
          if (action.categoryId) updateData.matchedEntityId = action.categoryId;
          if (action.description) updateData.description = action.description;

          if (Object.keys(updateData).length > 0) {
            await this.prisma.bankTransaction.update({
              where: { id: tx.id },
              data: updateData as Prisma.BankTransactionUncheckedUpdateInput,
            });
          }

          // Increment rule hit count (cast required until Prisma client is regenerated)
          await this.prisma.bankRule.update({
            where: { id: rule.id },
            data: { hitCount: { increment: 1 } } as Prisma.BankRuleUpdateInput,
          });

          appliedCount++;
          break; // First matching rule wins
        }
      }
    }

    return appliedCount;
  }
}
