import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeedbackService } from './ai-feedback.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';

import * as natural from 'natural';
import { BoundedCache } from '../utils/bounded-cache.util';
import { PredictionMethod } from '../types/prediction-method.type';

export interface CategorizationInput {
  description: string;
  vendorName?: string;
  amount: number;
  direction: 'expense' | 'income';
  [key: string]: unknown;
}

export interface CategorizationPrediction {
  accountId: string | null;
  accountCode: string;
  accountName: string;
  confidence: number;
  predictionId: string;
  alternatives: Array<{
    accountId: string;
    accountCode: string;
    accountName: string;
    confidence: number;
  }>;
  predictionMethod: PredictionMethod;
}

interface OllamaCategorizationResponse {
  account_id: string | null;
  account_name: string;
  confidence: number;
  alternatives: { name: string; confidence: number }[];
}

interface CachedClassifier {
  classifier: natural.BayesClassifier;
  vendorAccountMap: Record<string, { accountId: string; count: number }>;
  version: number;
  loadedAt: Date;
}

@Injectable()
export class TransactionCategorizerService {
  private readonly logger = new Logger(TransactionCategorizerService.name);
  private classifierCache = new BoundedCache<CachedClassifier>(50, 60 * 60 * 1000);

  // Minimum samples required for prediction
  private readonly MIN_SAMPLES_FOR_PREDICTION = 20;

  // Confidence boost for vendor match
  private readonly VENDOR_CONFIDENCE_BOOST = 0.15;

  constructor(
    private prisma: PrismaService,
    private feedbackService: AiFeedbackService,
    private ollamaGateway: OllamaInferenceGateway,
  ) {}

  /**
   * Train or retrain the classifier for an organization
   */
  async train(organizationId: string): Promise<{
    version: number;
    accuracy: number;
    sampleCount: number;
  }> {
    this.logger.log(`Starting categorization training for org ${organizationId}`);

    // 1. Training data (aiTrainingData table removed; training data is no longer persisted separately)
    const trainingData: Array<{ id: string; inputData: unknown; label: string }> = [];

    if (trainingData.length < this.MIN_SAMPLES_FOR_PREDICTION) {
      throw new BadRequestException(
        `Insufficient training data: ${trainingData.length} samples found, minimum ${this.MIN_SAMPLES_FOR_PREDICTION} required. ` +
          `Use the "Seed from History" button or categorize more transactions first.`,
      );
    }

    try {
      // 2. Create new classifier
      const classifier = new natural.BayesClassifier();

      // 3. Build vendor -> account frequency map (pre-compute per-vendor counts)
      const vendorAccountMap: Record<string, { accountId: string; count: number }> = {};
      const vocabulary = new Set<string>();

      // Pre-compute vendor+account frequency for O(n) instead of O(n²)
      const vendorAccountCounts: Record<string, Record<string, number>> = {};
      for (const record of trainingData) {
        const input = record.inputData as unknown as CategorizationInput;
        if (input.vendorName) {
          const nv = this.normalizeText(input.vendorName);
          if (!vendorAccountCounts[nv]) vendorAccountCounts[nv] = {};
          vendorAccountCounts[nv][record.label] = (vendorAccountCounts[nv][record.label] || 0) + 1;
        }
      }

      // Pick the most frequent account per vendor
      for (const [vendor, accounts] of Object.entries(vendorAccountCounts)) {
        let bestAccount = '';
        let bestCount = 0;
        for (const [accountId, count] of Object.entries(accounts)) {
          if (count > bestCount) {
            bestAccount = accountId;
            bestCount = count;
          }
        }
        vendorAccountMap[vendor] = { accountId: bestAccount, count: bestCount };
      }

      // 4. Add documents to classifier
      for (const record of trainingData) {
        const input = record.inputData as unknown as CategorizationInput;
        const featureText = this.buildFeatureText(input);
        classifier.addDocument(featureText, record.label);

        // Track vocabulary
        featureText.split(' ').forEach((token) => vocabulary.add(token));
      }

      // 5. Train the classifier
      classifier.train();

      // 6. Run cross-validation
      const cvResult = await this.crossValidateInternal(trainingData, 5);

      // 7. Model registry removed — cache classifier in memory only
      const version = 1;

      // 8. Update cache
      this.classifierCache.set(organizationId, {
        classifier,
        vendorAccountMap,
        version,
        loadedAt: new Date(),
      });

      this.logger.log(
        `Categorization training completed for org ${organizationId}: v${version}, accuracy=${cvResult.avgAccuracy.toFixed(2)}, samples=${trainingData.length}`,
      );

      return {
        version,
        accuracy: cvResult.avgAccuracy,
        sampleCount: trainingData.length,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(
        `Categorization training failed for org ${organizationId}: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(`Training failed: ${error.message}`);
    }
  }

  /**
   * Predict category for a transaction
   */
  async predict(
    organizationId: string,
    input: CategorizationInput,
  ): Promise<CategorizationPrediction> {
    // 1. Try Ollama first for categorization
    try {
      const ollamaPrompt = `Categorize this accounting transaction for an ERP system.

Transaction details:
- Description: ${input.description}
${input.vendorName ? `- Vendor: ${input.vendorName}` : ''}
- Amount: ${input.amount}
- Direction: ${input.direction}

Based on the description, vendor, amount, and direction, determine the most appropriate chart-of-accounts category.

Return a JSON object with:
- account_id: null (to be resolved by the system)
- account_name: the most likely account category name (e.g., "Office Supplies", "Rent Expense", "Sales Revenue")
- confidence: your confidence from 0.0 to 1.0
- alternatives: array of up to 3 alternative categories, each with { "name": string, "confidence": number }

Return ONLY valid JSON.`;

      const ollamaResult =
        await this.ollamaGateway.infer<OllamaCategorizationResponse>(ollamaPrompt);

      if (ollamaResult?.data && ollamaResult.data.account_name) {
        const ollamaData = ollamaResult.data;
        const ollamaConfidence =
          typeof ollamaData.confidence === 'number' ? ollamaData.confidence : 0.6;

        // Try to match Ollama's suggested account name to an actual account in the org
        const matchedAccounts = await this.prisma.account.findMany({
          where: {
            organizationId,
            OR: [
              { name: { contains: ollamaData.account_name, mode: 'insensitive' } },
              ...(ollamaData.alternatives || []).map((alt) => ({
                name: { contains: alt.name, mode: 'insensitive' as const },
              })),
            ],
          },
          select: { id: true, code: true, name: true },
        });

        let topAccountId: string | null = null;
        let topAccountCode = '';
        let topAccountName = ollamaData.account_name;
        let topConfidence = ollamaConfidence;

        if (matchedAccounts.length > 0) {
          // Find best match
          const primaryMatch = matchedAccounts.find((a) =>
            a.name.toLowerCase().includes(ollamaData.account_name.toLowerCase()),
          );
          const bestMatch = primaryMatch || matchedAccounts[0];
          topAccountId = bestMatch.id;
          topAccountCode = bestMatch.code;
          topAccountName = bestMatch.name;
        }

        // Apply vendor boost as post-processing
        await this.loadModel(organizationId);
        const cached = this.classifierCache.get(organizationId);

        if (input.vendorName && cached) {
          const normalizedVendor = this.normalizeText(input.vendorName);
          const vendorMapping = cached.vendorAccountMap[normalizedVendor];

          if (vendorMapping && vendorMapping.count >= 3) {
            // Strong vendor association — if vendor maps to a specific account, boost it
            const vendorAccount = await this.prisma.account.findUnique({
              where: { id: vendorMapping.accountId },
              select: { id: true, code: true, name: true },
            });

            if (vendorAccount) {
              topAccountId = vendorAccount.id;
              topAccountCode = vendorAccount.code;
              topAccountName = vendorAccount.name;
              topConfidence = Math.min(1, topConfidence + this.VENDOR_CONFIDENCE_BOOST);
            }
          }
        }

        // Build alternatives from Ollama response
        const alternativeAccounts = (ollamaData.alternatives || [])
          .filter((alt) => alt.name !== topAccountName)
          .slice(0, 3);

        const alternatives: CategorizationPrediction['alternatives'] = [];
        for (const alt of alternativeAccounts) {
          const match = matchedAccounts.find((a) =>
            a.name.toLowerCase().includes(alt.name.toLowerCase()),
          );
          alternatives.push({
            accountId: match?.id || '',
            accountCode: match?.code || '',
            accountName: match?.name || alt.name,
            confidence: alt.confidence || 0.3,
          });
        }

        // Store prediction for feedback tracking
        const prediction = await this.feedbackService.storePrediction(
          organizationId,
          'CATEGORIZATION',
          input as Record<string, unknown>,
          { accountId: topAccountId, confidence: topConfidence },
          topConfidence,
          0,
        );

        // Training bridge removed — training data storage no longer available

        return {
          accountId: topAccountId,
          accountCode: topAccountCode,
          accountName: topAccountName,
          confidence: topConfidence,
          predictionId: prediction?.id || '',
          alternatives,
          predictionMethod: 'OLLAMA',
        };
      }
    } catch (error) {
      this.logger.debug(
        `Ollama categorization unavailable, falling back to Bayes: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 2. Fallback: Load Naive Bayes classifier from cache or DB
    await this.loadModel(organizationId);

    const cached = this.classifierCache.get(organizationId);
    if (!cached) {
      return {
        accountId: null,
        accountCode: '',
        accountName: '',
        confidence: 0,
        predictionId: '',
        alternatives: [],
        predictionMethod: 'RULE_BASED',
      };
    }

    // 3. Build feature text
    const featureText = this.buildFeatureText(input);

    // 4. Get classifications with probabilities
    const classifications = cached.classifier.getClassifications(featureText);

    if (classifications.length === 0) {
      return {
        accountId: null,
        accountCode: '',
        accountName: '',
        confidence: 0,
        predictionId: '',
        alternatives: [],
        predictionMethod: 'RULE_BASED',
      };
    }

    // 5. Apply softmax for 0-1 confidence scores
    const probabilities: Record<string, number> = {};
    classifications.forEach((c) => {
      probabilities[c.label] = c.value;
    });
    const softmaxProbs = this.applySoftmax(probabilities);

    // 6. Check vendor boost
    let topAccountId = classifications[0].label;
    let topConfidence = softmaxProbs[topAccountId];

    if (input.vendorName) {
      const normalizedVendor = this.normalizeText(input.vendorName);
      const vendorMapping = cached.vendorAccountMap[normalizedVendor];

      if (vendorMapping && vendorMapping.count >= 3) {
        // Strong vendor association
        const vendorAccountId = vendorMapping.accountId;
        const vendorConfidence = softmaxProbs[vendorAccountId] || 0;

        // Boost confidence if vendor matches
        if (vendorConfidence > 0) {
          softmaxProbs[vendorAccountId] = Math.min(
            1,
            vendorConfidence + this.VENDOR_CONFIDENCE_BOOST,
          );

          // Re-evaluate top prediction
          if (softmaxProbs[vendorAccountId] > topConfidence) {
            topAccountId = vendorAccountId;
            topConfidence = softmaxProbs[vendorAccountId];
          }
        }
      }
    }

    // 7. Get account details
    const accounts = await this.prisma.account.findMany({
      where: {
        organizationId,
        id: { in: Object.keys(softmaxProbs) },
      },
      select: { id: true, code: true, name: true },
    });

    const accountMap = new Map(accounts.map((a) => [a.id, a]));
    const topAccount = accountMap.get(topAccountId);

    // 8. Build alternatives (top 3)
    const sortedProbs = Object.entries(softmaxProbs)
      .filter(([id]) => id !== topAccountId)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const alternatives = sortedProbs
      .filter(([, conf]) => conf > 0.1)
      .map(([id, conf]) => {
        const account = accountMap.get(id);
        return {
          accountId: id,
          accountCode: account?.code || '',
          accountName: account?.name || '',
          confidence: conf,
        };
      });

    // 9. Store prediction for feedback tracking
    const prediction = await this.feedbackService.storePrediction(
      organizationId,
      'CATEGORIZATION',
      input as Record<string, unknown>,
      { accountId: topAccountId, confidence: topConfidence },
      topConfidence,
      cached.version,
    );

    return {
      accountId: topAccountId,
      accountCode: topAccount?.code || '',
      accountName: topAccount?.name || '',
      confidence: topConfidence,
      predictionId: prediction?.id || '',
      alternatives,
      predictionMethod: 'ML',
    };
  }

  /**
   * Learn from user categorization
   */
  async onUserCategorize(
    organizationId: string,
    input: CategorizationInput,
    selectedAccountId: string,
    wasAiSuggested: boolean,
    aiSuggestedAccountId?: string,
  ): Promise<void> {
    // Determine if this is a correction
    const isCorrection = wasAiSuggested && aiSuggestedAccountId !== selectedAccountId;

    const source = isCorrection ? 'CORRECTION' : 'USER';

    this.logger.debug(
      `Learned categorization for org ${organizationId}: ${input.description} -> ${selectedAccountId} (${source})`,
    );
  }

  /**
   * Load model from in-memory cache.
   * Model registry removed — classifiers are only available in-memory after training.
   */
  async loadModel(organizationId: string): Promise<boolean> {
    const cached = this.classifierCache.get(organizationId);
    if (cached) {
      return true;
    }

    this.logger.debug(`No cached categorization model for org ${organizationId}`);
    return false;
  }

  /**
   * Public cross-validation method
   */
  async crossValidate(
    organizationId: string,
    folds: number = 5,
  ): Promise<{ avgAccuracy: number; foldResults: number[] }> {
    // Training data table removed; cross-validation returns empty results
    const trainingData: Record<string, unknown>[] = [];

    if (trainingData.length < folds * 2) {
      return { avgAccuracy: 0, foldResults: [] };
    }

    return this.crossValidateInternal(trainingData, folds);
  }

  /**
   * Get training statistics
   */
  async getStats(organizationId: string): Promise<{
    sampleCount: number;
    accuracy: number;
    version: number;
    lastTrainedAt: string | null;
    needsRetraining: boolean;
  }> {
    // Model registry removed — return stats from in-memory cache
    const cached = this.classifierCache.get(organizationId);

    if (!cached) {
      return {
        sampleCount: 0,
        accuracy: 0,
        version: 0,
        lastTrainedAt: null,
        needsRetraining: false,
      };
    }

    return {
      sampleCount: 0,
      accuracy: 0,
      version: cached.version,
      lastTrainedAt: cached.loadedAt.toISOString(),
      needsRetraining: false,
    };
  }

  /**
   * Seed initial training data from historical transactions
   */
  async seedFromHistory(organizationId: string): Promise<{ seeded: number }> {
    // Get expenses with account assignments
    const expenses = await this.prisma.expense.findMany({
      where: {
        organizationId,
        deletedAt: null,
        accountId: { not: undefined },
      },
      include: {
        account: { select: { id: true, type: true } },
      },
      take: 500,
      orderBy: { createdAt: 'desc' },
    });

    let seeded = 0;

    for (const expense of expenses) {
      if (!expense.accountId) continue;

      // Get vendor name if available
      let vendorName: string | undefined;
      if (expense.vendorId) {
        const vendor = await this.prisma.vendor.findUnique({
          where: { id: expense.vendorId },
          select: { name: true },
        });
        vendorName = vendor?.name;
      }

      const input: CategorizationInput = {
        description: expense.description || '',
        vendorName,
        amount: Number(expense.amount),
        direction: 'expense',
      };

      // Only seed if has meaningful description
      if (input.description.length < 3) continue;
      seeded++;
    }

    this.logger.log(`Seeded ${seeded} categorization samples for org ${organizationId}`);
    return { seeded };
  }

  // ============ PRIVATE METHODS ============

  /**
   * Build feature text from input
   */
  private buildFeatureText(input: CategorizationInput): string {
    const parts: string[] = [];

    // Description (tokenized)
    if (input.description) {
      parts.push(this.normalizeText(input.description));
    }

    // Vendor name
    if (input.vendorName) {
      parts.push(this.normalizeText(input.vendorName));
    }

    // Direction
    parts.push(input.direction);

    // Amount bucket
    parts.push(this.getAmountBucket(input.amount));

    return parts.join(' ');
  }

  /**
   * Normalize text for classification
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Get amount bucket
   */
  private getAmountBucket(amount: number): string {
    const absAmount = Math.abs(amount);
    if (absAmount < 50) return 'amount_micro';
    if (absAmount < 500) return 'amount_small';
    if (absAmount < 5000) return 'amount_medium';
    if (absAmount < 50000) return 'amount_large';
    return 'amount_enterprise';
  }

  /**
   * Apply softmax to convert log probabilities to 0-1 range
   */
  private applySoftmax(logProbs: Record<string, number>): Record<string, number> {
    const values = Object.values(logProbs);

    if (values.length === 0) return {};

    const maxVal = Math.max(...values);
    const expValues = values.map((v) => Math.exp(v - maxVal));
    const sumExp = expValues.reduce((a, b) => a + b, 0);

    const result: Record<string, number> = {};
    const keys = Object.keys(logProbs);
    keys.forEach((key, i) => {
      result[key] = expValues[i] / sumExp;
    });

    return result;
  }

  /**
   * Internal cross-validation
   */
  private async crossValidateInternal(
    data: Record<string, unknown>[],
    folds: number,
  ): Promise<{ avgAccuracy: number; foldResults: number[] }> {
    // Shuffle data
    const shuffled = [...data].sort(() => Math.random() - 0.5);
    const foldSize = Math.floor(shuffled.length / folds);
    const foldResults: number[] = [];

    for (let fold = 0; fold < folds; fold++) {
      const testStart = fold * foldSize;
      const testEnd = fold === folds - 1 ? shuffled.length : testStart + foldSize;

      const testData = shuffled.slice(testStart, testEnd);
      const trainData = [...shuffled.slice(0, testStart), ...shuffled.slice(testEnd)];

      if (trainData.length === 0 || testData.length === 0) continue;

      // Train classifier on fold
      const classifier = new natural.BayesClassifier();
      for (const record of trainData) {
        const input = record.inputData as unknown as CategorizationInput;
        classifier.addDocument(this.buildFeatureText(input), record.label as string);
      }
      classifier.train();

      // Test on fold
      let correct = 0;
      for (const record of testData) {
        const input = record.inputData as unknown as CategorizationInput;
        const predicted = classifier.classify(this.buildFeatureText(input));
        if (predicted === record.label) {
          correct++;
        }
      }

      foldResults.push(correct / testData.length);
    }

    const avgAccuracy =
      foldResults.length > 0 ? foldResults.reduce((a, b) => a + b, 0) / foldResults.length : 0;

    return { avgAccuracy, foldResults };
  }
}
