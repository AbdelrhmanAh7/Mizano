import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import type { Prisma } from '@prisma/client';
import { PatternStatus, SuggestionType, SuggestionStatus } from '@prisma/client';
import {
  detectDateInDescription,
  normalizeEntityName,
  detectFrequency,
  getAmountCluster,
  isPotentialDuplicate,
  generatePatternHash,
  daysBetween,
  calculateNextOccurrence,
} from '../utils/date-pattern.util';

interface TransactionData {
  id: string;
  sourceType: 'journal' | 'expense' | 'bank_transaction';
  entityType: 'vendor' | 'customer' | 'account';
  entityId: string | null;
  entityName: string;
  amount: number;
  date: Date;
  description: string | null;
}

interface TransactionCluster {
  entityName: string;
  entityType: string;
  entityId: string | null;
  amountCluster: number;
  transactions: TransactionData[];
}

interface AnalysisResult {
  patternsDetected: number;
  patternsUpdated: number;
  suggestionsCreated: number;
  duplicatesFound: number;
}

interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchingTransaction?: {
    id: string;
    sourceType: string;
    date: Date;
    amount: number;
    description: string | null;
  };
  confidence: number;
  warning?: string;
}

@Injectable()
export class PatternDetectionService {
  private readonly logger = new Logger(PatternDetectionService.name);

  // Configuration constants
  private readonly AMOUNT_VARIANCE_THRESHOLD = 0.01; // ±1%
  private readonly MIN_OCCURRENCES_FOR_PATTERN = 3;
  private readonly MIN_OCCURRENCES_FOR_SUGGESTION = 4;
  private readonly DUPLICATE_WINDOW_DAYS = 3;
  private readonly LOOKBACK_MONTHS = 6;

  constructor(private prisma: PrismaService) {}

  /**
   * Main entry point: Analyze all transactions for patterns
   */
  async analyzePatterns(organizationId: string): Promise<AnalysisResult> {
    this.logger.log(`Starting pattern analysis for org ${organizationId}`);

    const result: AnalysisResult = {
      patternsDetected: 0,
      patternsUpdated: 0,
      suggestionsCreated: 0,
      duplicatesFound: 0,
    };

    try {
      // Step 1: Fetch transactions from last 6 months
      const transactions = await this.fetchTransactions(organizationId);
      this.logger.debug(`Fetched ${transactions.length} transactions`);

      // Step 2: Cluster by entity + amount
      const clusters = this.clusterTransactions(transactions);
      this.logger.debug(`Created ${clusters.length} clusters`);

      // Step 3: Analyze each cluster
      for (const cluster of clusters) {
        if (cluster.transactions.length >= this.MIN_OCCURRENCES_FOR_PATTERN) {
          const patternResult = await this.processCluster(organizationId, cluster);

          if (patternResult.isNew) {
            result.patternsDetected++;
          } else {
            result.patternsUpdated++;
          }

          if (patternResult.suggestionCreated) {
            result.suggestionsCreated++;
          }
        }
      }

      // Step 4: Check for duplicates
      result.duplicatesFound = await this.detectDuplicates(organizationId, transactions);

      // Step 5: Mark stale patterns
      await this.markStalePatterns(organizationId);

      this.logger.log(
        `Pattern analysis completed: ${result.patternsDetected} new, ${result.patternsUpdated} updated, ${result.suggestionsCreated} suggestions`,
      );

      return result;
    } catch (error) {
      this.logger.error(`Pattern analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if a new transaction might be a duplicate
   */
  async checkForDuplicate(
    organizationId: string,
    entityName: string,
    amount: number,
    date: Date | string,
  ): Promise<DuplicateCheckResult> {
    const checkDate = new Date(date);
    const normalizedEntity = normalizeEntityName(entityName);

    // Look for similar transactions within the window
    const startDate = new Date(checkDate);
    startDate.setDate(startDate.getDate() - this.DUPLICATE_WINDOW_DAYS);

    const endDate = new Date(checkDate);
    endDate.setDate(endDate.getDate() + this.DUPLICATE_WINDOW_DAYS);

    // Check expenses
    const expenses = await this.prisma.expense.findMany({
      where: {
        organizationId,
        date: { gte: startDate, lte: endDate },
        deletedAt: null,
      },
      include: { vendor: true },
    });

    for (const expense of expenses) {
      const expenseEntityName = expense.vendor?.name || '';
      if (
        isPotentialDuplicate(
          { entityName: normalizedEntity, amount, date: checkDate },
          {
            entityName: expenseEntityName,
            amount: expense.amount.toNumber(),
            date: expense.date,
          },
          this.DUPLICATE_WINDOW_DAYS,
          this.AMOUNT_VARIANCE_THRESHOLD,
        )
      ) {
        return {
          isDuplicate: true,
          matchingTransaction: {
            id: expense.id,
            sourceType: 'expense',
            date: expense.date,
            amount: expense.amount.toNumber(),
            description: expense.description,
          },
          confidence: 0.85,
          warning: `Possible duplicate: Similar transaction to ${expenseEntityName} for $${expense.amount.toNumber()} found on ${expense.date.toLocaleDateString()}`,
        };
      }
    }

    // Check bank transactions
    const bankTransactions = await this.prisma.bankTransaction.findMany({
      where: {
        organizationId,
        date: { gte: startDate, lte: endDate },
      },
    });

    for (const bt of bankTransactions) {
      const btEntityName = bt.payee || bt.description || '';
      if (
        isPotentialDuplicate(
          { entityName: normalizedEntity, amount, date: checkDate },
          {
            entityName: btEntityName,
            amount: bt.amount.toNumber(),
            date: bt.date,
          },
          this.DUPLICATE_WINDOW_DAYS,
          this.AMOUNT_VARIANCE_THRESHOLD,
        )
      ) {
        return {
          isDuplicate: true,
          matchingTransaction: {
            id: bt.id,
            sourceType: 'bank_transaction',
            date: bt.date,
            amount: bt.amount.toNumber(),
            description: bt.description,
          },
          confidence: 0.8,
          warning: `Possible duplicate: Similar bank transaction found on ${bt.date.toLocaleDateString()}`,
        };
      }
    }

    return { isDuplicate: false, confidence: 0 };
  }

  /**
   * Get detected patterns with filters
   */
  async getPatterns(
    organizationId: string,
    options?: {
      status?: PatternStatus;
      entityType?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: Prisma.TransactionPatternWhereInput = { organizationId };

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.entityType) {
      where.entityType = options.entityType;
    }

    const [data, total] = await Promise.all([
      this.prisma.transactionPattern.findMany({
        where,
        include: {
          occurrences: {
            orderBy: { date: 'desc' },
            take: 5,
          },
          suggestions: {
            where: { status: SuggestionStatus.PENDING },
          },
        },
        orderBy: { lastOccurrence: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
      }),
      this.prisma.transactionPattern.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Get pending suggestions
   */
  async getPendingSuggestions(organizationId: string, limit?: number) {
    return this.prisma.patternSuggestion.findMany({
      where: {
        organizationId,
        status: SuggestionStatus.PENDING,
      },
      include: {
        pattern: {
          include: {
            occurrences: {
              orderBy: { date: 'desc' },
              take: 5,
            },
          },
        },
      },
      orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
      take: limit || 20,
    });
  }

  /**
   * Accept a suggestion and create RecurringProfile
   */
  async acceptSuggestion(
    organizationId: string,
    suggestionId: string,
    options?: { autoPost?: boolean; name?: string },
  ): Promise<{ recurringProfileId: string }> {
    const suggestion = await this.prisma.patternSuggestion.findFirst({
      where: { id: suggestionId, organizationId },
      include: { pattern: { include: { occurrences: { orderBy: { date: 'desc' }, take: 1 } } } },
    });

    if (!suggestion) {
      throw new NotFoundException('Suggestion not found');
    }

    if (suggestion.status !== SuggestionStatus.PENDING) {
      throw new BadRequestException('Suggestion is not pending');
    }

    const pattern = suggestion.pattern;

    // Create RecurringProfile from pattern
    const profileName =
      options?.name || `Recurring ${pattern.entityName} - ${pattern.amountCluster}`;

    const nextDate = suggestion.suggestedFrequency
      ? calculateNextOccurrence(pattern.lastOccurrence, suggestion.suggestedFrequency)
      : new Date(pattern.lastOccurrence);
    nextDate.setMonth(nextDate.getMonth() + 1);

    // Build template data based on entity type
    const templateData = {
      entityType: pattern.entityType,
      entityId: pattern.entityId,
      entityName: pattern.entityName,
      amount: suggestion.suggestedAmount.toNumber(),
      description: pattern.descriptionPattern || `Payment to ${pattern.entityName}`,
    };

    const recurringProfile = await this.prisma.recurringProfile.create({
      data: {
        name: profileName,
        frequency: suggestion.suggestedFrequency || 'MONTHLY',
        startDate: pattern.firstOccurrence,
        nextRunDate: nextDate,
        isActive: true,
        autoPost: options?.autoPost || false,
        templateData,
        entityType: 'expense', // Default to expense
        organizationId,
      },
    });

    // Update suggestion and pattern
    await this.prisma.$transaction([
      this.prisma.patternSuggestion.update({
        where: { id: suggestionId },
        data: {
          status: SuggestionStatus.ACCEPTED,
          recurringProfileId: recurringProfile.id,
        },
      }),
      this.prisma.transactionPattern.update({
        where: { id: pattern.id },
        data: { status: PatternStatus.CONVERTED },
      }),
    ]);

    return { recurringProfileId: recurringProfile.id };
  }

  /**
   * Dismiss a suggestion
   */
  async dismissSuggestion(
    organizationId: string,
    suggestionId: string,
    reason?: string,
  ): Promise<void> {
    const suggestion = await this.prisma.patternSuggestion.findFirst({
      where: { id: suggestionId, organizationId },
    });

    if (!suggestion) {
      throw new NotFoundException('Suggestion not found');
    }

    await this.prisma.patternSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: SuggestionStatus.DISMISSED,
        dismissedAt: new Date(),
        dismissedReason: reason,
      },
    });
  }

  /**
   * Record a new transaction for pattern tracking
   * Called when transactions are created
   */
  async recordTransaction(
    organizationId: string,
    transaction: {
      sourceType: 'journal' | 'expense' | 'bank_transaction';
      sourceId: string;
      entityType: 'vendor' | 'customer' | 'account';
      entityName: string;
      entityId?: string;
      amount: number;
      date: Date;
      description?: string;
    },
  ): Promise<{
    patternId?: string;
    isDuplicate: boolean;
    duplicateWarning?: string;
  }> {
    // Check for duplicates first
    const duplicateCheck = await this.checkForDuplicate(
      organizationId,
      transaction.entityName,
      transaction.amount,
      transaction.date,
    );

    if (duplicateCheck.isDuplicate) {
      return {
        isDuplicate: true,
        duplicateWarning: duplicateCheck.warning,
      };
    }

    const normalizedEntity = normalizeEntityName(transaction.entityName);
    const amountCluster = new Decimal(
      getAmountCluster(transaction.amount, this.AMOUNT_VARIANCE_THRESHOLD),
    );

    // Find or create pattern
    let pattern = await this.prisma.transactionPattern.findFirst({
      where: {
        organizationId,
        entityName: normalizedEntity,
        amountCluster: {
          gte: amountCluster.mul(1 - this.AMOUNT_VARIANCE_THRESHOLD),
          lte: amountCluster.mul(1 + this.AMOUNT_VARIANCE_THRESHOLD),
        },
      },
    });

    // Extract description pattern
    const dateDetection = detectDateInDescription(transaction.description || '');

    if (!pattern) {
      pattern = await this.prisma.transactionPattern.create({
        data: {
          entityType: transaction.entityType,
          entityId: transaction.entityId,
          entityName: normalizedEntity,
          amountCluster,
          amountVariance: new Decimal(this.AMOUNT_VARIANCE_THRESHOLD),
          occurrenceCount: 1,
          firstOccurrence: transaction.date,
          lastOccurrence: transaction.date,
          descriptionPattern: dateDetection.hasDate ? dateDetection.pattern : null,
          descriptionHash: dateDetection.hasDate
            ? generatePatternHash(dateDetection.pattern)
            : null,
          organizationId,
        },
      });
    } else {
      // Update existing pattern
      await this.prisma.transactionPattern.update({
        where: { id: pattern.id },
        data: {
          occurrenceCount: { increment: 1 },
          lastOccurrence: transaction.date,
        },
      });
    }

    // Record the occurrence
    await this.prisma.patternOccurrence.create({
      data: {
        patternId: pattern.id,
        sourceType: transaction.sourceType,
        sourceId: transaction.sourceId,
        amount: new Decimal(transaction.amount),
        date: transaction.date,
        description: transaction.description,
        organizationId,
      },
    });

    // Check if we should create a suggestion
    const updatedPattern = await this.prisma.transactionPattern.findUnique({
      where: { id: pattern.id },
      include: { occurrences: { orderBy: { date: 'asc' } }, suggestions: true },
    });

    if (
      updatedPattern &&
      updatedPattern.occurrenceCount >= this.MIN_OCCURRENCES_FOR_SUGGESTION &&
      updatedPattern.suggestions.length === 0 &&
      updatedPattern.status === PatternStatus.DETECTED
    ) {
      await this.createSuggestionForPattern(organizationId, updatedPattern);
    }

    return { patternId: pattern.id, isDuplicate: false };
  }

  /**
   * Get pattern details with all occurrences
   */
  async getPatternDetails(organizationId: string, patternId: string) {
    const pattern = await this.prisma.transactionPattern.findFirst({
      where: { id: patternId, organizationId },
      include: {
        occurrences: { orderBy: { date: 'desc' } },
        suggestions: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!pattern) {
      throw new NotFoundException('Pattern not found');
    }

    // Calculate additional stats
    const dates = pattern.occurrences.map((o) => o.date);
    const frequencyAnalysis = detectFrequency(dates);

    return {
      ...pattern,
      frequencyAnalysis,
      nextExpectedDate: frequencyAnalysis.frequency
        ? calculateNextOccurrence(pattern.lastOccurrence, frequencyAnalysis.frequency)
        : null,
    };
  }

  // ============ Private Helper Methods ============

  /**
   * Fetch all relevant transactions from the last N months
   */
  private async fetchTransactions(organizationId: string): Promise<TransactionData[]> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - this.LOOKBACK_MONTHS);

    const transactions: TransactionData[] = [];

    // Fetch expenses with vendor info
    const expenses = await this.prisma.expense.findMany({
      where: {
        organizationId,
        date: { gte: startDate },
        deletedAt: null,
      },
      include: { vendor: true },
    });

    for (const expense of expenses) {
      if (expense.vendor) {
        transactions.push({
          id: expense.id,
          sourceType: 'expense',
          entityType: 'vendor',
          entityId: expense.vendorId,
          entityName: expense.vendor.name,
          amount: expense.amount.toNumber(),
          date: expense.date,
          description: expense.description,
        });
      }
    }

    // Fetch journal entries
    const journals = await this.prisma.journal.findMany({
      where: {
        organizationId,
        date: { gte: startDate },
        deletedAt: null,
      },
      include: {
        lines: {
          include: { account: true },
        },
      },
    });

    for (const journal of journals) {
      for (const line of journal.lines) {
        const amount = line.debit.toNumber() || line.credit.toNumber();
        if (amount > 0) {
          transactions.push({
            id: journal.id,
            sourceType: 'journal',
            entityType: 'account',
            entityId: line.accountId,
            entityName: line.account.name,
            amount,
            date: journal.date,
            description: line.description || journal.notes,
          });
        }
      }
    }

    // Fetch bank transactions
    const bankTransactions = await this.prisma.bankTransaction.findMany({
      where: {
        organizationId,
        date: { gte: startDate },
      },
    });

    for (const bt of bankTransactions) {
      const entityName = bt.payee || bt.description || 'Unknown';
      transactions.push({
        id: bt.id,
        sourceType: 'bank_transaction',
        entityType: 'vendor', // Default assumption
        entityId: null,
        entityName,
        amount: bt.amount.toNumber(),
        date: bt.date,
        description: bt.description,
      });
    }

    return transactions;
  }

  /**
   * Cluster transactions by entity + amount
   */
  private clusterTransactions(transactions: TransactionData[]): TransactionCluster[] {
    const clusterMap = new Map<string, TransactionCluster>();

    for (const tx of transactions) {
      const normalizedEntity = normalizeEntityName(tx.entityName);
      const amountCluster = getAmountCluster(tx.amount, this.AMOUNT_VARIANCE_THRESHOLD);
      const key = `${normalizedEntity}|${amountCluster}`;

      if (!clusterMap.has(key)) {
        clusterMap.set(key, {
          entityName: normalizedEntity,
          entityType: tx.entityType,
          entityId: tx.entityId,
          amountCluster,
          transactions: [],
        });
      }

      clusterMap.get(key)!.transactions.push(tx);
    }

    return Array.from(clusterMap.values());
  }

  /**
   * Process a cluster and update/create pattern
   */
  private async processCluster(
    organizationId: string,
    cluster: TransactionCluster,
  ): Promise<{ isNew: boolean; suggestionCreated: boolean }> {
    // Sort transactions by date
    cluster.transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Analyze frequency
    const dates = cluster.transactions.map((t) => t.date);
    const frequencyAnalysis = detectFrequency(dates);

    // Find description pattern
    let descriptionPattern: string | null = null;
    let descriptionHash: string | null = null;

    for (const tx of cluster.transactions) {
      const detection = detectDateInDescription(tx.description || '');
      if (detection.hasDate) {
        descriptionPattern = detection.pattern;
        descriptionHash = generatePatternHash(detection.pattern);
        break;
      }
    }

    // Check if pattern exists
    let pattern = await this.prisma.transactionPattern.findFirst({
      where: {
        organizationId,
        entityName: cluster.entityName,
        amountCluster: {
          gte: new Decimal(cluster.amountCluster * (1 - this.AMOUNT_VARIANCE_THRESHOLD)),
          lte: new Decimal(cluster.amountCluster * (1 + this.AMOUNT_VARIANCE_THRESHOLD)),
        },
      },
      include: { suggestions: true },
    });

    const isNew = !pattern;

    if (!pattern) {
      // Create new pattern
      pattern = await this.prisma.transactionPattern.create({
        data: {
          entityType: cluster.entityType,
          entityId: cluster.entityId,
          entityName: cluster.entityName,
          amountCluster: new Decimal(cluster.amountCluster),
          amountVariance: new Decimal(this.AMOUNT_VARIANCE_THRESHOLD),
          frequency: frequencyAnalysis.frequency,
          frequencyDays: frequencyAnalysis.interval,
          frequencyStdDev: frequencyAnalysis.stdDev ? new Decimal(frequencyAnalysis.stdDev) : null,
          occurrenceCount: cluster.transactions.length,
          firstOccurrence: cluster.transactions[0].date,
          lastOccurrence: cluster.transactions[cluster.transactions.length - 1].date,
          descriptionPattern,
          descriptionHash,
          confidence: new Decimal(frequencyAnalysis.confidence),
          organizationId,
        },
        include: { suggestions: true },
      });

      // Record occurrences
      await this.prisma.patternOccurrence.createMany({
        data: cluster.transactions.map((tx) => ({
          patternId: pattern!.id,
          sourceType: tx.sourceType,
          sourceId: tx.id,
          amount: new Decimal(tx.amount),
          date: tx.date,
          description: tx.description,
          organizationId,
        })),
      });
    } else {
      // Update existing pattern
      await this.prisma.transactionPattern.update({
        where: { id: pattern.id },
        data: {
          frequency: frequencyAnalysis.frequency,
          frequencyDays: frequencyAnalysis.interval,
          frequencyStdDev: frequencyAnalysis.stdDev ? new Decimal(frequencyAnalysis.stdDev) : null,
          occurrenceCount: cluster.transactions.length,
          lastOccurrence: cluster.transactions[cluster.transactions.length - 1].date,
          confidence: new Decimal(frequencyAnalysis.confidence),
        },
      });
    }

    // Check if we should create a suggestion
    let suggestionCreated = false;
    if (
      cluster.transactions.length >= this.MIN_OCCURRENCES_FOR_SUGGESTION &&
      pattern.suggestions.length === 0 &&
      pattern.status === PatternStatus.DETECTED &&
      frequencyAnalysis.confidence >= 0.5
    ) {
      await this.createSuggestionForPattern(organizationId, pattern);
      suggestionCreated = true;
    }

    return { isNew, suggestionCreated };
  }

  /**
   * Create a suggestion for a pattern
   */
  private async createSuggestionForPattern(
    organizationId: string,
    pattern: Record<string, unknown>,
  ): Promise<void> {
    const occurrences = pattern.occurrences as Array<{ date: Date }> | undefined;
    const dates = occurrences?.map((o) => o.date) || [];
    const frequencyAnalysis = dates.length >= 2 ? detectFrequency(dates) : null;

    await this.prisma.patternSuggestion.create({
      data: {
        patternId: pattern.id as string,
        suggestionType: SuggestionType.CREATE_RECURRING,
        suggestedFrequency: frequencyAnalysis?.frequency || 'MONTHLY',
        suggestedAmount: pattern.amountCluster as Decimal,
        confidence: pattern.confidence as Decimal,
        organizationId,
      },
    });
  }

  /**
   * Detect duplicates in recent transactions
   */
  private async detectDuplicates(
    organizationId: string,
    transactions: TransactionData[],
  ): Promise<number> {
    let duplicateCount = 0;

    // Group by date proximity
    const sortedTx = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());

    for (let i = 0; i < sortedTx.length; i++) {
      for (let j = i + 1; j < sortedTx.length; j++) {
        // Stop if dates are too far apart
        if (daysBetween(sortedTx[i].date, sortedTx[j].date) > this.DUPLICATE_WINDOW_DAYS) {
          break;
        }

        if (
          sortedTx[i].sourceType !== sortedTx[j].sourceType && // Different sources
          isPotentialDuplicate(
            {
              entityName: sortedTx[i].entityName,
              amount: sortedTx[i].amount,
              date: sortedTx[i].date,
            },
            {
              entityName: sortedTx[j].entityName,
              amount: sortedTx[j].amount,
              date: sortedTx[j].date,
            },
            this.DUPLICATE_WINDOW_DAYS,
            this.AMOUNT_VARIANCE_THRESHOLD,
          )
        ) {
          duplicateCount++;
        }
      }
    }

    return duplicateCount;
  }

  /**
   * Mark patterns as stale if no recent occurrences
   */
  private async markStalePatterns(organizationId: string): Promise<void> {
    const staleThreshold = new Date();
    staleThreshold.setMonth(staleThreshold.getMonth() - 3);

    await this.prisma.transactionPattern.updateMany({
      where: {
        organizationId,
        status: PatternStatus.DETECTED,
        lastOccurrence: { lt: staleThreshold },
      },
      data: { status: PatternStatus.STALE },
    });
  }

  /**
   * Weekly analysis job - to be called by scheduler
   */
  async weeklyAnalysis(organizationId: string): Promise<AnalysisResult> {
    return this.analyzePatterns(organizationId);
  }
}
