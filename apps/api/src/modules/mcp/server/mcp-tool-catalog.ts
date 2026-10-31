import { McpScope } from '../mcp.config';
import { McpPrincipal } from '../oauth/mcp-oauth.service';
import { Args, McpToolsService, ToolAnswer } from './mcp-tools.service';

type JsonSchema = Record<string, unknown>;

export interface McpToolDef {
  name: string;
  title: string;
  description: string;
  input: JsonSchema;
  scope: McpScope;
  /** The permission the equivalent web route requires; all must hold. */
  permissions: string[];
  /** Reads only (readOnlyHint). Drafts add records but never change or remove existing ones. */
  readOnly: boolean;
  run: (
    tools: McpToolsService,
    p: McpPrincipal,
    args: Args,
    can: (perm: string) => Promise<boolean>,
  ) => Promise<ToolAnswer>;
}

const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'YYYY-MM-DD' };
const MONEY = {
  type: 'string',
  pattern: '^\\d{1,15}(\\.\\d{1,4})?$',
  description: 'Decimal string, at most 4 decimals, e.g. "1250.50"',
};
const PERCENT = {
  type: 'string',
  pattern: '^\\d{1,3}(\\.\\d{1,2})?$',
  description: 'Percent as a decimal string: "14" means 14%',
};
const ID = { type: 'string', minLength: 1, maxLength: 64 };
const LIMIT = { type: 'integer', minimum: 1, maximum: 50 };
const QUERY = {
  type: 'string',
  minLength: 1,
  maxLength: 100,
  description: 'Part of the name (Arabic or English), email, phone or code',
};

function object(properties: Record<string, unknown>, required: string[] = []): JsonSchema {
  return { type: 'object', properties, required, additionalProperties: false };
}

const SALES_LINE = object(
  {
    itemId: { ...ID, description: 'From find_items (optional)' },
    description: { type: 'string', minLength: 1, maxLength: 500 },
    quantity: MONEY,
    rate: { ...MONEY, description: 'Unit price before tax, decimal string' },
    discount: { ...PERCENT, description: 'Line discount percent (optional)' },
    taxRate: PERCENT,
  },
  ['description', 'quantity', 'rate'],
);

const BILL_LINE = object(
  {
    itemId: { ...ID, description: 'From find_items (optional)' },
    accountId: { ...ID, description: 'Expense account from expense_account_options (optional)' },
    description: { type: 'string', maxLength: 500 },
    quantity: MONEY,
    rate: { ...MONEY, description: 'Unit cost before tax, decimal string' },
    taxRate: PERCENT,
  },
  ['quantity', 'rate'],
);

const LINES = (line: JsonSchema): JsonSchema => ({
  type: 'array',
  minItems: 1,
  maxItems: 100,
  items: line,
});

const PERIOD = object({
  startDate: { ...DATE, description: 'First day (default: 1 January of the end date year)' },
  endDate: { ...DATE, description: 'Last day (default: today)' },
});

const DRAFT_NOTE =
  ' Saved as a DRAFT only: nothing is posted, sent, paid or deleted. Returns a link where a person reviews and posts it in Mizano.';

/** The tools an AI app sees. Amounts in and out are decimal strings, never numbers. */
export const MCP_TOOLS: McpToolDef[] = [
  {
    name: 'find_customers',
    title: 'Find customers',
    description:
      'Search customers by name (Arabic spelling variants match), email or phone. Returns ids, contact details and the open balance.',
    input: object({ query: QUERY, limit: LIMIT }, ['query']),
    scope: 'mizano:read',
    permissions: ['sales.view'],
    readOnly: true,
    run: (t, p, a) => t.findCustomers(p, a),
  },
  {
    name: 'find_vendors',
    title: 'Find vendors',
    description:
      'Search vendors (suppliers) by name, email or phone. Arabic spelling variants match.',
    input: object({ query: QUERY, limit: LIMIT }, ['query']),
    scope: 'mizano:read',
    permissions: ['purchases.view'],
    readOnly: true,
    run: (t, p, a) => t.findVendors(p, a),
  },
  {
    name: 'find_items',
    title: 'Find items',
    description:
      'Search products and services by name or SKU. Returns prices and the default tax percent.',
    input: object({ query: QUERY, limit: LIMIT }, ['query']),
    scope: 'mizano:read',
    permissions: ['inventory.view'],
    readOnly: true,
    run: (t, p, a) => t.findItems(p, a),
  },
  {
    name: 'list_invoices',
    title: 'List sales invoices',
    description:
      'Sales invoices by status: unpaid (default), overdue, draft, paid or all. Gives the count, totals and the first rows.',
    input: object({
      status: { type: 'string', enum: ['unpaid', 'overdue', 'draft', 'paid', 'all'] },
      customerId: { ...ID, description: 'From find_customers (optional)' },
      limit: LIMIT,
    }),
    scope: 'mizano:read',
    permissions: ['sales.view'],
    readOnly: true,
    run: (t, p, a) => t.listInvoices(p, a),
  },
  {
    name: 'get_invoice',
    title: 'Invoice details',
    description: 'One sales invoice with its lines, totals, amount paid and balance due.',
    input: object({ invoice: { ...ID, description: 'Invoice id or number, e.g. INV-0012' } }, [
      'invoice',
    ]),
    scope: 'mizano:read',
    permissions: ['sales.view'],
    readOnly: true,
    run: (t, p, a) => t.getInvoice(p, a),
  },
  {
    name: 'list_bills',
    title: 'List purchase bills',
    description: 'Purchase bills by status: unpaid (default), overdue, draft, paid or all.',
    input: object({
      status: { type: 'string', enum: ['unpaid', 'overdue', 'draft', 'paid', 'all'] },
      vendorId: { ...ID, description: 'From find_vendors (optional)' },
      limit: LIMIT,
    }),
    scope: 'mizano:read',
    permissions: ['purchases.view'],
    readOnly: true,
    run: (t, p, a) => t.listBills(p, a),
  },
  {
    name: 'get_bill',
    title: 'Bill details',
    description: 'One purchase bill with its lines, totals, amount paid and balance due.',
    input: object({ bill: { ...ID, description: 'Bill id or number' } }, ['bill']),
    scope: 'mizano:read',
    permissions: ['purchases.view'],
    readOnly: true,
    run: (t, p, a) => t.getBill(p, a),
  },
  {
    name: 'receivables_aging',
    title: 'Receivables aging',
    description:
      'What customers owe, by age bucket (current, 1-30, 31-60, 61-90, over 90 days), from the posted ledger.',
    input: object({ asOfDate: { ...DATE, description: 'Default: today' } }),
    scope: 'mizano:read',
    permissions: ['reports.view'],
    readOnly: true,
    run: (t, p, a) => t.receivablesAging(p, a),
  },
  {
    name: 'payables_aging',
    title: 'Payables aging',
    description: 'What the business owes vendors, by age bucket, from the posted ledger.',
    input: object({ asOfDate: { ...DATE, description: 'Default: today' } }),
    scope: 'mizano:read',
    permissions: ['reports.view'],
    readOnly: true,
    run: (t, p, a) => t.payablesAging(p, a),
  },
  {
    name: 'profit_and_loss',
    title: 'Profit and loss',
    description:
      'Revenue, costs, expenses and net profit for a period, with the amount per account.',
    input: PERIOD,
    scope: 'mizano:read',
    permissions: ['reports.view'],
    readOnly: true,
    run: (t, p, a) => t.profitAndLoss(p, a),
  },
  {
    name: 'balance_sheet',
    title: 'Balance sheet',
    description: 'Assets, liabilities and equity totals as of a date.',
    input: object({ asOfDate: { ...DATE, description: 'Default: today' } }),
    scope: 'mizano:read',
    permissions: ['reports.view'],
    readOnly: true,
    run: (t, p, a) => t.balanceSheet(p, a),
  },
  {
    name: 'cash_summary',
    title: 'Cash summary',
    description:
      'Opening cash, cash from operations, investing and financing, and closing cash for a period.',
    input: PERIOD,
    scope: 'mizano:read',
    permissions: ['reports.view'],
    readOnly: true,
    run: (t, p, a) => t.cashSummary(p, a),
  },
  {
    name: 'vat_summary',
    title: 'VAT summary',
    description:
      'VAT collected on sales, VAT paid on purchases and the net payable or refundable for a period (default: this month).',
    input: PERIOD,
    scope: 'mizano:read',
    permissions: ['tax.view'],
    readOnly: true,
    run: (t, p, a) => t.vatSummary(p, a),
  },
  {
    name: 'recent_payments',
    title: 'Recent payments',
    description: 'Latest payments received from customers and paid to vendors.',
    input: object({
      direction: { type: 'string', enum: ['received', 'made', 'both'] },
      since: { ...DATE, description: 'Only payments on or after this day (optional)' },
      limit: LIMIT,
    }),
    scope: 'mizano:read',
    permissions: [],
    readOnly: true,
    // Each side needs its own module's view permission; at least one must hold.
    run: async (t, p, a, can) => {
      const [received, made] = await Promise.all([can('sales.view'), can('purchases.view')]);
      if (!received && !made) throw new MissingPermission('sales.view');
      return t.recentPayments(p, a, received, made);
    },
  },
  {
    name: 'expense_account_options',
    title: 'Accounts for expenses and bills',
    description:
      'Expense accounts (for bill lines and expenses) and the bank or cash accounts an expense can be paid from. Use before draft_expense.',
    input: object({}),
    scope: 'mizano:read',
    permissions: ['purchases.create'],
    readOnly: true,
    run: (t, p) => t.expenseAccountOptions(p),
  },
  {
    name: 'draft_quote',
    title: 'Prepare a quote',
    description: `Prepare a sales quote for a customer from what the user describes.${DRAFT_NOTE}`,
    input: object(
      {
        customerId: { ...ID, description: 'From find_customers' },
        date: { ...DATE, description: 'Default: today' },
        expiryDate: { ...DATE, description: 'Default: 30 days after the date' },
        lines: LINES(SALES_LINE),
        notes: { type: 'string', maxLength: 2000 },
        terms: { type: 'string', maxLength: 2000 },
      },
      ['customerId', 'lines'],
    ),
    scope: 'mizano:drafts',
    permissions: ['sales.create'],
    readOnly: false,
    run: (t, p, a) => t.draftQuote(p, a),
  },
  {
    name: 'draft_invoice',
    title: 'Prepare an invoice',
    description: `Prepare a sales invoice for a customer from what the user describes.${DRAFT_NOTE}`,
    input: object(
      {
        customerId: { ...ID, description: 'From find_customers' },
        date: { ...DATE, description: 'Default: today' },
        dueDate: { ...DATE, description: 'Default: 30 days after the date' },
        lines: LINES(SALES_LINE),
        reference: {
          type: 'string',
          maxLength: 100,
          description: "The customer's reference, such as a purchase order number",
        },
        notes: { type: 'string', maxLength: 2000 },
        terms: { type: 'string', maxLength: 2000 },
      },
      ['customerId', 'lines'],
    ),
    scope: 'mizano:drafts',
    permissions: ['sales.create'],
    readOnly: false,
    run: (t, p, a) => t.draftInvoice(p, a),
  },
  {
    name: 'draft_bill',
    title: 'Prepare a bill',
    description: `Prepare a purchase bill from a vendor from what the user describes.${DRAFT_NOTE}`,
    input: object(
      {
        vendorId: { ...ID, description: 'From find_vendors' },
        billNumber: {
          type: 'string',
          maxLength: 100,
          description: "The vendor's bill number (optional)",
        },
        date: { ...DATE, description: 'Default: today' },
        dueDate: { ...DATE, description: 'Default: 30 days after the date' },
        reference: { type: 'string', maxLength: 200 },
        notes: { type: 'string', maxLength: 2000 },
        lines: LINES(BILL_LINE),
      },
      ['vendorId', 'lines'],
    ),
    scope: 'mizano:drafts',
    permissions: ['purchases.create'],
    readOnly: false,
    run: (t, p, a) => t.draftBill(p, a),
  },
  {
    name: 'draft_expense',
    title: 'Prepare an expense',
    description: `Prepare an expense paid from a bank or cash account (ids from expense_account_options).${DRAFT_NOTE}`,
    input: object(
      {
        accountId: { ...ID, description: 'Expense account id' },
        paidThroughAccountId: { ...ID, description: 'Bank or cash account id' },
        amount: MONEY,
        taxRate: PERCENT,
        taxInclusive: { type: 'boolean', description: 'true when the amount already includes VAT' },
        date: { ...DATE, description: 'Default: today' },
        vendorId: { ...ID, description: 'From find_vendors (optional)' },
        description: { type: 'string', maxLength: 500 },
        reference: { type: 'string', maxLength: 200 },
      },
      ['accountId', 'paidThroughAccountId', 'amount'],
    ),
    scope: 'mizano:drafts',
    permissions: ['purchases.create'],
    readOnly: false,
    run: (t, p, a) => t.draftExpense(p, a),
  },
];

/** Raised by a tool whose permission check depends on its arguments. */
export class MissingPermission extends Error {
  constructor(readonly permission: string) {
    super(`Missing permission: ${permission}`);
  }
}
