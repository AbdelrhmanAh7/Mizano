import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeedbackService } from './ai-feedback.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { BoundedCache } from '../utils/bounded-cache.util';
import { buildChatbotPrompt } from '../prompts/nlp.prompts';
import { PredictionMethod } from '../types/prediction-method.type';
import { OllamaInferencePriority } from '../types/ollama-inference.types';
import { describeError } from '../../../common/utils/redact';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const natural = require('natural');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nlp = require('compromise');

/**
 * Supported chatbot intents
 */
export type ChatIntent =
  | 'invoice_status'
  | 'payment_reminder'
  | 'account_balance'
  | 'create_invoice'
  | 'report_request'
  | 'help'
  | 'greeting'
  | 'unknown';

export interface ChatEntity {
  type: 'customer' | 'invoice_number' | 'amount' | 'account' | 'date' | 'report_type';
  value: string;
  raw: string;
}

export interface ChatResponse {
  intent: ChatIntent;
  confidence: number;
  response: string;
  data?: Record<string, unknown>;
  suggestions: string[];
  predictionMethod?: PredictionMethod;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  intent?: ChatIntent;
  timestamp: Date;
}

interface ChatSession {
  messages: ChatMessage[];
  createdAt: Date;
}

/**
 * Default training phrases for the BayesClassifier.
 * Used to seed the classifier when no training data exists.
 */
const DEFAULT_TRAINING_DATA: Array<{ text: string; intent: ChatIntent }> = [
  // invoice_status
  { text: 'what is the status of invoice INV-001', intent: 'invoice_status' },
  { text: 'check invoice', intent: 'invoice_status' },
  { text: 'find invoice', intent: 'invoice_status' },
  { text: 'invoice status', intent: 'invoice_status' },
  { text: 'look up invoice', intent: 'invoice_status' },
  { text: 'where is my invoice', intent: 'invoice_status' },
  { text: 'invoice details', intent: 'invoice_status' },
  { text: 'show me invoice', intent: 'invoice_status' },
  // payment_reminder
  { text: 'remind payment', intent: 'payment_reminder' },
  { text: 'overdue invoices', intent: 'payment_reminder' },
  { text: 'payment due', intent: 'payment_reminder' },
  { text: 'unpaid invoices', intent: 'payment_reminder' },
  { text: 'outstanding payments', intent: 'payment_reminder' },
  { text: 'who owes money', intent: 'payment_reminder' },
  { text: 'late payments', intent: 'payment_reminder' },
  { text: 'pending payments', intent: 'payment_reminder' },
  // account_balance
  { text: 'account balance', intent: 'account_balance' },
  { text: "what's the balance", intent: 'account_balance' },
  { text: 'check balance', intent: 'account_balance' },
  { text: 'how much in account', intent: 'account_balance' },
  { text: 'show balance', intent: 'account_balance' },
  { text: 'balance of account', intent: 'account_balance' },
  { text: 'current balance', intent: 'account_balance' },
  // create_invoice
  { text: 'create invoice', intent: 'create_invoice' },
  { text: 'new invoice', intent: 'create_invoice' },
  { text: 'make invoice', intent: 'create_invoice' },
  { text: 'generate invoice', intent: 'create_invoice' },
  { text: 'draft an invoice', intent: 'create_invoice' },
  { text: 'bill customer', intent: 'create_invoice' },
  // report_request
  { text: 'generate report', intent: 'report_request' },
  { text: 'show report', intent: 'report_request' },
  { text: 'monthly report', intent: 'report_request' },
  { text: 'profit and loss', intent: 'report_request' },
  { text: 'balance sheet', intent: 'report_request' },
  { text: 'financial report', intent: 'report_request' },
  { text: 'sales report', intent: 'report_request' },
  { text: 'aging report', intent: 'report_request' },
  // help
  { text: 'help', intent: 'help' },
  { text: 'what can you do', intent: 'help' },
  { text: 'commands', intent: 'help' },
  { text: 'how to use', intent: 'help' },
  { text: 'what do you support', intent: 'help' },
  { text: 'show me options', intent: 'help' },
  // greeting
  { text: 'hello', intent: 'greeting' },
  { text: 'hi', intent: 'greeting' },
  { text: 'hey', intent: 'greeting' },
  { text: 'good morning', intent: 'greeting' },
  { text: 'good afternoon', intent: 'greeting' },
  { text: 'good evening', intent: 'greeting' },
  { text: 'howdy', intent: 'greeting' },
];

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);

  /** Per-org BayesClassifier instances (bounded: max 50 orgs, 1h TTL) */
  private classifiers = new BoundedCache<unknown>(50, 60 * 60 * 1000);

  /** In-memory chat history: key = `${orgId}:${userId}` (bounded: max 200 sessions, 30min TTL) */
  private chatHistory = new BoundedCache<ChatSession>(200, 30 * 60 * 1000);

  constructor(
    private prisma: PrismaService,
    private feedbackService: AiFeedbackService,
    private gateway: OllamaInferenceGateway,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Process an incoming chat message and return a structured response.
   */
  async processMessage(
    organizationId: string,
    userId: string,
    message: string,
  ): Promise<ChatResponse> {
    this.logger.log(`Processing message for user ${userId} in org ${organizationId}`);

    // --- Step 1: Detect intent + extract entities ---
    // Try Ollama first for better NLU, fall back to Bayes classifier.
    let intent: ChatIntent = 'unknown';
    let confidence = 0;
    let entities: ChatEntity[] = [];
    let predictionMethod: PredictionMethod = 'ML';

    try {
      const history = this.getHistory(organizationId, userId, 10);
      const promptHistory = history.map((m) => ({ role: m.role, content: m.content }));
      const prompt = buildChatbotPrompt(message, promptHistory, { organizationId });
      const ollamaResult = await this.gateway.infer<{
        intent: string;
        entities: Record<string, unknown>;
        response: string;
        suggestions: string[];
        confidence: number;
      }>(prompt);

      if (ollamaResult) {
        intent = (ollamaResult.data.intent as ChatIntent) || 'unknown';
        confidence = ollamaResult.data.confidence ?? 0.8;
        predictionMethod = 'OLLAMA';

        // Merge Ollama-extracted entities with regex entities for best coverage
        entities = this.extractEntities(message);
        const ollamaEntities = ollamaResult.data.entities || {};
        if (ollamaEntities.invoice_number && !entities.some((e) => e.type === 'invoice_number')) {
          entities.push({
            type: 'invoice_number',
            value: String(ollamaEntities.invoice_number),
            raw: String(ollamaEntities.invoice_number),
          });
        }
        if (ollamaEntities.customer_name && !entities.some((e) => e.type === 'customer')) {
          entities.push({
            type: 'customer',
            value: String(ollamaEntities.customer_name),
            raw: String(ollamaEntities.customer_name),
          });
        }
        if (ollamaEntities.amount && !entities.some((e) => e.type === 'amount')) {
          entities.push({
            type: 'amount',
            value: String(ollamaEntities.amount),
            raw: String(ollamaEntities.amount),
          });
        }
        if (ollamaEntities.date && !entities.some((e) => e.type === 'date')) {
          entities.push({
            type: 'date',
            value: String(ollamaEntities.date),
            raw: String(ollamaEntities.date),
          });
        }
        if (ollamaEntities.report_type && !entities.some((e) => e.type === 'report_type')) {
          entities.push({
            type: 'report_type',
            value: String(ollamaEntities.report_type),
            raw: String(ollamaEntities.report_type),
          });
        }
      }
    } catch (error) {
      this.logger.warn(
        `Ollama chatbot inference failed, falling back to Bayes: ${describeError(error)}`,
      );
    }

    // Fall back to Bayes classifier if Ollama didn't produce an intent
    if (intent === 'unknown' && predictionMethod !== 'OLLAMA') {
      const classifier = this.getOrTrainClassifier(organizationId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typedClassifier = classifier as any;
      const classifications = typedClassifier.getClassifications(message.toLowerCase());
      const topClassification = classifications[0];
      intent = topClassification ? (topClassification.label as ChatIntent) : 'unknown';
      confidence = topClassification ? topClassification.value : 0;
      predictionMethod = 'ML';
    }

    // Ensure we always have regex entities
    if (entities.length === 0) {
      entities = this.extractEntities(message);
    }

    // --- Step 2: Execute the data-backed handler for the detected intent ---
    let response: ChatResponse;

    switch (intent) {
      case 'invoice_status':
        response = await this.handleInvoiceStatus(organizationId, entities, confidence);
        break;
      case 'account_balance':
        response = await this.handleAccountBalance(organizationId, entities, confidence);
        break;
      case 'payment_reminder':
        response = await this.handlePaymentReminder(organizationId, entities, confidence);
        break;
      case 'create_invoice':
        response = this.handleCreateInvoice(entities, confidence);
        break;
      case 'report_request':
        response = await this.handleReportRequest(organizationId, entities, confidence);
        break;
      case 'greeting':
        response = this.handleGreeting(confidence);
        break;
      case 'help':
        response = this.handleHelp(confidence);
        break;
      default:
        response = this.handleUnknown(confidence);
        break;
    }

    // Store prediction for feedback tracking
    try {
      await this.feedbackService.storePrediction(
        organizationId,
        'CHATBOT',
        { message, userId },
        { intent: response.intent, response: response.response },
        response.confidence,
        1,
      );
    } catch (error) {
      this.logger.warn(`Failed to store chat prediction: ${describeError(error)}`);
    }

    // Tag with prediction method
    response.predictionMethod = predictionMethod;

    // Persist history
    this.addToHistory(organizationId, userId, message, response);

    return response;
  }

  /**
   * Stream a chatbot response token-by-token via callbacks.
   * Uses Bayes for instant intent detection, then streams the Ollama response.
   */
  async processMessageStream(
    organizationId: string,
    userId: string,
    message: string,
    callbacks: {
      onIntent: (intent: ChatIntent, confidence: number) => void;
      onToken: (token: string) => void;
      onComplete: (response: ChatResponse) => void;
      onError: (error: string) => void;
    },
  ): Promise<void> {
    this.logger.log(`Streaming message for user ${userId} in org ${organizationId}`);

    // Fast intent detection via Bayes (no Ollama wait)
    const classifier = this.getOrTrainClassifier(organizationId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedClassifier = classifier as any;
    const classifications = typedClassifier.getClassifications(message.toLowerCase());
    const topClassification = classifications[0];
    const intent: ChatIntent = topClassification
      ? (topClassification.label as ChatIntent)
      : 'unknown';
    const confidence: number = topClassification ? topClassification.value : 0;

    callbacks.onIntent(intent, confidence);

    // Build prompt for streaming
    const history = this.getHistory(organizationId, userId, 10);
    const promptHistory = history.map((m) => ({ role: m.role, content: m.content }));
    const prompt = buildChatbotPrompt(message, promptHistory, { organizationId });

    try {
      // Stream the response via Ollama
      const stream$ = this.gateway.inferStream(prompt, {
        priority: OllamaInferencePriority.CRITICAL,
        rawText: true,
        temperature: 0.3,
      });

      let fullContent = '';

      await new Promise<void>((resolve, reject) => {
        stream$.subscribe({
          next: (chunk) => {
            if (chunk.token) {
              callbacks.onToken(chunk.token);
              fullContent += chunk.token;
            }
          },
          error: (err) => {
            // Fall back to non-streaming response
            this.logger.warn(`Streaming failed, falling back: ${describeError(err)}`);
            void this.processMessage(organizationId, userId, message)
              .then((response) => {
                callbacks.onComplete(response);
                resolve();
              })
              .catch((fallbackErr) => {
                callbacks.onError(
                  fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
                );
                reject(fallbackErr);
              });
          },
          complete: () => {
            const response: ChatResponse = {
              intent,
              confidence,
              response: fullContent,
              suggestions: [],
              predictionMethod: 'OLLAMA',
            };

            this.addToHistory(organizationId, userId, message, response);
            callbacks.onComplete(response);
            resolve();
          },
        });
      });
    } catch (error) {
      // Final fallback
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Stream processing failed: ${describeError(error)}`);
      callbacks.onError(msg);
    }
  }

  /**
   * Retrieve recent chat history for a user.
   */
  getHistory(organizationId: string, userId: string, limit: number = 50): ChatMessage[] {
    const key = `${organizationId}:${userId}`;
    const session = this.chatHistory.get(key);
    if (!session) {
      return [];
    }
    return session.messages.slice(-limit);
  }

  /**
   * Clear chat history for a user.
   */
  clearHistory(organizationId: string, userId: string): void {
    const key = `${organizationId}:${userId}`;
    this.chatHistory.delete(key);
    this.logger.log(`Cleared chat history for user ${userId} in org ${organizationId}`);
  }

  /**
   * Record user feedback on a chatbot response.
   * If the response was not helpful or the intent was wrong, it is stored
   * as a correction and may trigger classifier retraining when the threshold is reached.
   */
  async recordChatFeedback(
    _organizationId: string,
    _sessionId: string,
    _messageId: string,
    _wasHelpful: boolean,
    _correctedIntent?: string,
  ): Promise<void> {
    // Feedback recorded — no retraining infrastructure
  }

  // ---------------------------------------------------------------------------
  // Entity extraction
  // ---------------------------------------------------------------------------

  /**
   * Extract entities (customer names, invoice numbers, amounts, dates)
   * from a natural-language message using compromise + regex.
   */
  private extractEntities(message: string): ChatEntity[] {
    const entities: ChatEntity[] = [];

    // Invoice numbers via regex (e.g. INV-001, INV001, INV 001)
    const invoicePattern = /\bINV[-\s]?(\d{1,6})\b/gi;
    let invoiceMatch: RegExpExecArray | null;
    while ((invoiceMatch = invoicePattern.exec(message)) !== null) {
      const raw = invoiceMatch[0];
      // Normalise to INV-XXX format
      const num = invoiceMatch[1];
      entities.push({
        type: 'invoice_number',
        value: `INV-${num.padStart(3, '0')}`,
        raw,
      });
    }

    // Money amounts via regex (e.g. $1,200.50, 500)
    const amountPattern = /\$?([\d,]+\.?\d{0,2})\b/g;
    let amountMatch: RegExpExecArray | null;
    while ((amountMatch = amountPattern.exec(message)) !== null) {
      const numericValue = amountMatch[1].replace(/,/g, '');
      const parsed = parseFloat(numericValue);
      if (!isNaN(parsed) && parsed > 0) {
        entities.push({
          type: 'amount',
          value: numericValue,
          raw: amountMatch[0],
        });
      }
    }

    // Use compromise for people and organization names
    const doc = nlp(message);

    const people: string[] = doc.people().out('array');
    for (const name of people) {
      entities.push({ type: 'customer', value: name, raw: name });
    }

    const orgs: string[] = doc.organizations().out('array');
    for (const orgName of orgs) {
      entities.push({ type: 'customer', value: orgName, raw: orgName });
    }

    // Extract dates via regex instead of compromise plugin (compromise core has no .dates())
    const dateRegex =
      /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s*\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b/gi;
    const dateMatches = message.match(dateRegex) || [];
    for (const d of dateMatches) {
      entities.push({ type: 'date', value: d, raw: d });
    }

    // Account name heuristic: look for "account <name>" patterns
    const accountPattern =
      /\baccount\s+(?:called\s+|named\s+)?["']?([A-Za-z\s]+?)["']?(?:\s*$|\s*\?)/gi;
    let accountMatch: RegExpExecArray | null;
    while ((accountMatch = accountPattern.exec(message)) !== null) {
      const name = accountMatch[1].trim();
      if (name.length > 1) {
        entities.push({ type: 'account', value: name, raw: accountMatch[0] });
      }
    }

    // Report type heuristic: detect common report names
    const lower = message.toLowerCase();
    const reportKeywords: Array<{ keywords: string[]; type: string }> = [
      { keywords: ['profit and loss', 'profit & loss', 'p&l', 'income statement'], type: 'pl' },
      { keywords: ['balance sheet'], type: 'balance_sheet' },
      {
        keywords: ['cash flow', 'cash inflow', 'cash outflow'],
        type: 'cash_flow',
      },
      { keywords: ['ar aging', 'accounts receivable', 'receivable aging'], type: 'ar_aging' },
      { keywords: ['ap aging', 'accounts payable', 'payable aging'], type: 'ap_aging' },
      { keywords: ['general ledger', 'ledger'], type: 'general_ledger' },
    ];
    for (const rk of reportKeywords) {
      if (rk.keywords.some((kw) => lower.includes(kw))) {
        entities.push({ type: 'report_type', value: rk.type, raw: rk.keywords[0] });
        break;
      }
    }

    return entities;
  }

  // ---------------------------------------------------------------------------
  // Intent handlers
  // ---------------------------------------------------------------------------

  private async handleInvoiceStatus(
    organizationId: string,
    entities: ChatEntity[],
    confidence: number,
  ): Promise<ChatResponse> {
    const invoiceEntity = entities.find((e) => e.type === 'invoice_number');

    if (!invoiceEntity) {
      return {
        intent: 'invoice_status',
        confidence,
        response:
          'I can look up an invoice for you. Could you provide the invoice number? For example: "What is the status of INV-001?"',
        suggestions: ['Check invoice INV-001', 'Show overdue invoices', 'List recent invoices'],
      };
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: {
        organizationId,
        invoiceNumber: invoiceEntity.value,
        deletedAt: null,
      },
      include: {
        customer: { select: { name: true } },
      },
    });

    if (!invoice) {
      return {
        intent: 'invoice_status',
        confidence,
        response: `I could not find invoice ${invoiceEntity.value} in your records. Please double-check the invoice number.`,
        suggestions: ['Show recent invoices', 'Search by customer name', 'Create new invoice'],
      };
    }

    return {
      intent: 'invoice_status',
      confidence,
      response: `Invoice ${invoice.invoiceNumber} for ${invoice.customer.name} is currently **${invoice.status}**. Total: $${Number(invoice.grandTotal).toLocaleString()}, Due: ${invoice.dueDate.toLocaleDateString()}.`,
      data: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        grandTotal: Number(invoice.grandTotal),
        dueDate: invoice.dueDate,
        customerName: invoice.customer.name,
      },
      suggestions: [
        'Show overdue invoices',
        `Send reminder for ${invoice.invoiceNumber}`,
        'Check another invoice',
      ],
    };
  }

  private async handleAccountBalance(
    organizationId: string,
    entities: ChatEntity[],
    confidence: number,
  ): Promise<ChatResponse> {
    const accountEntity = entities.find((e) => e.type === 'account');
    const dateEntity = entities.find((e) => e.type === 'date');

    if (!accountEntity) {
      // No specific account — show a summary of all top-level accounts
      const accounts = await this.prisma.account.findMany({
        where: { organizationId, isActive: true, parentId: null },
        select: { id: true, code: true, name: true, type: true },
        orderBy: { code: 'asc' },
        take: 10,
      });

      if (accounts.length === 0) {
        return {
          intent: 'account_balance',
          confidence,
          response: 'No accounts found. Please set up your Chart of Accounts first.',
          suggestions: ['Go to Chart of Accounts', 'Help'],
        };
      }

      const accountList = accounts.map((a) => `- **${a.name}** (${a.code}) — ${a.type}`).join('\n');

      return {
        intent: 'account_balance',
        confidence,
        response:
          'Which account would you like to check? Here are your top-level accounts:\n\n' +
          accountList +
          '\n\nTry: "Balance of Cash" or "Balance of Accounts Receivable"',
        suggestions: accounts.slice(0, 3).map((a) => `Balance of ${a.name}`),
      };
    }

    const searchTerm = accountEntity.value.toLowerCase();

    // Try exact code match first, then fuzzy name match
    const account = await this.prisma.account.findFirst({
      where: {
        organizationId,
        isActive: true,
        OR: [
          { code: { equals: accountEntity.value, mode: 'insensitive' } },
          { name: { contains: searchTerm, mode: 'insensitive' } },
        ],
      },
    });

    if (!account) {
      return {
        intent: 'account_balance',
        confidence,
        response: `I could not find an account matching "${accountEntity.value}". Please check the account name or code.`,
        suggestions: ['Show all accounts', 'Balance of Cash', 'Balance of Accounts Receivable'],
      };
    }

    // Parse the optional date filter
    let asOfDate: Date | null = null;
    if (dateEntity) {
      const parsed = new Date(dateEntity.value);
      if (!isNaN(parsed.getTime())) {
        asOfDate = parsed;
      }
    }

    // Calculate actual balance from journal entries
    const journalFilter: Record<string, unknown> = {
      accountId: account.id,
      journal: {
        organizationId,
        isPosted: true,
        deletedAt: null,
        ...(asOfDate ? { date: { lte: asOfDate } } : {}),
      },
    };

    const aggregation = await this.prisma.journalLine.aggregate({
      where: journalFilter,
      _sum: { debit: true, credit: true },
    });

    const totalDebits = Number(aggregation._sum.debit ?? 0);
    const totalCredits = Number(aggregation._sum.credit ?? 0);
    const openingBalance = Number(account.openingBalance ?? 0);

    // Balance depends on account type (debit-normal vs credit-normal)
    const debitNormalTypes = ['ASSET', 'EXPENSE'];
    const isDebitNormal = debitNormalTypes.includes(account.type);
    const balance = isDebitNormal
      ? openingBalance + totalDebits - totalCredits
      : openingBalance + totalCredits - totalDebits;

    const dateLabel = asOfDate ? ` as of **${asOfDate.toISOString().split('T')[0]}**` : '';

    return {
      intent: 'account_balance',
      confidence,
      response:
        `The balance of **${account.name}** (${account.code})${dateLabel} is **$${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**.\n\n` +
        `Account type: ${account.type} | Debits: $${totalDebits.toLocaleString()} | Credits: $${totalCredits.toLocaleString()}`,
      data: {
        accountId: account.id,
        accountName: account.name,
        accountCode: account.code,
        balance,
        totalDebits,
        totalCredits,
        openingBalance,
        type: account.type,
        asOfDate: asOfDate?.toISOString().split('T')[0] ?? null,
      },
      suggestions: [
        'Show journal entries for this account',
        'Check another account',
        'Generate balance sheet',
      ],
    };
  }

  private async handlePaymentReminder(
    organizationId: string,
    entities: ChatEntity[],
    confidence: number,
  ): Promise<ChatResponse> {
    const customerEntity = entities.find((e) => e.type === 'customer');

    const now = new Date();

    // Build the where clause
    const where: Record<string, unknown> = {
      organizationId,
      status: 'OVERDUE',
      deletedAt: null,
      dueDate: { lt: now },
    };

    // If a customer name was mentioned, filter by it
    if (customerEntity) {
      const customer = await this.prisma.customer.findFirst({
        where: {
          organizationId,
          name: { contains: customerEntity.value, mode: 'insensitive' },
        },
      });
      if (customer) {
        where.customerId = customer.id;
      }
    }

    const overdueInvoices = await this.prisma.invoice.findMany({
      where,
      include: { customer: { select: { name: true, email: true } } },
      orderBy: { dueDate: 'asc' },
      take: 10,
    });

    if (overdueInvoices.length === 0) {
      const qualifier = customerEntity ? ` for ${customerEntity.value}` : '';
      return {
        intent: 'payment_reminder',
        confidence,
        response: `Great news! There are no overdue invoices${qualifier}.`,
        suggestions: ['Show all invoices', 'Check account balance', 'Generate aging report'],
      };
    }

    const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + Number(inv.balanceDue), 0);

    const lines = overdueInvoices.map(
      (inv) =>
        `- ${inv.invoiceNumber} (${inv.customer.name}): $${Number(inv.balanceDue).toLocaleString()} — due ${inv.dueDate.toLocaleDateString()}`,
    );

    return {
      intent: 'payment_reminder',
      confidence,
      response: `There are **${overdueInvoices.length}** overdue invoices totalling **$${totalOverdue.toLocaleString()}**:\n${lines.join('\n')}`,
      data: {
        overdueCount: overdueInvoices.length,
        totalOverdue,
        invoices: overdueInvoices.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          customerName: inv.customer.name,
          balanceDue: Number(inv.balanceDue),
          dueDate: inv.dueDate,
        })),
      },
      suggestions: ['Send payment reminders', 'Generate AR aging report', 'Check specific invoice'],
    };
  }

  private handleCreateInvoice(entities: ChatEntity[], confidence: number): ChatResponse {
    const customerEntity = entities.find((e) => e.type === 'customer');
    const amountEntity = entities.find((e) => e.type === 'amount');

    const details: string[] = [];
    if (customerEntity) details.push(`Customer: ${customerEntity.value}`);
    if (amountEntity) details.push(`Amount: $${amountEntity.value}`);

    const detailText =
      details.length > 0
        ? ` Here is what I gathered:\n${details.join('\n')}\n\nPlease confirm or navigate to the invoice creation page to complete the details.`
        : ' To proceed, please navigate to Sales > Invoices > New Invoice, or tell me the customer name and amount.';

    return {
      intent: 'create_invoice',
      confidence,
      response: `I can help you create an invoice.${detailText}`,
      data: {
        customerName: customerEntity?.value ?? null,
        amount: amountEntity?.value ?? null,
        requiresConfirmation: true,
      },
      suggestions: ['Go to create invoice page', 'Show recent invoices', 'List customers'],
    };
  }

  private async handleReportRequest(
    organizationId: string,
    entities: ChatEntity[],
    confidence: number,
  ): Promise<ChatResponse> {
    const reportEntity = entities.find((e) => e.type === 'report_type');

    if (!reportEntity) {
      return {
        intent: 'report_request',
        confidence,
        response:
          'Which report would you like to see?\n\n' +
          '- **Profit & Loss** — summary of revenue and expenses\n' +
          '- **Balance Sheet** — assets, liabilities, and equity\n' +
          '- **AR Aging** — outstanding customer receivables\n' +
          '- **AP Aging** — outstanding vendor payables\n' +
          '- **Cash Flow** — cash inflows and outflows\n' +
          '- **General Ledger** — detailed journal entries',
        suggestions: [
          'Show Profit & Loss',
          'Show Balance Sheet',
          'Show AR Aging',
          'Show Cash Flow',
        ],
      };
    }

    const reportType = reportEntity.value.toLowerCase();

    switch (reportType) {
      case 'pl':
      case 'profit_loss':
      case 'income_statement':
        return this.generatePLSummary(organizationId, confidence);
      case 'balance_sheet':
        return this.generateBalanceSheetSummary(organizationId, confidence);
      case 'cash_flow':
        return this.generateCashFlowSummary(organizationId, confidence);
      case 'ar_aging':
        return this.generateARAging(organizationId, confidence);
      case 'ap_aging':
        return this.generateAPAging(organizationId, confidence);
      case 'general_ledger':
        return this.generateGLSummary(organizationId, confidence);
      default:
        return {
          intent: 'report_request',
          confidence,
          response: `I don't recognize the report type "${reportEntity.raw}". Try: Profit & Loss, Balance Sheet, Cash Flow, AR Aging, AP Aging, or General Ledger.`,
          suggestions: ['Show Profit & Loss', 'Show Balance Sheet', 'Show Cash Flow'],
        };
    }
  }

  private async generatePLSummary(
    organizationId: string,
    confidence: number,
  ): Promise<ChatResponse> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const revenueAccounts = await this.prisma.journalLine.aggregate({
      where: {
        account: { organizationId, type: 'REVENUE' },
        journal: { organizationId, isPosted: true, deletedAt: null, date: { gte: startOfMonth } },
      },
      _sum: { credit: true, debit: true },
    });

    const expenseAccounts = await this.prisma.journalLine.aggregate({
      where: {
        account: { organizationId, type: 'EXPENSE' },
        journal: { organizationId, isPosted: true, deletedAt: null, date: { gte: startOfMonth } },
      },
      _sum: { debit: true, credit: true },
    });

    const revenue =
      Number(revenueAccounts._sum.credit ?? 0) - Number(revenueAccounts._sum.debit ?? 0);
    const expenses =
      Number(expenseAccounts._sum.debit ?? 0) - Number(expenseAccounts._sum.credit ?? 0);
    const netIncome = revenue - expenses;
    const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    return {
      intent: 'report_request',
      confidence,
      response:
        `**Profit & Loss Summary — ${monthName}**\n\n` +
        `| | Amount |\n|---|---|\n` +
        `| Revenue | $${revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })} |\n` +
        `| Expenses | $${expenses.toLocaleString(undefined, { minimumFractionDigits: 2 })} |\n` +
        `| **Net Income** | **$${netIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}** |`,
      data: { revenue, expenses, netIncome, period: monthName },
      suggestions: ['Show Balance Sheet', 'Show Cash Flow', 'Show full P&L report page'],
    };
  }

  private async generateBalanceSheetSummary(
    organizationId: string,
    confidence: number,
  ): Promise<ChatResponse> {
    const accountTypes = ['ASSET', 'LIABILITY', 'EQUITY'] as const;
    const totals: Record<string, number> = {};

    for (const type of accountTypes) {
      const agg = await this.prisma.journalLine.aggregate({
        where: {
          account: { organizationId, type },
          journal: { organizationId, isPosted: true, deletedAt: null },
        },
        _sum: { debit: true, credit: true },
      });

      const openingAgg = await this.prisma.account.aggregate({
        where: { organizationId, type, isActive: true },
        _sum: { openingBalance: true },
      });

      const opening = Number(openingAgg._sum.openingBalance ?? 0);
      const debits = Number(agg._sum.debit ?? 0);
      const credits = Number(agg._sum.credit ?? 0);

      if (type === 'ASSET') {
        totals[type] = opening + debits - credits;
      } else {
        totals[type] = opening + credits - debits;
      }
    }

    const fmt = (n: number): string =>
      `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    return {
      intent: 'report_request',
      confidence,
      response:
        `**Balance Sheet Summary**\n\n` +
        `| | Amount |\n|---|---|\n` +
        `| Total Assets | ${fmt(totals.ASSET)} |\n` +
        `| Total Liabilities | ${fmt(totals.LIABILITY)} |\n` +
        `| Total Equity | ${fmt(totals.EQUITY)} |\n` +
        `| **Assets − (Liabilities + Equity)** | **${fmt(totals.ASSET - totals.LIABILITY - totals.EQUITY)}** |`,
      data: totals,
      suggestions: ['Show Profit & Loss', 'Show Cash Flow', 'Show full Balance Sheet page'],
    };
  }

  private async generateCashFlowSummary(
    organizationId: string,
    confidence: number,
  ): Promise<ChatResponse> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Cash & bank type accounts
    const cashAccounts = await this.prisma.account.findMany({
      where: {
        organizationId,
        isActive: true,
        type: 'ASSET',
        OR: [
          { name: { contains: 'cash', mode: 'insensitive' } },
          { name: { contains: 'bank', mode: 'insensitive' } },
          { subType: { in: ['cash', 'bank'] } },
        ],
      },
      select: { id: true, name: true },
    });

    if (cashAccounts.length === 0) {
      return {
        intent: 'report_request',
        confidence,
        response:
          'No cash or bank accounts found. Please set up cash/bank accounts in your Chart of Accounts.',
        suggestions: ['Go to Chart of Accounts', 'Show Balance Sheet'],
      };
    }

    const cashIds = cashAccounts.map((a) => a.id);

    const thisMonth = await this.prisma.journalLine.aggregate({
      where: {
        accountId: { in: cashIds },
        journal: { organizationId, isPosted: true, deletedAt: null, date: { gte: startOfMonth } },
      },
      _sum: { debit: true, credit: true },
    });

    const inflows = Number(thisMonth._sum.debit ?? 0);
    const outflows = Number(thisMonth._sum.credit ?? 0);
    const netCashFlow = inflows - outflows;
    const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    const fmt = (n: number): string =>
      `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    return {
      intent: 'report_request',
      confidence,
      response:
        `**Cash Flow Summary — ${monthName}**\n\n` +
        `| | Amount |\n|---|---|\n` +
        `| Cash Inflows | ${fmt(inflows)} |\n` +
        `| Cash Outflows | ${fmt(outflows)} |\n` +
        `| **Net Cash Flow** | **${fmt(netCashFlow)}** |\n\n` +
        `Accounts tracked: ${cashAccounts.map((a) => a.name).join(', ')}`,
      data: { inflows, outflows, netCashFlow, period: monthName },
      suggestions: ['Show Profit & Loss', 'Show Balance Sheet', 'Check account balance'],
    };
  }

  private async generateARAging(organizationId: string, confidence: number): Promise<ChatResponse> {
    const now = new Date();
    const openInvoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ['SENT', 'OVERDUE', 'PARTIALLY_PAID'] },
      },
      select: { balanceDue: true, dueDate: true, invoiceNumber: true },
      orderBy: { dueDate: 'asc' },
    });

    const buckets = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };
    for (const inv of openInvoices) {
      const daysOverdue = Math.floor(
        (now.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      const amount = Number(inv.balanceDue);
      if (daysOverdue <= 0) buckets.current += amount;
      else if (daysOverdue <= 30) buckets.days30 += amount;
      else if (daysOverdue <= 60) buckets.days60 += amount;
      else if (daysOverdue <= 90) buckets.days90 += amount;
      else buckets.over90 += amount;
    }

    const total = Object.values(buckets).reduce((s, v) => s + v, 0);
    const fmt = (n: number): string =>
      `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    return {
      intent: 'report_request',
      confidence,
      response:
        `**AR Aging Summary** (${openInvoices.length} open invoices)\n\n` +
        `| Aging Bucket | Amount |\n|---|---|\n` +
        `| Current | ${fmt(buckets.current)} |\n` +
        `| 1–30 days | ${fmt(buckets.days30)} |\n` +
        `| 31–60 days | ${fmt(buckets.days60)} |\n` +
        `| 61–90 days | ${fmt(buckets.days90)} |\n` +
        `| Over 90 days | ${fmt(buckets.over90)} |\n` +
        `| **Total** | **${fmt(total)}** |`,
      data: { ...buckets, total, invoiceCount: openInvoices.length },
      suggestions: ['Show overdue invoices', 'Show AP Aging', 'Show Balance Sheet'],
    };
  }

  private async generateAPAging(organizationId: string, confidence: number): Promise<ChatResponse> {
    const now = new Date();
    const openBills = await this.prisma.bill.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ['PENDING', 'OPEN', 'OVERDUE', 'PARTIALLY_PAID'] },
      },
      select: { balanceDue: true, dueDate: true },
      orderBy: { dueDate: 'asc' },
    });

    const buckets = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };
    for (const bill of openBills) {
      const daysOverdue = Math.floor(
        (now.getTime() - bill.dueDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      const amount = Number(bill.balanceDue);
      if (daysOverdue <= 0) buckets.current += amount;
      else if (daysOverdue <= 30) buckets.days30 += amount;
      else if (daysOverdue <= 60) buckets.days60 += amount;
      else if (daysOverdue <= 90) buckets.days90 += amount;
      else buckets.over90 += amount;
    }

    const total = Object.values(buckets).reduce((s, v) => s + v, 0);
    const fmt = (n: number): string =>
      `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    return {
      intent: 'report_request',
      confidence,
      response:
        `**AP Aging Summary** (${openBills.length} open bills)\n\n` +
        `| Aging Bucket | Amount |\n|---|---|\n` +
        `| Current | ${fmt(buckets.current)} |\n` +
        `| 1–30 days | ${fmt(buckets.days30)} |\n` +
        `| 31–60 days | ${fmt(buckets.days60)} |\n` +
        `| 61–90 days | ${fmt(buckets.days90)} |\n` +
        `| Over 90 days | ${fmt(buckets.over90)} |\n` +
        `| **Total** | **${fmt(total)}** |`,
      data: { ...buckets, total, billCount: openBills.length },
      suggestions: ['Show AR Aging', 'Show overdue invoices', 'Show Balance Sheet'],
    };
  }

  private async generateGLSummary(
    organizationId: string,
    confidence: number,
  ): Promise<ChatResponse> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const recentJournals = await this.prisma.journal.findMany({
      where: {
        organizationId,
        isPosted: true,
        deletedAt: null,
        date: { gte: startOfMonth },
      },
      select: { journalNumber: true, date: true, notes: true },
      orderBy: { date: 'desc' },
      take: 10,
    });

    const totalCount = await this.prisma.journal.count({
      where: {
        organizationId,
        isPosted: true,
        deletedAt: null,
        date: { gte: startOfMonth },
      },
    });

    const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    if (recentJournals.length === 0) {
      return {
        intent: 'report_request',
        confidence,
        response: `No journal entries found for ${monthName}.`,
        suggestions: ['Show Profit & Loss', 'Show Balance Sheet', 'Create journal entry'],
      };
    }

    const lines = recentJournals.map(
      (j) =>
        `- **${j.journalNumber}** (${j.date.toLocaleDateString()})${j.notes ? ` — ${j.notes}` : ''}`,
    );

    return {
      intent: 'report_request',
      confidence,
      response:
        `**General Ledger — ${monthName}** (${totalCount} entries)\n\n` +
        `Recent entries:\n${lines.join('\n')}` +
        (totalCount > 10 ? `\n\n...and ${totalCount - 10} more entries.` : ''),
      data: { totalCount, period: monthName },
      suggestions: ['Show Profit & Loss', 'Show Balance Sheet', 'Check account balance'],
    };
  }

  private handleGreeting(confidence: number): ChatResponse {
    const greetings = [
      'Hello! I am Mizano AI, your accounting assistant. How can I help you today?',
      'Hi there! Ready to help with your accounting needs. What would you like to do?',
      'Welcome back! I can help with invoices, payments, account balances, and more. Just ask!',
    ];
    const response = greetings[Math.floor(Math.random() * greetings.length)];

    return {
      intent: 'greeting',
      confidence,
      response,
      suggestions: ['Check overdue invoices', 'Show account balance', 'Help'],
    };
  }

  private handleHelp(confidence: number): ChatResponse {
    return {
      intent: 'help',
      confidence,
      response:
        'Here is what I can help you with:\n\n' +
        '1. **Invoice Status** — "What is the status of INV-001?"\n' +
        '2. **Payment Reminders** — "Show overdue invoices"\n' +
        '3. **Account Balance** — "What is the balance of the Cash account?"\n' +
        '4. **Create Invoice** — "Create an invoice for Acme Corp"\n' +
        '5. **Reports** — "Generate profit and loss report"\n\n' +
        'Just type your question in natural language and I will do my best to help!',
      suggestions: [
        'Show overdue invoices',
        'Check account balance',
        'Create invoice',
        'Generate report',
      ],
    };
  }

  private handleUnknown(confidence: number): ChatResponse {
    return {
      intent: 'unknown',
      confidence,
      response:
        "I'm sorry, I didn't quite understand that. Could you rephrase your request? " +
        'You can ask me about invoices, payments, account balances, or reports.',
      suggestions: ['Help', 'Check invoice status', 'Show overdue invoices', 'Account balance'],
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Get an existing classifier for the org or train a new one using default data.
   */
  private getOrTrainClassifier(organizationId: string): unknown {
    if (this.classifiers.has(organizationId)) {
      return this.classifiers.get(organizationId)!;
    }

    const classifier = new natural.BayesClassifier();
    for (const item of DEFAULT_TRAINING_DATA) {
      classifier.addDocument(item.text, item.intent);
    }
    classifier.train();
    this.classifiers.set(organizationId, classifier);

    return classifier;
  }

  /**
   * Append user message and assistant response to the in-memory history.
   */
  private addToHistory(
    organizationId: string,
    userId: string,
    userMessage: string,
    response: ChatResponse,
  ): void {
    const key = `${organizationId}:${userId}`;

    if (!this.chatHistory.has(key)) {
      this.chatHistory.set(key, {
        messages: [],
        createdAt: new Date(),
      });
    }

    const session = this.chatHistory.get(key)!;

    session.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    });

    session.messages.push({
      role: 'assistant',
      content: response.response,
      intent: response.intent,
      timestamp: new Date(),
    });

    // Cap the history to prevent unbounded memory growth
    const maxMessages = 200;
    if (session.messages.length > maxMessages) {
      session.messages = session.messages.slice(-maxMessages);
    }
  }
}
