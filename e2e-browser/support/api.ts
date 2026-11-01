import { API_URL } from '../env';
import type { Account } from './account';

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** The API answers either `{ data }` or the bare object. */
const unwrap = <T>(body: unknown): T => ((body as { data?: unknown })?.data ?? body) as T;

async function call<T>(account: Account, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.accessToken}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return unwrap<T>(text ? JSON.parse(text) : {});
}

type Row = { id: string; [key: string]: unknown };

export type Line = {
  description: string;
  quantity: string;
  rate: string;
  taxRate?: string;
  discount?: string;
};
export async function createInvoice(
  a: Account,
  customerId: string,
  lines: Line[],
  send = true,
  date = today(),
): Promise<Row> {
  const invoice = await call<Row>(a, 'POST', '/invoices', {
    customerId,
    date,
    dueDate: inDays(30),
    lines,
  });
  if (send) await call(a, 'PATCH', `/invoices/${invoice.id}/send`);
  return invoice;
}
export async function expenseAccountId(a: Account): Promise<string> {
  const accounts = await call<Row[] | { items?: Row[] }>(a, 'GET', '/accounts?limit=500');
  const list = Array.isArray(accounts) ? accounts : (accounts.items ?? []);
  const found = list.find((x) => x['code'] === '6999') ?? list.find((x) => x['type'] === 'EXPENSE');
  if (!found) throw new Error('no expense account');
  return found.id;
}
export async function bankAccountId(a: Account): Promise<string> {
  const accounts = await call<Row[] | { items?: Row[] }>(a, 'GET', '/accounts?limit=500');
  const list = Array.isArray(accounts) ? accounts : (accounts.items ?? []);
  const found = list.find((x) => x['code'] === '1010');
  if (!found) throw new Error('no bank account');
  return found.id;
}
export async function createBill(a: Account, vendorId: string, lines: Line[]): Promise<Row> {
  const accountId = await expenseAccountId(a);
  const bill = await call<Row>(a, 'POST', '/bills', {
    vendorId,
    date: today(),
    dueDate: inDays(30),
    lines: lines.map((l) => ({ ...l, accountId })),
  });
  await call(a, 'PATCH', `/bills/${bill.id}/open`);
  return bill;
}
export const payBill = async (
  a: Account,
  vendorId: string,
  billId: string,
  amount: string,
): Promise<Row> =>
  call<Row>(a, 'POST', '/payments-made', {
    vendorId,
    date: today(),
    amount,
    paymentMode: 'CASH',
    paidFromAccountId: await bankAccountId(a),
    allocations: [{ billId, amount }],
  });
export const read = <T = Record<string, unknown>>(a: Account, path: string) =>
  call<T>(a, 'GET', path);

export const createCustomer = (a: Account, name = 'Nile Traders') =>
  call<Row>(a, 'POST', '/customers', {
    name,
    email: `${name.replace(/\W/g, '').toLowerCase()}@example.test`,
  });

/** A sent invoice of `quantity` x `rate` (no tax), so its journal is posted. */
export async function createSentInvoice(
  a: Account,
  customerId: string,
  quantity = '2',
  rate = '500',
): Promise<Row> {
  const invoice = await call<Row>(a, 'POST', '/invoices', {
    customerId,
    date: today(),
    dueDate: inDays(30),
    lines: [{ description: 'Consulting', quantity, rate }],
  });
  await call(a, 'PATCH', `/invoices/${invoice.id}/send`);
  return invoice;
}

export const recordPayment = (a: Account, invoiceId: string, amount: string) =>
  call<Row>(a, 'POST', `/invoices/${invoiceId}/record-payment`, {
    amount,
    date: today(),
    paymentMode: 'CASH',
  });
export const createCreditNote = (
  a: Account,
  customerId: string,
  invoiceId: string,
  amount: string,
) =>
  call<Row>(a, 'POST', '/credit-notes', {
    customerId,
    invoiceId,
    date: today(),
    reason: 'Returned goods',
    amount,
    type: 'APPLY_TO_INVOICE',
    appliedToInvoiceId: invoiceId,
  });
export const createVendor = (a: Account, name = 'Delta Supplies') =>
  call<Row>(a, 'POST', '/vendors', { name });
export const createOpenBill = async (a: Account, vendorId: string, rate = '300'): Promise<Row> => {
  const accounts = await call<Row[]>(a, 'GET', '/accounts?limit=500');
  const list = Array.isArray(accounts)
    ? accounts
    : ((accounts as unknown as { items?: Row[] }).items ?? []);
  const expense = list.find((x) => x['type'] === 'EXPENSE');
  if (!expense) throw new Error('The new organization has no expense account');
  const bill = await call<Row>(a, 'POST', '/bills', {
    vendorId,
    date: today(),
    dueDate: inDays(30),
    lines: [{ description: 'Office rent', accountId: expense.id, quantity: '1', rate }],
  });
  await call(a, 'PATCH', `/bills/${bill.id}/open`);
  return bill;
};

/** Like the helpers above, but returns the status and body instead of throwing, for tests about refusals. */
export async function attempt(
  a: Account,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.accessToken}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  return {
    status: res.status,
    body: (parsed['data'] as Record<string, unknown> | undefined) ?? parsed,
  };
}
export const todayIso = today;
