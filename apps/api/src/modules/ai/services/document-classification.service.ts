import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ModelRegistryService } from './model-registry.service';
import { AiFeature } from '@prisma/client';
import { BoundedCache } from '../utils/bounded-cache.util';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const natural = require('natural');

/**
 * Document categories for classification
 */
export enum DocumentCategory {
  INVOICE = 'INVOICE',
  RECEIPT = 'RECEIPT',
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  CONTRACT = 'CONTRACT',
  TAX_DOCUMENT = 'TAX_DOCUMENT',
  BANK_STATEMENT = 'BANK_STATEMENT',
  PAYSLIP = 'PAYSLIP',
  OTHER = 'OTHER',
}

export interface ClassificationScore {
  category: DocumentCategory;
  score: number;
}

export interface ClassificationResult {
  category: DocumentCategory;
  confidence: number;
  scores: ClassificationScore[];
}

export interface ModelStatus {
  hasActiveModel: boolean;
  activeVersion: number | null;
  isTraining: boolean;
  trainingVersion: number | null;
  lastTrainedAt: Date | null;
  trainingDataCount: number;
}

/**
 * Default seed training data for bootstrapping the classifier
 * when no organization-specific data is available.
 */
const DEFAULT_TRAINING_DATA: Array<{ text: string; category: DocumentCategory }> = [
  // INVOICE
  {
    text: 'invoice number total amount due payment terms net 30 bill to ship to',
    category: DocumentCategory.INVOICE,
  },
  {
    text: 'tax invoice subtotal vat grand total balance due date issued',
    category: DocumentCategory.INVOICE,
  },
  {
    text: 'invoice payment due upon receipt quantity unit price line total',
    category: DocumentCategory.INVOICE,
  },
  {
    text: 'proforma invoice commercial invoice shipping charges freight',
    category: DocumentCategory.INVOICE,
  },
  {
    text: 'invoice attached please find enclosed amount owed outstanding balance',
    category: DocumentCategory.INVOICE,
  },
  {
    text: 'sales invoice customer billing address item description rate amount',
    category: DocumentCategory.INVOICE,
  },

  // RECEIPT
  {
    text: 'receipt payment received thank you transaction cash credit card',
    category: DocumentCategory.RECEIPT,
  },
  {
    text: 'sales receipt total paid change amount tendered purchase confirmation',
    category: DocumentCategory.RECEIPT,
  },
  {
    text: 'receipt number date of purchase store location cashier items bought',
    category: DocumentCategory.RECEIPT,
  },
  {
    text: 'payment receipt confirmation number amount charged method of payment',
    category: DocumentCategory.RECEIPT,
  },
  {
    text: 'official receipt acknowledgement of payment received from amount paid',
    category: DocumentCategory.RECEIPT,
  },

  // PURCHASE_ORDER
  {
    text: 'purchase order PO number vendor supplier delivery date shipping address',
    category: DocumentCategory.PURCHASE_ORDER,
  },
  {
    text: 'purchase requisition order confirmation requested by approved by quantity ordered',
    category: DocumentCategory.PURCHASE_ORDER,
  },
  {
    text: 'PO terms and conditions delivery schedule supplier reference order placed',
    category: DocumentCategory.PURCHASE_ORDER,
  },
  {
    text: 'purchase order line items unit cost total cost expected delivery warehouse',
    category: DocumentCategory.PURCHASE_ORDER,
  },
  {
    text: 'procurement order supplier quotation approved purchase request material',
    category: DocumentCategory.PURCHASE_ORDER,
  },

  // CONTRACT
  {
    text: 'contract agreement parties hereby agree terms and conditions effective date',
    category: DocumentCategory.CONTRACT,
  },
  {
    text: 'service agreement scope of work deliverables payment schedule termination',
    category: DocumentCategory.CONTRACT,
  },
  {
    text: 'non-disclosure agreement confidential information proprietary intellectual property',
    category: DocumentCategory.CONTRACT,
  },
  {
    text: 'employment contract salary benefits probation period notice period obligations',
    category: DocumentCategory.CONTRACT,
  },
  {
    text: 'lease agreement rental terms tenant landlord premises duration deposit',
    category: DocumentCategory.CONTRACT,
  },
  {
    text: 'agreement between parties obligations liability indemnification governing law',
    category: DocumentCategory.CONTRACT,
  },

  // TAX_DOCUMENT
  {
    text: 'tax return income tax filing fiscal year deductions exemptions taxable income',
    category: DocumentCategory.TAX_DOCUMENT,
  },
  {
    text: 'VAT return value added tax output tax input tax net tax payable period',
    category: DocumentCategory.TAX_DOCUMENT,
  },
  {
    text: 'tax certificate withholding tax TIN tax identification number annual tax',
    category: DocumentCategory.TAX_DOCUMENT,
  },
  {
    text: 'tax assessment notice tax liability penalty interest tax authority',
    category: DocumentCategory.TAX_DOCUMENT,
  },
  {
    text: 'W-2 form wages earned federal tax state tax social security medicare',
    category: DocumentCategory.TAX_DOCUMENT,
  },

  // BANK_STATEMENT
  {
    text: 'bank statement account number opening balance closing balance transactions',
    category: DocumentCategory.BANK_STATEMENT,
  },
  {
    text: 'statement of account debit credit balance brought forward carried forward',
    category: DocumentCategory.BANK_STATEMENT,
  },
  {
    text: 'bank account summary deposits withdrawals interest earned service charges',
    category: DocumentCategory.BANK_STATEMENT,
  },
  {
    text: 'monthly statement account activity transfer wire payment clearing',
    category: DocumentCategory.BANK_STATEMENT,
  },
  {
    text: 'bank reconciliation statement beginning balance ending balance outstanding checks',
    category: DocumentCategory.BANK_STATEMENT,
  },

  // PAYSLIP
  {
    text: 'payslip salary gross pay net pay deductions tax withheld employee',
    category: DocumentCategory.PAYSLIP,
  },
  {
    text: 'pay stub earnings overtime allowance benefits contribution pension fund',
    category: DocumentCategory.PAYSLIP,
  },
  {
    text: 'salary slip basic pay house rent allowance provident fund professional tax',
    category: DocumentCategory.PAYSLIP,
  },
  {
    text: 'wage statement hours worked hourly rate gross earnings net earnings year to date',
    category: DocumentCategory.PAYSLIP,
  },
  {
    text: 'employee compensation pay period pay date employer contribution insurance',
    category: DocumentCategory.PAYSLIP,
  },
];

/**
 * Filename hints mapped to document categories.
 * Used to boost classification confidence when a filename is provided.
 */
const FILENAME_HINTS: Record<string, DocumentCategory> = {
  invoice: DocumentCategory.INVOICE,
  inv: DocumentCategory.INVOICE,
  receipt: DocumentCategory.RECEIPT,
  rcpt: DocumentCategory.RECEIPT,
  purchase_order: DocumentCategory.PURCHASE_ORDER,
  'purchase-order': DocumentCategory.PURCHASE_ORDER,
  po: DocumentCategory.PURCHASE_ORDER,
  contract: DocumentCategory.CONTRACT,
  agreement: DocumentCategory.CONTRACT,
  nda: DocumentCategory.CONTRACT,
  tax: DocumentCategory.TAX_DOCUMENT,
  vat: DocumentCategory.TAX_DOCUMENT,
  tax_return: DocumentCategory.TAX_DOCUMENT,
  bank_statement: DocumentCategory.BANK_STATEMENT,
  'bank-statement': DocumentCategory.BANK_STATEMENT,
  statement: DocumentCategory.BANK_STATEMENT,
  payslip: DocumentCategory.PAYSLIP,
  pay_stub: DocumentCategory.PAYSLIP,
  'pay-stub': DocumentCategory.PAYSLIP,
  salary: DocumentCategory.PAYSLIP,
  wage: DocumentCategory.PAYSLIP,
};

@Injectable()
export class DocumentClassificationService {
  private readonly logger = new Logger(DocumentClassificationService.name);

  /** In-memory cache of trained classifiers per organization (bounded: max 50, 1h TTL) */
  private classifierCache = new BoundedCache<any>(50, 60 * 60 * 1000);

  constructor(
    private prisma: PrismaService,
    private modelRegistry: ModelRegistryService,
  ) {}

  /**
   * Classify raw text into a document category.
   * Loads the trained model from the registry (or cache) and runs classification.
   */
  async classifyText(organizationId: string, text: string): Promise<ClassificationResult> {
    const classifier = await this.getOrLoadClassifier(organizationId);

    if (!classifier) {
      this.logger.warn(`No trained classifier found for org ${organizationId}, using default`);
      return this.classifyWithDefaults(text);
    }

    return this.runClassification(classifier, text);
  }

  /**
   * Classify text with optional filename hints.
   * If a filename is provided, it is used to boost or override the
   * text-based classification when the filename strongly suggests a category.
   */
  async classifyDocument(
    organizationId: string,
    text: string,
    filename?: string,
  ): Promise<ClassificationResult> {
    const textResult = await this.classifyText(organizationId, text);

    if (!filename) {
      return textResult;
    }

    // Check filename hints
    const normalizedFilename = filename.toLowerCase().replace(/\.[^.]+$/, '');
    let filenameCategory: DocumentCategory | null = null;

    for (const [hint, category] of Object.entries(FILENAME_HINTS)) {
      if (normalizedFilename.includes(hint)) {
        filenameCategory = category;
        break;
      }
    }

    if (!filenameCategory) {
      return textResult;
    }

    // If filename hint matches the text classification, boost confidence
    if (filenameCategory === textResult.category) {
      const boostedConfidence = Math.min(textResult.confidence * 1.2, 1.0);
      return {
        ...textResult,
        confidence: boostedConfidence,
      };
    }

    // If text confidence is low and filename strongly suggests a category,
    // prefer the filename hint
    if (textResult.confidence < 0.5) {
      const filenameScore = textResult.scores.find((s) => s.category === filenameCategory);

      return {
        category: filenameCategory,
        confidence: Math.max(filenameScore?.score || 0.4, 0.4),
        scores: textResult.scores.map((s) => ({
          ...s,
          score: s.category === filenameCategory ? Math.max(s.score, 0.4) : s.score,
        })),
      };
    }

    return textResult;
  }

  /**
   * Train the document classification model for an organization.
   * Uses organization-specific training data from the database.
   * Falls back to default seed data if insufficient samples exist.
   */
  async trainModel(
    organizationId: string,
  ): Promise<{ version: number; accuracy: number; sampleCount: number }> {
    this.logger.log(`Training document classifier for org ${organizationId}`);

    // Fetch organization-specific training data
    const trainingData = await this.prisma.aiTrainingData.findMany({
      where: {
        organizationId,
        feature: AiFeature.DOCUMENT_CLASSIFICATION,
      },
    });

    const classifier = new natural.BayesClassifier();

    let sampleCount = 0;

    // Add organization-specific training data
    for (const sample of trainingData) {
      const inputData = sample.inputData as Record<string, any>;
      const text = inputData.text || '';
      if (text && sample.label) {
        classifier.addDocument(text, sample.label);
        sampleCount++;
      }
    }

    // If insufficient data, seed with defaults
    const MIN_SAMPLES_PER_CATEGORY = 3;
    const categoryCounts = new Map<string, number>();
    for (const sample of trainingData) {
      const count = categoryCounts.get(sample.label) || 0;
      categoryCounts.set(sample.label, count + 1);
    }

    const allCategories = Object.values(DocumentCategory);
    const needsSeeding = allCategories.some(
      (cat) => (categoryCounts.get(cat) || 0) < MIN_SAMPLES_PER_CATEGORY,
    );

    if (needsSeeding) {
      this.logger.log(
        `Seeding default training data for org ${organizationId} (insufficient samples)`,
      );
      for (const seed of DEFAULT_TRAINING_DATA) {
        classifier.addDocument(seed.text, seed.category);
        sampleCount++;
      }
    }

    // Train the classifier
    classifier.train();

    // Evaluate accuracy using cross-validation on the training set
    const accuracy = this.evaluateAccuracy(classifier, [
      ...trainingData.map((d) => ({
        text: (d.inputData as Record<string, any>).text || '',
        label: d.label,
      })),
      ...(needsSeeding
        ? DEFAULT_TRAINING_DATA.map((d) => ({
            text: d.text,
            label: d.category,
          }))
        : []),
    ]);

    // Serialize and save the model
    const serializedModel = JSON.parse(JSON.stringify(classifier));

    const { version } = await this.modelRegistry.saveModel(
      organizationId,
      AiFeature.DOCUMENT_CLASSIFICATION,
      serializedModel,
      accuracy,
      sampleCount,
    );

    // Update in-memory cache
    this.classifierCache.set(organizationId, classifier);

    this.logger.log(
      `Trained document classifier v${version} for org ${organizationId}: ` +
        `accuracy=${(accuracy * 100).toFixed(1)}%, samples=${sampleCount}`,
    );

    return { version, accuracy, sampleCount };
  }

  /**
   * Get the current model status for document classification.
   */
  async getModelStatus(organizationId: string): Promise<ModelStatus> {
    const [registryStatus, trainingDataCount] = await Promise.all([
      this.modelRegistry.getModelStatus(organizationId, AiFeature.DOCUMENT_CLASSIFICATION),
      this.prisma.aiTrainingData.count({
        where: {
          organizationId,
          feature: AiFeature.DOCUMENT_CLASSIFICATION,
        },
      }),
    ]);

    return {
      ...registryStatus,
      trainingDataCount,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Load a classifier from cache or model registry.
   */
  private async getOrLoadClassifier(organizationId: string): Promise<any | null> {
    // Check in-memory cache first
    if (this.classifierCache.has(organizationId)) {
      return this.classifierCache.get(organizationId);
    }

    // Load from model registry
    const savedModel = await this.modelRegistry.loadActiveModel(
      organizationId,
      AiFeature.DOCUMENT_CLASSIFICATION,
    );

    if (!savedModel || !savedModel.modelData) {
      return null;
    }

    try {
      const classifier = natural.BayesClassifier.restore(savedModel.modelData);
      this.classifierCache.set(organizationId, classifier);
      return classifier;
    } catch (error) {
      this.logger.error(`Failed to restore classifier for org ${organizationId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Run classification using a trained Bayes classifier.
   * Returns the top category and confidence scores for all categories.
   */
  private runClassification(classifier: any, text: string): ClassificationResult {
    const preprocessedText = this.preprocessText(text);
    const topCategory = classifier.classify(preprocessedText) as DocumentCategory;
    const classifications = classifier.getClassifications(preprocessedText) as Array<{
      label: string;
      value: number;
    }>;

    // Convert log probabilities to normalized scores (0-1)
    const scores = this.normalizeScores(classifications);

    const topScore = scores.find((s) => s.category === topCategory);

    const result: ClassificationResult = {
      category: topCategory,
      confidence: topScore?.score || 0,
      scores,
    };

    return this.applyKeywordBoost(result, text);
  }

  /**
   * Apply keyword-based confidence boosting for documents with strong
   * category-specific keywords that the Bayes classifier may underweight
   * (e.g., bank statements that contain embedded tax invoices).
   */
  private applyKeywordBoost(result: ClassificationResult, text: string): ClassificationResult {
    const lowerText = text.toLowerCase();

    // Strong INVOICE keywords (bilingual)
    const invoiceKeywords = [
      'tax invoice',
      'فاتورة ضريبية',
      'invoice no',
      'invoice number',
      'رقم الفاتورة',
      'فاتورة رقم',
      'bill to',
      'total amount due',
      'invoice date',
      'تاريخ الفاتورة',
    ];

    const invoiceKeywordCount = invoiceKeywords.filter((kw) => lowerText.includes(kw)).length;

    // If 2+ strong invoice keywords found but classification is not INVOICE, override
    if (invoiceKeywordCount >= 2 && result.category !== DocumentCategory.INVOICE) {
      const boostedScore = Math.min(0.5 + invoiceKeywordCount * 0.1, 0.95);
      return {
        category: DocumentCategory.INVOICE,
        confidence: boostedScore,
        scores: result.scores.map((s) => ({
          ...s,
          score: s.category === DocumentCategory.INVOICE ? boostedScore : s.score * 0.8,
        })),
      };
    }

    // If already INVOICE but low confidence, boost based on keyword count
    if (
      result.category === DocumentCategory.INVOICE &&
      result.confidence < 0.5 &&
      invoiceKeywordCount >= 1
    ) {
      const boostedConfidence = Math.min(
        Math.max(result.confidence, 0.4 + invoiceKeywordCount * 0.1),
        0.9,
      );
      return {
        ...result,
        confidence: boostedConfidence,
      };
    }

    return result;
  }

  /**
   * Classify text using only the default seed data (no trained model).
   * Used as a fallback when no model has been trained yet.
   */
  private classifyWithDefaults(text: string): ClassificationResult {
    const classifier = new natural.BayesClassifier();

    for (const seed of DEFAULT_TRAINING_DATA) {
      classifier.addDocument(seed.text, seed.category);
    }
    classifier.train();

    return this.runClassification(classifier, text);
  }

  /**
   * Preprocess text for classification: lowercase, remove noise, normalize whitespace.
   */
  private preprocessText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Normalize raw classifier scores (log probabilities) to 0-1 range.
   * Uses softmax-style normalization over the exponentiated values.
   */
  private normalizeScores(
    classifications: Array<{ label: string; value: number }>,
  ): ClassificationScore[] {
    if (classifications.length === 0) {
      return Object.values(DocumentCategory).map((cat) => ({
        category: cat,
        score: 0,
      }));
    }

    // The Bayes classifier returns negative log probabilities.
    // We exponentiate them and normalize to get a probability distribution.
    const maxVal = Math.max(...classifications.map((c) => c.value));
    const expValues = classifications.map((c) => ({
      label: c.label,
      exp: Math.exp(c.value - maxVal),
    }));
    const sumExp = expValues.reduce((sum, v) => sum + v.exp, 0);

    return expValues.map((v) => ({
      category: v.label as DocumentCategory,
      score: sumExp > 0 ? v.exp / sumExp : 0,
    }));
  }

  /**
   * Evaluate classifier accuracy on a set of labeled samples.
   * Uses simple hold-one-out evaluation for small datasets.
   */
  private evaluateAccuracy(
    classifier: any,
    samples: Array<{ text: string; label: string }>,
  ): number {
    if (samples.length === 0) return 0;

    let correct = 0;
    for (const sample of samples) {
      if (!sample.text) continue;
      const predicted = classifier.classify(this.preprocessText(sample.text));
      if (predicted === sample.label) {
        correct++;
      }
    }

    return samples.length > 0 ? correct / samples.length : 0;
  }
}
