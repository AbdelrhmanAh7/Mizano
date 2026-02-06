import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import {
  levenshteinSimilarity,
  normalizeText,
  extractDocumentNumbers,
  generateDescriptionHash,
  extractPattern,
  patternMatches,
} from '../utils/text-similarity.util';

export interface MatchScore {
  entityType: 'invoice' | 'bill' | 'expense' | 'payment';
  entityId: string;
  entity: any;
  totalScore: number;
  breakdown: {
    amountScore: number;
    referenceScore: number;
    nameScore: number;
    dateScore: number;
  };
  confidence: 'high' | 'medium' | 'low';
  matchReasons: string[];
}

export interface BankRuleCondition {
  field: string;
  operator: 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan';
  value: string;
}

export interface BankRuleAction {
  type: 'categorize' | 'createExpense' | 'createIncome' | 'match';
  accountId?: string;
  vendorId?: string;
  customerId?: string;
}

@Injectable()
export class ReconciliationMatcherService {
  private readonly logger = new Logger(ReconciliationMatcherService.name);

  // Weights for multi-signal scoring
  private readonly WEIGHTS = {
    amount: 0.4,
    reference: 0.3,
    name: 0.2,
    date: 0.1,
  };

  // Confidence thresholds
  private readonly HIGH_CONFIDENCE_THRESHOLD = 0.85;
  private readonly MEDIUM_CONFIDENCE_THRESHOLD = 0.6;

  // Minimum matches before a pattern is auto-suggested with high confidence
  private readonly PATTERN_LEARNING_THRESHOLD = 3;

  constructor(private prisma: PrismaService) {}

  /**
   * Match a bank transaction against potential candidates
   */
  async matchTransaction(
    organizationId: string,
    transactionId: string,
    minConfidence: number = 0.3,
  ): Promise<MatchScore[]> {
    // Get the bank transaction
    const transaction = await this.prisma.bankTransaction.findFirst({
      where: { id: transactionId, organizationId },
    });

    if (!transaction) {
      return [];
    }

    // Check for learned patterns first
    const learnedMatch = await this.applyLearnedPatterns(
      organizationId,
      transaction.description || '',
    );

    // Get candidates based on transaction type
    const candidates = await this.getCandidates(
      organizationId,
      transaction.type,
      Number(transaction.amount),
      transaction.date,
    );

    // Score each candidate
    const scores: MatchScore[] = [];

    for (const candidate of candidates) {
      const score = this.calculateMatchScore(transaction, candidate);

      // Boost score if matches learned pattern
      if (
        learnedMatch &&
        learnedMatch.suggestedEntityType === candidate.entityType &&
        score.entityId === learnedMatch.suggestedEntityId
      ) {
        score.totalScore = Math.min(1, score.totalScore + 0.2);
        score.matchReasons.push('Matches learned pattern');
      }

      if (score.totalScore >= minConfidence) {
        scores.push(score);
      }
    }

    // Sort by score descending
    scores.sort((a, b) => b.totalScore - a.totalScore);

    // Return top 5 matches
    return scores.slice(0, 5);
  }

  /**
   * Calculate match score between transaction and candidate
   */
  private calculateMatchScore(
    transaction: any,
    candidate: { entityType: string; entity: any },
  ): MatchScore {
    const matchReasons: string[] = [];

    // 1. Amount matching (40% weight)
    const amountScore = this.calculateAmountScore(
      Number(transaction.amount),
      this.getCandidateAmount(candidate),
    );
    if (amountScore >= 1) matchReasons.push('Exact amount match');
    else if (amountScore >= 0.5) matchReasons.push('Amount within 5%');

    // 2. Reference matching (30% weight)
    const referenceScore = this.calculateReferenceScore(
      transaction.description || '',
      transaction.reference || '',
      this.getCandidateReference(candidate),
    );
    if (referenceScore >= 0.5) matchReasons.push('Reference number match');

    // 3. Name matching (20% weight)
    const nameScore = this.calculateNameScore(
      transaction.payee || transaction.description || '',
      this.getCandidateName(candidate),
    );
    if (nameScore >= 0.7) matchReasons.push('Name/payee match');

    // 4. Date proximity (10% weight)
    const dateScore = this.calculateDateScore(
      transaction.date,
      this.getCandidateDate(candidate),
    );
    if (dateScore >= 0.1) matchReasons.push('Date proximity');

    // Calculate total weighted score
    const totalScore =
      amountScore * this.WEIGHTS.amount +
      referenceScore * this.WEIGHTS.reference +
      nameScore * this.WEIGHTS.name +
      dateScore * this.WEIGHTS.date;

    // Determine confidence level
    let confidence: 'high' | 'medium' | 'low' = 'low';
    if (totalScore >= this.HIGH_CONFIDENCE_THRESHOLD) {
      confidence = 'high';
    } else if (totalScore >= this.MEDIUM_CONFIDENCE_THRESHOLD) {
      confidence = 'medium';
    }

    return {
      entityType: candidate.entityType as MatchScore['entityType'],
      entityId: candidate.entity.id,
      entity: candidate.entity,
      totalScore,
      breakdown: {
        amountScore,
        referenceScore,
        nameScore,
        dateScore,
      },
      confidence,
      matchReasons,
    };
  }

  /**
   * Calculate amount matching score
   */
  private calculateAmountScore(
    transactionAmount: number,
    candidateAmount: number,
    tolerance: number = 0.01,
  ): number {
    const diff = Math.abs(transactionAmount - candidateAmount);

    // Exact match (within tolerance)
    if (diff < tolerance) return 1.0;

    // Within 5%
    const percentDiff = diff / Math.max(transactionAmount, candidateAmount);
    if (percentDiff <= 0.05) return 0.5;

    // Within 10%
    if (percentDiff <= 0.1) return 0.2;

    return 0;
  }

  /**
   * Calculate reference matching score using regex patterns
   */
  private calculateReferenceScore(
    transactionDescription: string,
    transactionReference: string,
    candidateReference: string,
  ): number {
    if (!candidateReference) return 0;

    const combinedText = `${transactionDescription} ${transactionReference}`.toUpperCase();
    const normalizedRef = candidateReference.toUpperCase();

    // Exact match
    if (combinedText.includes(normalizedRef)) return 1.0;

    // Extract document numbers from description
    const extractedNumbers = extractDocumentNumbers(combinedText);
    for (const num of extractedNumbers) {
      if (num.toUpperCase() === normalizedRef) return 1.0;
      if (
        levenshteinSimilarity(num.toUpperCase(), normalizedRef) > 0.8
      ) {
        return 0.5;
      }
    }

    // Partial match (reference appears partially)
    const normalizedDesc = normalizeText(combinedText);
    if (normalizedDesc.includes(normalizeText(candidateReference))) {
      return 0.5;
    }

    return 0;
  }

  /**
   * Calculate name matching score using Levenshtein distance
   */
  private calculateNameScore(
    transactionPayee: string,
    candidateName: string,
  ): number {
    if (!transactionPayee || !candidateName) return 0;

    const normalizedPayee = normalizeText(transactionPayee);
    const normalizedName = normalizeText(candidateName);

    // Exact substring match
    if (
      normalizedPayee.includes(normalizedName) ||
      normalizedName.includes(normalizedPayee)
    ) {
      return 1.0;
    }

    // Fuzzy match using Levenshtein
    const similarity = levenshteinSimilarity(normalizedPayee, normalizedName);
    return similarity >= 0.7 ? similarity : 0;
  }

  /**
   * Calculate date proximity score
   */
  private calculateDateScore(
    transactionDate: Date,
    candidateDate: Date,
    maxDaysDiff: number = 30,
  ): number {
    const daysDiff = Math.abs(
      Math.floor(
        (transactionDate.getTime() - candidateDate.getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );

    if (daysDiff <= 3) return 1.0;
    if (daysDiff <= 7) return 0.5;
    if (daysDiff <= 14) return 0.25;
    if (daysDiff <= maxDaysDiff) return 0.1;
    return 0;
  }

  /**
   * Get candidates for matching based on transaction type
   */
  private async getCandidates(
    organizationId: string,
    transactionType: string,
    amount: number,
    date: Date,
  ): Promise<Array<{ entityType: string; entity: any }>> {
    const candidates: Array<{ entityType: string; entity: any }> = [];

    // Date range for candidates (90 days before and after)
    const startDate = new Date(date);
    startDate.setDate(startDate.getDate() - 90);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 90);

    // Amount range (±20%)
    const minAmount = amount * 0.8;
    const maxAmount = amount * 1.2;

    if (transactionType === 'DEPOSIT') {
      // Match against invoices and customer payments
      const invoices = await this.prisma.invoice.findMany({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
          grandTotal: { gte: minAmount, lte: maxAmount },
          date: { gte: startDate, lte: endDate },
        },
        include: { customer: { select: { id: true, name: true } } },
      });

      for (const invoice of invoices) {
        candidates.push({ entityType: 'invoice', entity: invoice });
      }

      const payments = await this.prisma.paymentReceived.findMany({
        where: {
          organizationId,
          deletedAt: null,
          amount: { gte: minAmount, lte: maxAmount },
          date: { gte: startDate, lte: endDate },
        },
        include: { customer: { select: { id: true, name: true } } },
      });

      for (const payment of payments) {
        candidates.push({ entityType: 'payment', entity: payment });
      }
    } else {
      // WITHDRAWAL - match against bills and expenses
      const bills = await this.prisma.bill.findMany({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: ['OPEN', 'PARTIALLY_PAID', 'OVERDUE'] },
          grandTotal: { gte: minAmount, lte: maxAmount },
          date: { gte: startDate, lte: endDate },
        },
        include: { vendor: { select: { id: true, name: true } } },
      });

      for (const bill of bills) {
        candidates.push({ entityType: 'bill', entity: bill });
      }

      const expenses = await this.prisma.expense.findMany({
        where: {
          organizationId,
          deletedAt: null,
          amount: { gte: minAmount, lte: maxAmount },
          date: { gte: startDate, lte: endDate },
        },
        include: { vendor: { select: { id: true, name: true } } },
      });

      for (const expense of expenses) {
        candidates.push({ entityType: 'expense', entity: expense });
      }
    }

    return candidates;
  }

  // Helper methods to extract data from different entity types
  private getCandidateAmount(candidate: {
    entityType: string;
    entity: any;
  }): number {
    switch (candidate.entityType) {
      case 'invoice':
        return Number(candidate.entity.grandTotal);
      case 'bill':
        return Number(candidate.entity.grandTotal);
      case 'expense':
        return Number(candidate.entity.amount);
      case 'payment':
        return Number(candidate.entity.amount);
      default:
        return 0;
    }
  }

  private getCandidateReference(candidate: {
    entityType: string;
    entity: any;
  }): string {
    switch (candidate.entityType) {
      case 'invoice':
        return candidate.entity.invoiceNumber;
      case 'bill':
        return candidate.entity.billNumber;
      case 'expense':
        return candidate.entity.reference || '';
      case 'payment':
        return candidate.entity.paymentNumber;
      default:
        return '';
    }
  }

  private getCandidateName(candidate: {
    entityType: string;
    entity: any;
  }): string {
    switch (candidate.entityType) {
      case 'invoice':
      case 'payment':
        return candidate.entity.customer?.name || '';
      case 'bill':
      case 'expense':
        return candidate.entity.vendor?.name || '';
      default:
        return '';
    }
  }

  private getCandidateDate(candidate: {
    entityType: string;
    entity: any;
  }): Date {
    return candidate.entity.date || candidate.entity.createdAt;
  }

  /**
   * Learn from a confirmed match
   */
  async learnFromConfirmation(
    organizationId: string,
    transactionId: string,
    matchedEntityType: string,
    matchedEntityId: string,
  ): Promise<void> {
    // Get the transaction
    const transaction = await this.prisma.bankTransaction.findFirst({
      where: { id: transactionId, organizationId },
    });

    if (!transaction || !transaction.description) return;

    const pattern = extractPattern(transaction.description);
    const descriptionHash = generateDescriptionHash(pattern);

    // Upsert the pattern
    await this.prisma.reconciliationPattern.upsert({
      where: {
        organizationId_descriptionHash: {
          organizationId,
          descriptionHash,
        },
      },
      update: {
        matchedEntity: matchedEntityType,
        matchedEntityId,
        matchCount: { increment: 1 },
        confidence: new Decimal(
          Math.min(
            1,
            0.5 + 0.1 * (await this.getPatternMatchCount(organizationId, descriptionHash)),
          ),
        ),
        lastMatchedAt: new Date(),
      },
      create: {
        organizationId,
        descriptionHash,
        pattern,
        matchedEntity: matchedEntityType,
        matchedEntityId,
        confidence: new Decimal(0.5),
        matchCount: 1,
      },
    });

    // Update the transaction status
    await this.prisma.bankTransaction.update({
      where: { id: transactionId },
      data: {
        status: 'MATCHED',
        matchedEntityType,
        matchedEntityId,
      },
    });

    this.logger.debug(
      `Learned pattern for transaction ${transactionId}: ${pattern}`,
    );
  }

  private async getPatternMatchCount(
    organizationId: string,
    descriptionHash: string,
  ): Promise<number> {
    const pattern = await this.prisma.reconciliationPattern.findUnique({
      where: {
        organizationId_descriptionHash: {
          organizationId,
          descriptionHash,
        },
      },
      select: { matchCount: true },
    });
    return pattern?.matchCount || 0;
  }

  /**
   * Apply learned patterns to a transaction
   */
  async applyLearnedPatterns(
    organizationId: string,
    transactionDescription: string,
  ): Promise<{
    pattern: string;
    suggestedEntityType: string;
    suggestedEntityId: string | null;
    confidence: number;
  } | null> {
    if (!transactionDescription) return null;

    const txPattern = extractPattern(transactionDescription);
    const descriptionHash = generateDescriptionHash(txPattern);

    // Try exact match first
    let pattern = await this.prisma.reconciliationPattern.findUnique({
      where: {
        organizationId_descriptionHash: {
          organizationId,
          descriptionHash,
        },
      },
    });

    // If no exact match, try fuzzy matching
    if (!pattern) {
      const allPatterns = await this.prisma.reconciliationPattern.findMany({
        where: { organizationId },
        orderBy: { matchCount: 'desc' },
        take: 100,
      });

      for (const p of allPatterns) {
        if (patternMatches(p.pattern, transactionDescription)) {
          pattern = p;
          break;
        }
      }
    }

    if (!pattern) return null;

    // Only suggest if pattern has enough matches
    if (pattern.matchCount < this.PATTERN_LEARNING_THRESHOLD) {
      return null;
    }

    return {
      pattern: pattern.pattern,
      suggestedEntityType: pattern.matchedEntity,
      suggestedEntityId: pattern.matchedEntityId,
      confidence: Number(pattern.confidence),
    };
  }

  /**
   * Create a bank rule
   */
  async createRule(
    organizationId: string,
    dto: {
      name: string;
      bankAccountId?: string;
      conditions: BankRuleCondition[];
      action: BankRuleAction;
    },
  ): Promise<{ id: string }> {
    const rule = await this.prisma.bankRule.create({
      data: {
        organizationId,
        name: dto.name,
        bankAccountId: dto.bankAccountId,
        conditions: dto.conditions as unknown as Prisma.InputJsonValue,
        action: dto.action as unknown as Prisma.InputJsonValue,
        isActive: true,
      },
    });

    this.logger.log(`Created bank rule ${rule.id} for org ${organizationId}`);

    return { id: rule.id };
  }

  /**
   * Apply rules to a transaction
   */
  async applyRules(
    organizationId: string,
    transactionId: string,
  ): Promise<{ matched: boolean; rule?: any; action?: any }> {
    const transaction = await this.prisma.bankTransaction.findFirst({
      where: { id: transactionId, organizationId },
    });

    if (!transaction) {
      return { matched: false };
    }

    // Get active rules for this bank account (or all accounts)
    const rules = await this.prisma.bankRule.findMany({
      where: {
        organizationId,
        isActive: true,
        OR: [
          { bankAccountId: transaction.bankAccountId },
          { bankAccountId: null },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    for (const rule of rules) {
      const conditions = rule.conditions as unknown as BankRuleCondition[];
      const allConditionsMet = conditions.every((condition) =>
        this.evaluateCondition(transaction, condition),
      );

      if (allConditionsMet) {
        return {
          matched: true,
          rule,
          action: rule.action as unknown as BankRuleAction,
        };
      }
    }

    return { matched: false };
  }

  /**
   * Evaluate a rule condition against a transaction
   */
  private evaluateCondition(
    transaction: any,
    condition: BankRuleCondition,
  ): boolean {
    const fieldValue = this.getFieldValue(transaction, condition.field);
    const conditionValue = condition.value;

    switch (condition.operator) {
      case 'contains':
        return String(fieldValue)
          .toLowerCase()
          .includes(conditionValue.toLowerCase());
      case 'equals':
        return String(fieldValue).toLowerCase() === conditionValue.toLowerCase();
      case 'startsWith':
        return String(fieldValue)
          .toLowerCase()
          .startsWith(conditionValue.toLowerCase());
      case 'endsWith':
        return String(fieldValue)
          .toLowerCase()
          .endsWith(conditionValue.toLowerCase());
      case 'greaterThan':
        return Number(fieldValue) > Number(conditionValue);
      case 'lessThan':
        return Number(fieldValue) < Number(conditionValue);
      default:
        return false;
    }
  }

  /**
   * Get field value from transaction
   */
  private getFieldValue(transaction: any, field: string): any {
    switch (field) {
      case 'description':
        return transaction.description || '';
      case 'reference':
        return transaction.reference || '';
      case 'payee':
        return transaction.payee || '';
      case 'amount':
        return Number(transaction.amount);
      case 'type':
        return transaction.type;
      default:
        return transaction[field] || '';
    }
  }

  /**
   * Get all rules for an organization
   */
  async getRules(
    organizationId: string,
    bankAccountId?: string,
  ): Promise<any[]> {
    return this.prisma.bankRule.findMany({
      where: {
        organizationId,
        ...(bankAccountId && { bankAccountId }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update a rule
   */
  async updateRule(
    organizationId: string,
    ruleId: string,
    data: Partial<{
      name: string;
      conditions: BankRuleCondition[];
      action: BankRuleAction;
      isActive: boolean;
    }>,
  ): Promise<void> {
    const updateData: Prisma.BankRuleUpdateInput = {
      ...(data.name && { name: data.name }),
      ...(data.conditions && { conditions: data.conditions as unknown as Prisma.InputJsonValue }),
      ...(data.action && { action: data.action as unknown as Prisma.InputJsonValue }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    };
    await this.prisma.bankRule.update({
      where: {
        id: ruleId,
        organizationId,
      },
      data: updateData,
    });
  }

  /**
   * Delete a rule
   */
  async deleteRule(organizationId: string, ruleId: string): Promise<void> {
    await this.prisma.bankRule.delete({
      where: {
        id: ruleId,
        organizationId,
      },
    });
  }

  /**
   * Get learned reconciliation patterns
   */
  async getLearnedPatterns(
    organizationId: string,
    minMatchCount: number = 1,
  ): Promise<any[]> {
    return this.prisma.reconciliationPattern.findMany({
      where: {
        organizationId,
        matchCount: { gte: minMatchCount },
      },
      orderBy: { matchCount: 'desc' },
    });
  }

  /**
   * Bulk auto-match transactions with high confidence
   */
  async bulkAutoMatch(
    organizationId: string,
    transactionIds: string[],
    minConfidence: number = 0.85,
  ): Promise<{
    matched: number;
    unmatched: number;
    results: Array<{
      transactionId: string;
      matched: boolean;
      entityType?: string;
      entityId?: string;
      confidence?: number;
    }>;
  }> {
    const results: Array<{
      transactionId: string;
      matched: boolean;
      entityType?: string;
      entityId?: string;
      confidence?: number;
    }> = [];

    let matched = 0;
    let unmatched = 0;

    for (const transactionId of transactionIds) {
      const matches = await this.matchTransaction(organizationId, transactionId, minConfidence);

      if (matches.length > 0 && matches[0].totalScore >= minConfidence) {
        const bestMatch = matches[0];

        // Auto-confirm the match
        await this.learnFromConfirmation(
          organizationId,
          transactionId,
          bestMatch.entityType,
          bestMatch.entityId,
        );

        results.push({
          transactionId,
          matched: true,
          entityType: bestMatch.entityType,
          entityId: bestMatch.entityId,
          confidence: bestMatch.totalScore,
        });
        matched++;
      } else {
        results.push({
          transactionId,
          matched: false,
        });
        unmatched++;
      }
    }

    this.logger.log(
      `Bulk match completed: ${matched} matched, ${unmatched} unmatched`,
    );

    return { matched, unmatched, results };
  }
}
