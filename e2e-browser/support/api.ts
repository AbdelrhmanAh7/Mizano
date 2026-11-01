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
