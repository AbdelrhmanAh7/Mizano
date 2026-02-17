import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nlp = require('compromise');

/**
 * CRUD actions derived from voice commands.
 */
export type VoiceAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';

/**
 * Entity types that voice commands can target.
 */
export type VoiceEntityType =
  | 'invoice'
  | 'bill'
  | 'customer'
  | 'vendor'
  | 'payment'
  | 'report'
  | 'account';

export interface ParsedCommand {
  action: VoiceAction;
  entityType: VoiceEntityType | null;
  parameters: Record<string, any>;
  confidence: number;
  originalText: string;
}

export interface CommandExecutionResult {
  success: boolean;
  action: VoiceAction;
  data?: Record<string, any>;
  message: string;
  requiresConfirmation?: boolean;
}

export interface AvailableCommand {
  pattern: string;
  action: VoiceAction;
  entityType: VoiceEntityType;
  example: string;
}

/**
 * Verb-to-action mapping.
 * Each array value lists verbs (lemmatised or base forms) that map to a CRUD action.
 */
const VERB_ACTION_MAP: Record<VoiceAction, string[]> = {
  CREATE: ['create', 'make', 'add', 'generate', 'draft', 'new', 'build'],
  READ: [
    'show',
    'get',
    'find',
    'list',
    'check',
    'view',
    'display',
    'look',
    'search',
    'what',
    'fetch',
  ],
  UPDATE: ['update', 'edit', 'change', 'modify', 'set', 'adjust', 'correct'],
  DELETE: ['delete', 'remove', 'cancel', 'void', 'discard'],
};

/**
 * Noun-to-entity-type mapping.
 */
const NOUN_ENTITY_MAP: Record<VoiceEntityType, string[]> = {
  invoice: ['invoice', 'invoices', 'inv', 'bill of sale'],
  bill: ['bill', 'bills', 'expense', 'expenses'],
  customer: ['customer', 'customers', 'client', 'clients', 'buyer'],
  vendor: ['vendor', 'vendors', 'supplier', 'suppliers'],
  payment: ['payment', 'payments', 'pay', 'remittance'],
  report: ['report', 'reports', 'statement', 'summary', 'p&l', 'balance sheet', 'aging'],
  account: ['account', 'accounts', 'ledger', 'balance'],
};

@Injectable()
export class VoiceCommandService {
  private readonly logger = new Logger(VoiceCommandService.name);

  constructor(private prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Parse a natural-language voice command into a structured command object.
   * Uses compromise for NLP extraction and pattern matching for entity details.
   */
  parseCommand(text: string): ParsedCommand {
    this.logger.log(`Parsing voice command: "${text}"`);

    const doc = nlp(text);
    const lowerText = text.toLowerCase();

    // --- Determine action from verbs ---
    const verbs: string[] = doc.verbs().toInfinitive().out('array');
    const action = this.resolveAction(verbs, lowerText);

    // --- Determine entity type from nouns ---
    const nouns: string[] = doc.nouns().out('array');
    const entityType = this.resolveEntityType(nouns, lowerText);

    // --- Extract parameters ---
    const parameters = this.extractParameters(doc, text, entityType);

    // --- Calculate confidence ---
    let confidence = 0.5;
    if (action !== 'READ') confidence += 0.15; // Non-default action detected
    if (entityType) confidence += 0.2;
    if (Object.keys(parameters).length > 0) confidence += 0.15;
    confidence = Math.min(confidence, 1);

    return {
      action,
      entityType,
      parameters,
      confidence: Math.round(confidence * 1000) / 1000,
      originalText: text,
    };
  }

  /**
   * Execute a parsed command against the database.
   * READ actions return data; CREATE actions return a confirmation prompt
   * (human-in-the-loop: never auto-create financial records).
   */
  async executeCommand(
    organizationId: string,
    parsedCommand: ParsedCommand,
  ): Promise<CommandExecutionResult> {
    this.logger.log(
      `Executing command: ${parsedCommand.action} ${parsedCommand.entityType} in org ${organizationId}`,
    );

    const { action, entityType, parameters } = parsedCommand;

    if (!entityType) {
      return {
        success: false,
        action,
        message:
          'I could not determine what you are referring to. Please specify an entity such as invoice, customer, account, or report.',
      };
    }

    switch (action) {
      case 'READ':
        return this.executeRead(organizationId, entityType, parameters);
      case 'CREATE':
        return this.executeCreate(entityType, parameters);
      case 'UPDATE':
        return {
          success: false,
          action,
          message: `Updating ${entityType} records via voice commands is not supported yet. Please use the ${entityType} editing page.`,
          requiresConfirmation: false,
        };
      case 'DELETE':
        return {
          success: false,
          action,
          message: `Deleting ${entityType} records via voice commands is not allowed for safety. Please use the application interface.`,
          requiresConfirmation: false,
        };
      default:
        return {
          success: false,
          action,
          message: 'Unrecognised action. Please try rephrasing your command.',
        };
    }
  }

  /**
   * Return the list of supported voice command patterns and examples.
   */
  getAvailableCommands(): { commands: AvailableCommand[] } {
    return {
      commands: [
        {
          pattern: 'Create invoice for [customer]',
          action: 'CREATE',
          entityType: 'invoice',
          example: 'Create an invoice for Acme Corp',
        },
        {
          pattern: 'Show invoice [number]',
          action: 'READ',
          entityType: 'invoice',
          example: 'Show invoice INV-001',
        },
        {
          pattern: 'Show overdue invoices',
          action: 'READ',
          entityType: 'invoice',
          example: 'Show overdue invoices',
        },
        {
          pattern: "What's the balance of [account]",
          action: 'READ',
          entityType: 'account',
          example: "What's the balance of Cash?",
        },
        {
          pattern: 'Find customer [name]',
          action: 'READ',
          entityType: 'customer',
          example: 'Find customer John Smith',
        },
        {
          pattern: 'List all vendors',
          action: 'READ',
          entityType: 'vendor',
          example: 'List all vendors',
        },
        {
          pattern: 'Generate [report type] report',
          action: 'READ',
          entityType: 'report',
          example: 'Generate P&L report',
        },
        {
          pattern: 'Create bill for [vendor]',
          action: 'CREATE',
          entityType: 'bill',
          example: 'Create a bill for Office Supplies Inc',
        },
        {
          pattern: 'Show recent payments',
          action: 'READ',
          entityType: 'payment',
          example: 'Show recent payments',
        },
      ],
    };
  }

  // ---------------------------------------------------------------------------
  // Action & entity resolution
  // ---------------------------------------------------------------------------

  /**
   * Map extracted verbs (and raw text) to a CRUD action.
   * Falls back to READ when no clear verb is detected.
   */
  private resolveAction(verbs: string[], lowerText: string): VoiceAction {
    // Check each verb against the action map
    for (const verb of verbs) {
      const normalised = verb.toLowerCase().trim();
      for (const [action, keywords] of Object.entries(VERB_ACTION_MAP)) {
        if (keywords.some((kw) => normalised.includes(kw))) {
          return action as VoiceAction;
        }
      }
    }

    // Fallback: scan full text for action keywords
    for (const [action, keywords] of Object.entries(VERB_ACTION_MAP)) {
      if (keywords.some((kw) => lowerText.includes(kw))) {
        return action as VoiceAction;
      }
    }

    // Default to READ (most common voice query intent)
    return 'READ';
  }

  /**
   * Map extracted nouns (and raw text) to an entity type.
   */
  private resolveEntityType(nouns: string[], lowerText: string): VoiceEntityType | null {
    // Check nouns first
    for (const noun of nouns) {
      const normalised = noun.toLowerCase().trim();
      for (const [entityType, keywords] of Object.entries(NOUN_ENTITY_MAP)) {
        if (keywords.some((kw) => normalised.includes(kw))) {
          return entityType as VoiceEntityType;
        }
      }
    }

    // Fallback: scan full text
    for (const [entityType, keywords] of Object.entries(NOUN_ENTITY_MAP)) {
      if (keywords.some((kw) => lowerText.includes(kw))) {
        return entityType as VoiceEntityType;
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Parameter extraction
  // ---------------------------------------------------------------------------

  /**
   * Extract structured parameters from the voice text using compromise + regex.
   */
  private extractParameters(
    doc: any,
    text: string,
    entityType: VoiceEntityType | null,
  ): Record<string, any> {
    const params: Record<string, any> = {};

    // Invoice number: INV-XXX pattern
    const invoicePattern = /\bINV[-\s]?(\d{1,6})\b/gi;
    const invoiceMatch = invoicePattern.exec(text);
    if (invoiceMatch) {
      params.invoiceNumber = `INV-${invoiceMatch[1].padStart(3, '0')}`;
    }

    // Money amounts via compromise
    const moneyValues: string[] = doc.money().out('array');
    if (moneyValues.length > 0) {
      const raw = moneyValues[0];
      const numeric = parseFloat(raw.replace(/[^0-9.]/g, ''));
      if (!isNaN(numeric)) {
        params.amount = numeric;
      }
    }

    // Extract dates via regex instead of compromise plugin (compromise core has no .dates())
    const dateRegex =
      /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s*\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b/gi;
    const dateMatches = text.match(dateRegex) || [];
    if (dateMatches.length > 0) {
      params.date = dateMatches[0];
    }

    // People / organisation names via compromise
    const people: string[] = doc.people().out('array');
    const orgs: string[] = doc.organizations().out('array');
    const names = [...people, ...orgs];

    if (names.length > 0) {
      params.name = names[0];
      // Also assign to customerName / vendorName based on entity type
      if (entityType === 'invoice' || entityType === 'customer') {
        params.customerName = names[0];
      } else if (entityType === 'bill' || entityType === 'vendor') {
        params.vendorName = names[0];
      }
    }

    // Account name: "balance of <account name>"
    const accountNamePattern =
      /(?:balance\s+of|account\s+(?:called|named)?)\s+["']?([A-Za-z\s]+?)["']?(?:\s*$|\s*\?)/gi;
    const accountMatch = accountNamePattern.exec(text);
    if (accountMatch) {
      params.accountName = accountMatch[1].trim();
    }

    // Filter keywords (overdue, draft, paid, etc.)
    const lowerText = text.toLowerCase();
    if (lowerText.includes('overdue')) {
      params.filter = 'overdue';
    } else if (lowerText.includes('draft')) {
      params.filter = 'draft';
    } else if (lowerText.includes('paid')) {
      params.filter = 'paid';
    } else if (lowerText.includes('recent')) {
      params.filter = 'recent';
    }

    // Report type detection
    if (entityType === 'report') {
      if (lowerText.includes('p&l') || lowerText.includes('profit')) {
        params.reportType = 'pl';
      } else if (lowerText.includes('balance sheet')) {
        params.reportType = 'balance_sheet';
      } else if (lowerText.includes('aging') || lowerText.includes('ar')) {
        params.reportType = 'ar_aging';
      } else if (lowerText.includes('cash flow')) {
        params.reportType = 'cash_flow';
      } else if (lowerText.includes('general ledger') || lowerText.includes('gl')) {
        params.reportType = 'general_ledger';
      }
    }

    return params;
  }

  // ---------------------------------------------------------------------------
  // Command execution
  // ---------------------------------------------------------------------------

  /**
   * Execute a READ action by querying Prisma and returning matching records.
   */
  private async executeRead(
    organizationId: string,
    entityType: VoiceEntityType,
    parameters: Record<string, any>,
  ): Promise<CommandExecutionResult> {
    switch (entityType) {
      case 'invoice':
        return this.readInvoice(organizationId, parameters);
      case 'customer':
        return this.readCustomer(organizationId, parameters);
      case 'account':
        return this.readAccount(organizationId, parameters);
      case 'vendor':
        return this.readVendor(organizationId, parameters);
      case 'report':
        return this.readReport(parameters);
      case 'bill':
        return this.readBill(organizationId, parameters);
      case 'payment':
        return this.readPayment(organizationId, parameters);
      default:
        return {
          success: false,
          action: 'READ',
          message: `Reading ${entityType} is not supported yet.`,
        };
    }
  }

  private async readInvoice(
    organizationId: string,
    parameters: Record<string, any>,
  ): Promise<CommandExecutionResult> {
    // Single invoice lookup by number
    if (parameters.invoiceNumber) {
      const invoice = await this.prisma.invoice.findFirst({
        where: {
          organizationId,
          invoiceNumber: parameters.invoiceNumber,
          deletedAt: null,
        },
        include: { customer: { select: { name: true } } },
      });

      if (!invoice) {
        return {
          success: false,
          action: 'READ',
          message: `Invoice ${parameters.invoiceNumber} was not found.`,
        };
      }

      return {
        success: true,
        action: 'READ',
        data: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customer.name,
          status: invoice.status,
          grandTotal: Number(invoice.grandTotal),
          dueDate: invoice.dueDate,
        },
        message: `Invoice ${invoice.invoiceNumber} for ${invoice.customer.name}: status ${invoice.status}, total $${Number(invoice.grandTotal).toLocaleString()}.`,
      };
    }

    // Filtered list (e.g. overdue invoices)
    const where: Record<string, any> = {
      organizationId,
      deletedAt: null,
    };

    if (parameters.filter === 'overdue') {
      where.status = 'OVERDUE';
    } else if (parameters.filter === 'draft') {
      where.status = 'DRAFT';
    } else if (parameters.filter === 'paid') {
      where.status = 'PAID';
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const filterLabel = parameters.filter ?? 'recent';

    return {
      success: true,
      action: 'READ',
      data: {
        invoices: invoices.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          customerName: inv.customer.name,
          status: inv.status,
          grandTotal: Number(inv.grandTotal),
          dueDate: inv.dueDate,
        })),
        count: invoices.length,
      },
      message: `Found ${invoices.length} ${filterLabel} invoices.`,
    };
  }

  private async readCustomer(
    organizationId: string,
    parameters: Record<string, any>,
  ): Promise<CommandExecutionResult> {
    const where: Record<string, any> = { organizationId };

    if (parameters.name || parameters.customerName) {
      const searchName = parameters.name || parameters.customerName;
      where.name = { contains: searchName, mode: 'insensitive' };
    }

    const customers = await this.prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 10,
    });

    if (customers.length === 0) {
      return {
        success: false,
        action: 'READ',
        message: parameters.name
          ? `No customer found matching "${parameters.name}".`
          : 'No customers found.',
      };
    }

    return {
      success: true,
      action: 'READ',
      data: {
        customers: customers.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
        })),
        count: customers.length,
      },
      message: `Found ${customers.length} customer(s).`,
    };
  }

  private async readAccount(
    organizationId: string,
    parameters: Record<string, any>,
  ): Promise<CommandExecutionResult> {
    if (parameters.accountName) {
      const account = await this.prisma.account.findFirst({
        where: {
          organizationId,
          isActive: true,
          OR: [
            { name: { contains: parameters.accountName, mode: 'insensitive' } },
            { code: { equals: parameters.accountName, mode: 'insensitive' } },
          ],
        },
      });

      if (!account) {
        return {
          success: false,
          action: 'READ',
          message: `No account found matching "${parameters.accountName}".`,
        };
      }

      return {
        success: true,
        action: 'READ',
        data: {
          id: account.id,
          name: account.name,
          code: account.code,
          type: account.type,
          balance: Number(account.openingBalance),
        },
        message: `Account ${account.name} (${account.code}): balance $${Number(account.openingBalance).toLocaleString()}, type ${account.type}.`,
      };
    }

    // List accounts
    const accounts = await this.prisma.account.findMany({
      where: { organizationId, isActive: true },
      orderBy: { code: 'asc' },
      take: 10,
    });

    return {
      success: true,
      action: 'READ',
      data: {
        accounts: accounts.map((a) => ({
          id: a.id,
          name: a.name,
          code: a.code,
          type: a.type,
          balance: Number(a.openingBalance),
        })),
        count: accounts.length,
      },
      message: `Found ${accounts.length} active accounts.`,
    };
  }

  private async readVendor(
    organizationId: string,
    parameters: Record<string, any>,
  ): Promise<CommandExecutionResult> {
    const where: Record<string, any> = { organizationId };

    if (parameters.name || parameters.vendorName) {
      const searchName = parameters.name || parameters.vendorName;
      where.name = { contains: searchName, mode: 'insensitive' };
    }

    const vendors = await this.prisma.vendor.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 10,
    });

    if (vendors.length === 0) {
      return {
        success: false,
        action: 'READ',
        message: parameters.name
          ? `No vendor found matching "${parameters.name}".`
          : 'No vendors found.',
      };
    }

    return {
      success: true,
      action: 'READ',
      data: {
        vendors: vendors.map((v) => ({
          id: v.id,
          name: v.name,
          email: (v as any).email ?? null,
        })),
        count: vendors.length,
      },
      message: `Found ${vendors.length} vendor(s).`,
    };
  }

  private readReport(parameters: Record<string, any>): CommandExecutionResult {
    const reportType = parameters.reportType ?? 'unknown';
    const reportNames: Record<string, string> = {
      pl: 'Profit & Loss',
      balance_sheet: 'Balance Sheet',
      ar_aging: 'AR Aging',
      cash_flow: 'Cash Flow Statement',
      general_ledger: 'General Ledger',
    };

    const reportName = reportNames[reportType];

    if (!reportName) {
      return {
        success: true,
        action: 'READ',
        data: {
          availableReports: Object.values(reportNames),
        },
        message:
          'Which report would you like? Available: Profit & Loss, Balance Sheet, AR Aging, Cash Flow Statement, General Ledger.',
      };
    }

    return {
      success: true,
      action: 'READ',
      data: {
        reportType,
        reportName,
        navigateTo: `/reports/${reportType.replace('_', '-')}`,
      },
      message: `To view the ${reportName} report, please navigate to Reports > ${reportName}.`,
    };
  }

  private async readBill(
    organizationId: string,
    parameters: Record<string, any>,
  ): Promise<CommandExecutionResult> {
    const where: Record<string, any> = {
      organizationId,
      deletedAt: null,
    };

    if (parameters.filter === 'overdue') {
      where.status = 'OVERDUE';
    } else if (parameters.filter === 'draft') {
      where.status = 'DRAFT';
    } else if (parameters.filter === 'paid') {
      where.status = 'PAID';
    }

    const bills = await this.prisma.bill.findMany({
      where,
      include: { vendor: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const filterLabel = parameters.filter ?? 'recent';

    return {
      success: true,
      action: 'READ',
      data: {
        bills: bills.map((b) => ({
          id: b.id,
          billNumber: b.billNumber,
          vendorName: b.vendor.name,
          status: b.status,
          grandTotal: Number(b.grandTotal),
        })),
        count: bills.length,
      },
      message: `Found ${bills.length} ${filterLabel} bills.`,
    };
  }

  private async readPayment(
    organizationId: string,
    _parameters: Record<string, any>,
  ): Promise<CommandExecutionResult> {
    const payments = await this.prisma.paymentReceived.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      include: { customer: { select: { name: true } } },
      orderBy: { date: 'desc' },
      take: 10,
    });

    return {
      success: true,
      action: 'READ',
      data: {
        payments: payments.map((p) => ({
          id: p.id,
          paymentNumber: p.paymentNumber,
          customerName: p.customer.name,
          amount: Number(p.amount),
          date: p.date,
        })),
        count: payments.length,
      },
      message: `Found ${payments.length} recent payments received.`,
    };
  }

  /**
   * Handle CREATE actions by preparing confirmation data.
   * Never auto-creates financial records (human-in-the-loop).
   */
  private executeCreate(
    entityType: VoiceEntityType,
    parameters: Record<string, any>,
  ): CommandExecutionResult {
    switch (entityType) {
      case 'invoice':
        return {
          success: true,
          action: 'CREATE',
          data: {
            entityType: 'invoice',
            customerName: parameters.customerName ?? null,
            amount: parameters.amount ?? null,
            date: parameters.date ?? null,
            navigateTo: '/sales/invoices/new',
          },
          message: parameters.customerName
            ? `Ready to create an invoice for ${parameters.customerName}. Please confirm on the invoice creation page.`
            : 'Ready to create a new invoice. Please provide the customer details on the invoice creation page.',
          requiresConfirmation: true,
        };

      case 'bill':
        return {
          success: true,
          action: 'CREATE',
          data: {
            entityType: 'bill',
            vendorName: parameters.vendorName ?? null,
            amount: parameters.amount ?? null,
            date: parameters.date ?? null,
            navigateTo: '/purchases/bills/new',
          },
          message: parameters.vendorName
            ? `Ready to create a bill for ${parameters.vendorName}. Please confirm on the bill creation page.`
            : 'Ready to create a new bill. Please provide the vendor details on the bill creation page.',
          requiresConfirmation: true,
        };

      default:
        return {
          success: false,
          action: 'CREATE',
          message: `Creating ${entityType} via voice commands is not supported yet. Please use the application interface.`,
          requiresConfirmation: false,
        };
    }
  }
}
