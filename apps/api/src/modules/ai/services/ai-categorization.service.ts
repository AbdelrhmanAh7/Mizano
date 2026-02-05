import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AiCategorizationService {
  constructor(private prisma: PrismaService) {}

  async categorizeTransaction(organizationId: string, description: string, amount: number, type: 'expense' | 'income') {
    // Get historical categorizations for learning
    const historicalData = await this.getHistoricalCategorizations(organizationId, type);

    // Find best matching category based on description similarity
    const match = this.findBestMatch(description, historicalData);

    if (match && match.confidence > 70) {
      return {
        suggestedAccountId: match.accountId,
        suggestedAccountName: match.accountName,
        confidence: match.confidence,
        reason: match.reason,
        alternatives: match.alternatives,
      };
    }

    // Fall back to keyword-based categorization
    const keywordMatch = this.categorizeByKeywords(description, type);

    return {
      suggestedAccountId: keywordMatch.accountId,
      suggestedAccountName: keywordMatch.accountName,
      confidence: keywordMatch.confidence,
      reason: keywordMatch.reason,
      alternatives: [],
    };
  }

  async learnFromCategorization(
    organizationId: string,
    description: string,
    accountId: string,
    type: 'expense' | 'income',
  ) {
    // Note: Categorization patterns are learned from expense/bill/bank transaction history
    // This method acknowledges the categorization but doesn't store patterns separately
    // In the future, a dedicated patterns table could be added to the schema
    const normalizedPattern = this.normalizeDescription(description);

    // Log the categorization for debugging/analytics purposes
    console.log(`Categorization learned: ${normalizedPattern} -> ${accountId} (${type})`);

    return { success: true, pattern: normalizedPattern };
  }

  async suggestVendorFromDescription(organizationId: string, description: string) {
    const vendors = await this.prisma.vendor.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
    });

    const normalizedDesc = description.toLowerCase();

    for (const vendor of vendors) {
      const vendorWords = vendor.name.toLowerCase().split(/\s+/);
      for (const word of vendorWords) {
        if (word.length > 3 && normalizedDesc.includes(word)) {
          return {
            vendorId: vendor.id,
            vendorName: vendor.name,
            confidence: 80,
          };
        }
      }
    }

    return null;
  }

  async autoCategorizeBankTransactions(organizationId: string, bankAccountId: string) {
    const uncategorizedTransactions = await this.prisma.bankTransaction.findMany({
      where: {
        bankAccountId,
        organizationId,
        status: 'PENDING',
      },
      take: 50,
    });

    const results = [];

    for (const transaction of uncategorizedTransactions) {
      const type = transaction.type === 'DEPOSIT' ? 'income' : 'expense';
      const description = transaction.description || transaction.payee || '';

      const categorization = await this.categorizeTransaction(organizationId, description, parseFloat(transaction.amount.toString()), type);

      results.push({
        transactionId: transaction.id,
        description,
        amount: parseFloat(transaction.amount.toString()),
        ...categorization,
      });
    }

    return results;
  }

  async getCategorizationStats(organizationId: string) {
    // Get categorization patterns from expense history instead
    const expenses = await this.prisma.expense.findMany({
      where: { organizationId, deletedAt: null },
      include: { account: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Build pattern statistics from expense descriptions
    const patternMap = new Map<string, { accountName: string; matchCount: number; type: string }>();

    for (const expense of expenses) {
      const pattern = this.normalizeDescription(expense.description || '');
      if (pattern) {
        const existing = patternMap.get(pattern);
        if (existing) {
          existing.matchCount++;
        } else {
          patternMap.set(pattern, {
            accountName: expense.account.name,
            matchCount: 1,
            type: 'expense',
          });
        }
      }
    }

    const patterns = Array.from(patternMap.entries())
      .map(([pattern, data]) => ({ pattern, ...data }))
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, 20);

    return {
      totalPatterns: patternMap.size,
      topPatterns: patterns,
    };
  }

  private async getHistoricalCategorizations(organizationId: string, type: 'expense' | 'income') {
    // Get historical categorizations from expenses (for expense type)
    // For income type, we could look at invoice descriptions in the future
    if (type === 'expense') {
      const expenses = await this.prisma.expense.findMany({
        where: { organizationId, deletedAt: null },
        include: { account: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });

      // Build pattern map to count occurrences
      const patternMap = new Map<string, { accountId: string; accountName: string; matchCount: number }>();

      for (const expense of expenses) {
        const pattern = this.normalizeDescription(expense.description || '');
        if (pattern) {
          const key = `${pattern}:${expense.accountId}`;
          const existing = patternMap.get(key);
          if (existing) {
            existing.matchCount++;
          } else {
            patternMap.set(key, {
              accountId: expense.accountId,
              accountName: expense.account.name,
              matchCount: 1,
            });
          }
        }
      }

      return Array.from(patternMap.entries()).map(([key, data]) => ({
        pattern: key.split(':')[0],
        ...data,
      }));
    }

    // For income, return empty array for now (could be expanded)
    return [];
  }

  private findBestMatch(
    description: string,
    historicalData: { pattern: string; accountId: string; accountName: string; matchCount: number }[],
  ) {
    const normalizedDesc = this.normalizeDescription(description);
    const descWords = normalizedDesc.split(/\s+/);

    let bestMatch = null;
    let bestScore = 0;
    const alternatives: any[] = [];

    for (const data of historicalData) {
      const patternWords = data.pattern.split(/\s+/);
      let matchingWords = 0;

      for (const word of descWords) {
        if (patternWords.includes(word)) matchingWords++;
      }

      const score = descWords.length > 0 ? (matchingWords / descWords.length) * 100 : 0;

      // Boost score based on historical match count
      const boostedScore = score + Math.min(20, data.matchCount * 2);

      if (boostedScore > bestScore) {
        if (bestMatch) {
          alternatives.push({
            accountId: bestMatch.accountId,
            accountName: bestMatch.accountName,
            confidence: bestScore,
          });
        }
        bestScore = boostedScore;
        bestMatch = data;
      } else if (boostedScore > 50) {
        alternatives.push({
          accountId: data.accountId,
          accountName: data.accountName,
          confidence: boostedScore,
        });
      }
    }

    if (bestMatch && bestScore > 50) {
      return {
        accountId: bestMatch.accountId,
        accountName: bestMatch.accountName,
        confidence: Math.min(100, bestScore),
        reason: `Similar to previous categorization pattern "${bestMatch.pattern}"`,
        alternatives: alternatives.slice(0, 3),
      };
    }

    return null;
  }

  private categorizeByKeywords(description: string, type: 'expense' | 'income') {
    const normalizedDesc = description.toLowerCase();

    const expenseKeywords: Record<string, { name: string; code: string }> = {
      'software|subscription|saas|cloud': { name: 'Software & Subscriptions', code: '6200' },
      'office|supplies|stationery': { name: 'Office Supplies', code: '6600' },
      'travel|flight|hotel|airbnb|uber|lyft': { name: 'Travel & Entertainment', code: '6300' },
      'meal|food|restaurant|lunch|dinner|coffee': { name: 'Meals & Entertainment', code: '6300' },
      'rent|lease|office space': { name: 'Rent Expense', code: '6100' },
      'utility|electric|water|gas|internet': { name: 'Utilities', code: '6110' },
      'marketing|advertising|ads|google|facebook': { name: 'Marketing & Advertising', code: '6500' },
      'insurance|coverage|premium': { name: 'Insurance', code: '6800' },
      'legal|attorney|lawyer': { name: 'Professional Services', code: '6400' },
      'accounting|bookkeeping|tax prep': { name: 'Professional Services', code: '6400' },
      'bank|fee|charge|interest': { name: 'Bank Charges', code: '6900' },
      'payroll|salary|wage': { name: 'Salaries & Wages', code: '6000' },
    };

    const incomeKeywords: Record<string, { name: string; code: string }> = {
      'consulting|advisory|service': { name: 'Consulting Revenue', code: '4000' },
      'project|milestone': { name: 'Project Revenue', code: '4010' },
      'retainer|monthly': { name: 'Retainer Revenue', code: '4020' },
      'interest|dividend': { name: 'Other Income', code: '4100' },
      'refund|reimbursement': { name: 'Other Income', code: '4100' },
    };

    const keywords = type === 'expense' ? expenseKeywords : incomeKeywords;

    for (const [pattern, category] of Object.entries(keywords)) {
      if (new RegExp(pattern, 'i').test(normalizedDesc)) {
        return {
          accountId: null, // Would need to look up actual account ID
          accountName: category.name,
          accountCode: category.code,
          confidence: 60,
          reason: `Matched keyword pattern "${pattern.split('|')[0]}"`,
        };
      }
    }

    // Default
    return {
      accountId: null,
      accountName: type === 'expense' ? 'Miscellaneous Expense' : 'Other Income',
      accountCode: type === 'expense' ? '6999' : '4100',
      confidence: 30,
      reason: 'No matching pattern found - manual review recommended',
    };
  }

  private normalizeDescription(description: string): string {
    return description
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
