import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ModelRegistryService } from './model-registry.service';
import { AiFeature } from '@prisma/client';
import { BoundedCache } from '../utils/bounded-cache.util';

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
  type: 'customer' | 'invoice_number' | 'amount' | 'account' | 'date';
  value: string;
  raw: string;
}

export interface ChatResponse {
  intent: ChatIntent;
  confidence: number;
  response: string;
  data?: Record<string, any>;
  suggestions: string[];
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
  private classifiers = new BoundedCache<any>(50, 60 * 60 * 1000);

  /** In-memory chat history: key = `${orgId}:${userId}` (bounded: max 200 sessions, 30min TTL) */
  private chatHistory = new BoundedCache<ChatSession>(200, 30 * 60 * 1000);

  constructor(
    private prisma: PrismaService,
    private modelRegistry: ModelRegistryService,
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
    this.logger.log(
      `Processing message for user ${userId} in org ${organizationId}`,
    );

    // Ensure the classifier is trained
    const classifier = await this.getOrTrainClassifier(organizationId);

    // Classify intent
    const classifications = classifier.getClassifications(
      message.toLowerCase(),
    );
    const topClassification = classifications[0];
    const intent: ChatIntent = topClassification
      ? (topClassification.label as ChatIntent)
      : 'unknown';
    const confidence: number = topClassification
      ? topClassification.value
      : 0;

    // Extract entities from the user message
    const entities = this.extractEntities(message);

    // Execute the appropriate intent handler
    let response: ChatResponse;

    switch (intent) {
      case 'invoice_status':
        response = await this.handleInvoiceStatus(
          organizationId,
          entities,
          confidence,
        );
        break;
      case 'account_balance':
        response = await this.handleAccountBalance(
          organizationId,
          entities,
          confidence,
        );
        break;
      case 'payment_reminder':
        response = await this.handlePaymentReminder(
          organizationId,
          entities,
          confidence,
        );
        break;
      case 'create_invoice':
        response = this.handleCreateInvoice(entities, confidence);
        break;
      case 'report_request':
        response = this.handleReportRequest(confidence);
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

    // Persist history
    this.addToHistory(organizationId, userId, message, response);

    return response;
  }

  /**
   * Retrieve recent chat history for a user.
   */
  getHistory(
    organizationId: string,
    userId: string,
    limit: number = 50,
  ): ChatMessage[] {
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
    this.logger.log(
      `Cleared chat history for user ${userId} in org ${organizationId}`,
    );
  }

  /**
   * Train (or retrain) the BayesClassifier for an organization.
   * Pulls training data from AiTrainingData where feature = CHATBOT,
   * falling back to the built-in default phrases when insufficient data exists.
   */
  async trainClassifier(
    organizationId: string,
  ): Promise<{ trained: boolean; sampleCount: number }> {
    this.logger.log(`Training chatbot classifier for org ${organizationId}`);

    const classifier = new natural.BayesClassifier();

    // Load org-specific training data
    const trainingRecords = await this.prisma.aiTrainingData.findMany({
      where: {
        organizationId,
        feature: AiFeature.CHATBOT,
      },
    });

    let sampleCount = trainingRecords.length;

    if (sampleCount >= 10) {
      // Use org-specific data
      for (const record of trainingRecords) {
        const input = record.inputData as { text?: string };
        const label = record.label;
        if (input?.text && label) {
          classifier.addDocument(input.text.toLowerCase(), label);
        }
      }
    } else {
      // Seed with defaults, then layer any existing org data on top
      for (const item of DEFAULT_TRAINING_DATA) {
        classifier.addDocument(item.text, item.intent);
      }
      for (const record of trainingRecords) {
        const input = record.inputData as { text?: string };
        const label = record.label;
        if (input?.text && label) {
          classifier.addDocument(input.text.toLowerCase(), label);
        }
      }
      sampleCount = DEFAULT_TRAINING_DATA.length + trainingRecords.length;
    }

    classifier.train();

    // Cache in memory
    this.classifiers.set(organizationId, classifier);

    // Persist model metadata via the registry
    try {
      await this.modelRegistry.saveModel(
        organizationId,
        AiFeature.CHATBOT,
        {
          type: 'BayesClassifier',
          trainedAt: new Date().toISOString(),
          sampleCount,
        },
        0.85, // Estimated accuracy for the Bayes classifier
        sampleCount,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to persist chatbot model metadata: ${error}`,
      );
    }

    this.logger.log(
      `Chatbot classifier trained with ${sampleCount} samples for org ${organizationId}`,
    );

    return { trained: true, sampleCount };
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

    // Dates via compromise
    const dates: string[] = doc.dates().out('array');
    for (const d of dates) {
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
        suggestions: [
          'Check invoice INV-001',
          'Show overdue invoices',
          'List recent invoices',
        ],
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
        suggestions: [
          'Show recent invoices',
          'Search by customer name',
          'Create new invoice',
        ],
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

    if (!accountEntity) {
      return {
        intent: 'account_balance',
        confidence,
        response:
          'Which account would you like to check? You can say something like "What is the balance of account Cash?"',
        suggestions: [
          'Balance of Cash account',
          'Balance of Accounts Receivable',
          'Show all accounts',
        ],
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
        suggestions: [
          'Show all accounts',
          'Balance of Cash',
          'Balance of Accounts Receivable',
        ],
      };
    }

    return {
      intent: 'account_balance',
      confidence,
      response: `The balance of **${account.name}** (${account.code}) is $${Number(account.openingBalance).toLocaleString()}. Account type: ${account.type}.`,
      data: {
        accountId: account.id,
        accountName: account.name,
        accountCode: account.code,
        balance: Number(account.openingBalance),
        type: account.type,
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
    const where: Record<string, any> = {
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
      const qualifier = customerEntity
        ? ` for ${customerEntity.value}`
        : '';
      return {
        intent: 'payment_reminder',
        confidence,
        response: `Great news! There are no overdue invoices${qualifier}.`,
        suggestions: [
          'Show all invoices',
          'Check account balance',
          'Generate aging report',
        ],
      };
    }

    const totalOverdue = overdueInvoices.reduce(
      (sum, inv) => sum + Number(inv.balanceDue),
      0,
    );

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
      suggestions: [
        'Send payment reminders',
        'Generate AR aging report',
        'Check specific invoice',
      ],
    };
  }

  private handleCreateInvoice(
    entities: ChatEntity[],
    confidence: number,
  ): ChatResponse {
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
      suggestions: [
        'Go to create invoice page',
        'Show recent invoices',
        'List customers',
      ],
    };
  }

  private handleReportRequest(confidence: number): ChatResponse {
    return {
      intent: 'report_request',
      confidence,
      response:
        'I can help you access reports. Which report would you like to see?\n\n' +
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
      suggestions: [
        'Check overdue invoices',
        'Show account balance',
        'Help',
      ],
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
      suggestions: [
        'Help',
        'Check invoice status',
        'Show overdue invoices',
        'Account balance',
      ],
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Get an existing classifier for the org or train a new one.
   */
  private async getOrTrainClassifier(organizationId: string): Promise<any> {
    if (this.classifiers.has(organizationId)) {
      return this.classifiers.get(organizationId)!;
    }

    await this.trainClassifier(organizationId);
    return this.classifiers.get(organizationId)!;
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
