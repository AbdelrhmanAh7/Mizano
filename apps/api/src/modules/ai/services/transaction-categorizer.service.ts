import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiTrainingService } from './ai-training.service';
import { AiFeedbackService } from './ai-feedback.service';
import { ModelRegistryService } from './model-registry.service';
import { AiFeature, AiTrainingSource } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import * as natural from 'natural';

export interface CategorizationInput {
  description: string;
  vendorName?: string;
  amount: number;
  direction: 'expense' | 'income';
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
}

interface CategorizationModelData {
  classifierJson: string;
  vendorAccountMap: Record<string, { accountId: string; count: number }>;
  vocabulary: string[];
  sampleCount: number;
  lastTrainedAt: string;
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
  private classifierCache = new Map<string, CachedClassifier>();

  // Cache expiry time: 1 hour
  private readonly CACHE_TTL_MS = 60 * 60 * 1000;

  // Minimum samples required for prediction
  private readonly MIN_SAMPLES_FOR_PREDICTION = 20;

  // Confidence boost for vendor match
  private readonly VENDOR_CONFIDENCE_BOOST = 0.15;

  constructor(
    private prisma: PrismaService,
    private trainingService: AiTrainingService,
    private feedbackService: AiFeedbackService,
    private modelRegistry: ModelRegistryService,
    private eventEmitter: EventEmitter2,
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

    // 1. Fetch all training data
    const trainingData = await this.prisma.aiTrainingData.findMany({
      where: {
        organizationId,
        feature: 'CATEGORIZATION',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (trainingData.length < this.MIN_SAMPLES_FOR_PREDICTION) {
      this.logger.warn(
        `Insufficient training data for org ${organizationId}: ${trainingData.length} samples`,
      );
      return { version: 0, accuracy: 0, sampleCount: trainingData.length };
    }

    // 2. Create new classifier
    const classifier = new natural.BayesClassifier();

    // 3. Build vendor -> account frequency map
    const vendorAccountMap: Record<string, { accountId: string; count: number }> = {};
    const vocabulary = new Set<string>();

    // 4. Add documents to classifier
    for (const record of trainingData) {
      const input = record.inputData as unknown as CategorizationInput;
      const accountId = record.label;

      const featureText = this.buildFeatureText(input);
      classifier.addDocument(featureText, accountId);

      // Track vocabulary
      featureText.split(' ').forEach((token) => vocabulary.add(token));

      // Update vendor -> account map
      if (input.vendorName) {
        const normalizedVendor = this.normalizeText(input.vendorName);
        if (!vendorAccountMap[normalizedVendor]) {
          vendorAccountMap[normalizedVendor] = { accountId, count: 0 };
        }
        if (vendorAccountMap[normalizedVendor].accountId === accountId) {
          vendorAccountMap[normalizedVendor].count++;
        } else if (
          vendorAccountMap[normalizedVendor].count === 0 ||
          vendorAccountMap[normalizedVendor].count < trainingData.filter(
            (d) =>
              (d.inputData as any).vendorName &&
              this.normalizeText((d.inputData as any).vendorName) === normalizedVendor &&
              d.label === accountId,
          ).length
        ) {
          vendorAccountMap[normalizedVendor] = {
            accountId,
            count: trainingData.filter(
              (d) =>
                (d.inputData as any).vendorName &&
                this.normalizeText((d.inputData as any).vendorName) === normalizedVendor &&
                d.label === accountId,
            ).length,
          };
        }
      }
    }

    // 5. Train the classifier
    classifier.train();

    // 6. Run cross-validation
    const cvResult = await this.crossValidateInternal(trainingData, 5);

    // 7. Serialize and save model
    const modelData: CategorizationModelData = {
      classifierJson: JSON.stringify(classifier),
      vendorAccountMap,
      vocabulary: Array.from(vocabulary),
      sampleCount: trainingData.length,
      lastTrainedAt: new Date().toISOString(),
    };

    const savedModel = await this.modelRegistry.saveModel(
      organizationId,
      'CATEGORIZATION',
      modelData,
      cvResult.avgAccuracy,
      trainingData.length,
    );

    // 8. Update cache
    this.classifierCache.set(organizationId, {
      classifier,
      vendorAccountMap,
      version: savedModel.version,
      loadedAt: new Date(),
    });

    this.logger.log(
      `Categorization training completed for org ${organizationId}: v${savedModel.version}, accuracy=${cvResult.avgAccuracy.toFixed(2)}, samples=${trainingData.length}`,
    );

    return {
      version: savedModel.version,
      accuracy: cvResult.avgAccuracy,
      sampleCount: trainingData.length,
    };
  }

  /**
   * Predict category for a transaction
   */
  async predict(
    organizationId: string,
    input: CategorizationInput,
  ): Promise<CategorizationPrediction> {
    // 1. Load classifier from cache or DB
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
      };
    }

    // 2. Build feature text
    const featureText = this.buildFeatureText(input);

    // 3. Get classifications with probabilities
    const classifications = cached.classifier.getClassifications(featureText);

    if (classifications.length === 0) {
      return {
        accountId: null,
        accountCode: '',
        accountName: '',
        confidence: 0,
        predictionId: '',
        alternatives: [],
      };
    }

    // 4. Apply softmax for 0-1 confidence scores
    const probabilities: Record<string, number> = {};
    classifications.forEach((c) => {
      probabilities[c.label] = c.value;
    });
    const softmaxProbs = this.applySoftmax(probabilities);

    // 5. Check vendor boost
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

    // 6. Get account details
    const accounts = await this.prisma.account.findMany({
      where: {
        organizationId,
        id: { in: Object.keys(softmaxProbs) },
      },
      select: { id: true, code: true, name: true },
    });

    const accountMap = new Map(accounts.map((a) => [a.id, a]));
    const topAccount = accountMap.get(topAccountId);

    // 7. Build alternatives (top 3)
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

    // 8. Store prediction for feedback tracking
    const prediction = await this.feedbackService.storePrediction(
      organizationId,
      'CATEGORIZATION',
      input as Record<string, any>,
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

    const source: AiTrainingSource = isCorrection ? 'CORRECTION' : 'USER';

    // 1. Store as training data
    await this.trainingService.addTrainingData(
      organizationId,
      'CATEGORIZATION',
      input,
      selectedAccountId,
      source,
    );

    // 2. Check if corrections threshold reached
    if (isCorrection) {
      const { shouldRetrain } = await this.feedbackService.checkRetrainingThreshold(
        organizationId,
        'CATEGORIZATION',
      );

      if (shouldRetrain) {
        this.logger.log(
          `Categorization retraining threshold reached for org ${organizationId}`,
        );
        this.eventEmitter.emit('ai.retraining.needed', {
          organizationId,
          feature: 'CATEGORIZATION',
        });
      }
    }

    this.logger.debug(
      `Learned categorization for org ${organizationId}: ${input.description} -> ${selectedAccountId} (${source})`,
    );
  }

  /**
   * Load model from database into memory
   */
  async loadModel(organizationId: string): Promise<boolean> {
    // Check if already cached and not expired
    const cached = this.classifierCache.get(organizationId);
    if (cached && Date.now() - cached.loadedAt.getTime() < this.CACHE_TTL_MS) {
      return true;
    }

    // Load from database
    const model = await this.modelRegistry.loadActiveModel(organizationId, 'CATEGORIZATION');

    if (!model) {
      this.logger.debug(`No active categorization model for org ${organizationId}`);
      return false;
    }

    const modelData = model.modelData as unknown as CategorizationModelData;

    if (!modelData.classifierJson || modelData.sampleCount < this.MIN_SAMPLES_FOR_PREDICTION) {
      this.logger.debug(
        `Categorization model for org ${organizationId} has insufficient samples`,
      );
      return false;
    }

    try {
      // Deserialize classifier
      const classifier = natural.BayesClassifier.restore(
        JSON.parse(modelData.classifierJson),
      );

      // Cache the classifier
      this.classifierCache.set(organizationId, {
        classifier,
        vendorAccountMap: modelData.vendorAccountMap || {},
        version: model.version,
        loadedAt: new Date(),
      });

      this.logger.debug(
        `Loaded categorization model v${model.version} for org ${organizationId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to load categorization model for org ${organizationId}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Public cross-validation method
   */
  async crossValidate(
    organizationId: string,
    folds: number = 5,
  ): Promise<{ avgAccuracy: number; foldResults: number[] }> {
    const trainingData = await this.prisma.aiTrainingData.findMany({
      where: {
        organizationId,
        feature: 'CATEGORIZATION',
      },
    });

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
    const model = await this.modelRegistry.loadActiveModel(organizationId, 'CATEGORIZATION');

    if (!model) {
      const sampleCount = await this.prisma.aiTrainingData.count({
        where: { organizationId, feature: 'CATEGORIZATION' },
      });

      return {
        sampleCount,
        accuracy: 0,
        version: 0,
        lastTrainedAt: null,
        needsRetraining: sampleCount >= this.MIN_SAMPLES_FOR_PREDICTION,
      };
    }

    const { shouldRetrain } = await this.feedbackService.checkRetrainingThreshold(
      organizationId,
      'CATEGORIZATION',
    );

    return {
      sampleCount: model.sampleCount,
      accuracy: Number(model.accuracy),
      version: model.version,
      lastTrainedAt: model.trainedAt?.toISOString() || null,
      needsRetraining: shouldRetrain,
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

      await this.trainingService.addTrainingData(
        organizationId,
        'CATEGORIZATION',
        input,
        expense.accountId,
        'SEED',
      );

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
    data: any[],
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
        classifier.addDocument(this.buildFeatureText(input), record.label);
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
      foldResults.length > 0
        ? foldResults.reduce((a, b) => a + b, 0) / foldResults.length
        : 0;

    return { avgAccuracy, foldResults };
  }
}
