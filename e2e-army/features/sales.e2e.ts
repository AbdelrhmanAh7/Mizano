// Sales (AR) features: customers, quotes, invoices, payments received, credit notes, delivery challans.
//   shard ui-sales  : browser tests on the seeded demo org (admin@mizano.com), records created through the real forms
//   shard sales-api : request-level tests on a freshly registered tenant (exact decimal arithmetic, ledger effects, tenant isolation)
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { needsModel } from "../lib.ts";
import { DATE, acct, adminApi, anon, defaults, h1, ids, invoiceBody, journalOf, ledgerTenant, lineSig, rows, salesReturnsAccount, seeded, seededEmail, sumDec, subDec, dec, signIn, stockedItem, tenant } from "./_mz.e2e.ts";

const A = () => ledgerTenant("sales");
const B = () => tenant("sales-b");

/** Opens an Arabic page and checks the right-to-left layout + the Arabic title (no model call). */
async function arabic({ app, screen, browser }: any, path: string, title: string) {
  await app.open(path);
  await expect(h1(screen, title)).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
}
/** Finds the newest document of a list endpoint whose lines carry `description` (documents have no unique name). */
async function docWithLine(api: any, list: string, description: string): Promise<any | undefined> {
  const r = await api.get(list, { limit: 30, sortBy: "createdAt", sortOrder: "desc" });
  for (const row of rows(r).slice(0, 30)) {
    const full = Array.isArray(row.lines) ? row : (await api.get(`${list}/${row.id}`)).body;
    if ((full?.lines ?? []).some((l: any) => l.description === description)) return full;
  }
  return undefined;
}

// ───────────────────────────────────────────── ui ─────────────────────────────────────────────
test("[mz-customers.1] create a customer through the form, find it in the list; the page is available in Arabic", { tags: ["feat:mz-customers", "shard:ui-sales", "lvl:ui"] }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  const name = seeded("Customer"), email = seededEmail("customer");
  await signIn(fx, "/en/sales/customers/new");
  await expect(h1(screen, "New Customer")).toBeVisible({ timeout: 90_000 });
  await agent.act("fill the new customer form with the name {name} and the email {email}, then press the save / create button. The step is complete once save was pressed, even if the app then shows another page", { params: { name, email }, maxModelCalls: 12 });
  const api = await adminApi();
  await expect.poll(async () => rows(await api.get("/customers", { search: name })).some((c) => c.name === name && c.email === email), { timeout: 30_000 }).toBe(true);
  await app.open("/en/sales/customers");
  await expect(h1(screen, "Customers")).toBeVisible({ timeout: 60_000 });
  await agent.waitFor("the customers table has finished loading and lists customers such as 'Nile Tech Solutions' and 'Delta Logistics Egypt'");
  await arabic(fx, "/ar/sales/customers", "العملاء");
});

test("[mz-quotes.1] create a quote for a customer through the form and see it in the quotes list", { tags: ["feat:mz-quotes", "shard:ui-sales", "lvl:ui"] }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  const line = seeded("Quote line");
  await signIn(fx, "/en/sales/quotes/new");
  await expect(h1(screen, "New Quote")).toBeVisible({ timeout: 90_000 });
  await agent.act("fill the new quote: choose the first available customer, add one line with the description {line}, quantity 1 and price 100, then press the save button. The step is complete once save was pressed, even if the app then shows another page", { params: { line }, maxModelCalls: 14 });
  const api = await adminApi();
  await expect.poll(async () => dec((await docWithLine(api, "/quotes", line))?.grandTotal), { timeout: 30_000 }).toBe("100");
  await app.open("/en/sales/quotes");
  await expect(h1(screen, "Quotes")).toBeVisible({ timeout: 60_000 });
  await agent.waitFor("the quotes table has finished loading and lists at least one quote with a status badge");
  await arabic(fx, "/ar/sales/quotes", "عروض الأسعار");
});

test("[mz-sales-invoices.1] create a sales invoice for a customer through the form and see it in the invoices list", { tags: ["feat:mz-sales-invoices", "shard:ui-sales", "lvl:ui"] }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  const line = seeded("Invoice line");
  await signIn(fx, "/en/sales/invoices/new");
  await expect(h1(screen, "New Invoice")).toBeVisible({ timeout: 90_000 });
  await agent.act("fill the new sales invoice: choose the first available customer, add one line with the description {line}, quantity 1 and price 100, then press the save button (draft). The step is complete once save was pressed, even if the app then shows another page", { params: { line }, maxModelCalls: 14 });
  const api = await adminApi();
  await expect.poll(async () => { const d = await docWithLine(api, "/invoices", line); return d ? `${d.status}:${dec(d.grandTotal)}` : null; }, { timeout: 30_000 }).toBe("DRAFT:100");
  await app.open("/en/sales/invoices");
  await expect(h1(screen, "Invoices")).toBeVisible({ timeout: 60_000 });
  await agent.waitFor("the invoices table has finished loading and lists invoices such as INV-001 for 'Nile Tech Solutions' with status badges");
  await arabic(fx, "/ar/sales/invoices", "الفواتير");
});

test("[mz-sales-payments.1] the payments received list shows the seeded payments and the record-payment form opens", { tags: ["feat:mz-sales-payments", "shard:ui-sales", "lvl:ui"] }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/sales/payments");
  await expect(h1(screen, "Payments Received")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the payments table has finished loading and lists payments received with payment numbers, customers and amounts");
  await app.open("/en/sales/payments/new");
  await expect(h1(screen, "Record Payment")).toBeVisible({ timeout: 60_000 });
  await agent.assert("a payment form is shown with a customer selection, an amount, a payment date and a deposit account");
  await arabic(fx, "/ar/sales/payments", "المدفوعات المستلمة");
});

test("[mz-credit-notes.1] the credit notes list shows the seeded credit note and the new credit note form opens", { tags: ["feat:mz-credit-notes", "shard:ui-sales", "lvl:ui"] }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/sales/credit-notes");
  await expect(h1(screen, "Credit Notes")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the credit notes table has finished loading and lists at least one credit note with a number, customer and amount");
  await app.open("/en/sales/credit-notes/new");
  await expect(h1(screen, "New Credit Note")).toBeVisible({ timeout: 60_000 });
  await agent.assert("a credit note form is shown with a customer, an invoice, an amount, a reason and a credit note type");
  await arabic(fx, "/ar/sales/credit-notes", "إشعارات الائتمان");
});

test("[mz-delivery-challans.1] the delivery challans list shows the seeded challan and the new challan form opens", { tags: ["feat:mz-delivery-challans", "shard:ui-sales", "lvl:ui"] }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/sales/delivery-challans");
  await expect(h1(screen, "Delivery Challans")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the delivery challans table has finished loading and lists at least one challan with a number, customer and status");
  await app.open("/en/sales/delivery-challans/new");
  await expect(h1(screen, "New Challan")).toBeVisible({ timeout: 60_000 });
  await agent.assert("a delivery challan form is shown with a customer, a challan type, a date and line items");
  await arabic(fx, "/ar/sales/delivery-challans", "سندات التسليم");
});

// ───────────────────────────────────────────── api ─────────────────────────────────────────────
test("[mz-customers.2] customer API: create, validation, search, update, statement, delete rules, tenant isolation", { tags: ["feat:mz-customers", "shard:sales-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/customers")).status).toBe(401);
  expect((await anon.post("/customers", { name: "x" })).status).toBe(401);

  const name = seeded("Customer API"), email = seededEmail("customer-api");
  const created = await a.api.post("/customers", { name, email, currency: "EGP", paymentTerms: 30 });
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject({ name, email });
  const id = created.body.id as string;

  expect((await a.api.post("/customers", { email })).status).toBe(400); // name is required
  expect((await a.api.post("/customers", { name: "x", email: "not-an-email" })).status).toBe(400);
  expect((await a.api.post("/customers", { name: "x", currency: "EG" })).status).toBe(400);
  expect((await a.api.post("/customers", { name: "x", organizationId: a.orgId })).status).toBe(400); // whitelist: unknown field refused

  await expect.poll(async () => ids(await a.api.get("/customers", { search: name })), { timeout: 20_000 }).toContain(id);
  const one = await a.api.get(`/customers/${id}`);
  expect(one.status).toBe(200);
  expect(one.body.name).toBe(name);
  const upd = await a.api.patch(`/customers/${id}`, { name: `${name} Ltd`, phone: "+201000000000" });
  expect(upd.status).toBe(200);
  expect(upd.body).toMatchObject({ name: `${name} Ltd`, phone: "+201000000000" });

  const statement = await a.api.get(`/customers/${id}/statement`);
  expect(statement.status).toBe(200);
  expect(dec(statement.body.closingBalance)).toBe("0");

  // tenant isolation
  expect((await b.api.get(`/customers/${id}`)).status).toBe(404);
  expect((await b.api.patch(`/customers/${id}`, { name: "Hijacked" })).status).toBe(404);
  expect((await b.api.del(`/customers/${id}`)).status).toBe(404);
  expect(ids(await b.api.get("/customers", { limit: 100 }))).not.toContain(id);

  // a customer with an invoice cannot be deleted, a customer without one can
  const withInvoice = (await a.api.post("/customers", { name: seeded("Customer with invoice"), currency: "EGP" })).body.id;
  expect((await a.api.post("/invoices", invoiceBody(withInvoice, [{ quantity: "1", rate: "10" }]))).status).toBe(201);
  const refused = await a.api.del(`/customers/${withInvoice}`);
  expect(refused.status).toBe(400);
  expect(refused.body.message).toMatch(/existing invoices/i);
  expect((await a.api.del(`/customers/${id}`)).status).toBe(200);
  expect((await a.api.get(`/customers/${id}`)).status).toBe(404);
});

test("[mz-quotes.2] quote API: exact totals, send -> accept -> convert to an invoice, guarded transitions", { tags: ["feat:mz-quotes", "shard:sales-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/quotes")).status).toBe(401);
  const customer = (await a.api.post("/customers", { name: seeded("Quote customer"), currency: "EGP" })).body.id;
  const body = { customerId: customer, date: DATE.doc, expiryDate: DATE.due, lines: [{ description: seeded("Quote API line"), quantity: "2", rate: "100", taxRate: "14" }] };

  const q = await a.api.post("/quotes", body);
  expect(q.status).toBe(201);
  expect(q.body.status).toBe("DRAFT");
  expect(q.body.quoteNumber).toMatch(/^[A-Z]+-\d+$/);
  expect([dec(q.body.subtotal), dec(q.body.taxAmount), dec(q.body.grandTotal)]).toEqual(["200", "28", "228"]);
  const id = q.body.id as string;

  expect((await a.api.post("/quotes", { ...body, lines: [] })).status).toBe(400); // at least one line
  expect((await a.api.post("/quotes", { ...body, customerId: "does-not-exist" })).status).toBe(400);
  expect((await b.api.post("/quotes", body)).status).toBe(400); // another tenant's customer is "not found"
  expect((await b.api.get(`/quotes/${id}`)).status).toBe(404);

  // guarded state machine: only accepted quotes convert
  expect((await a.api.post(`/quotes/${id}/convert-to-invoice`)).status).toBe(400);
  expect((await a.api.patch(`/quotes/${id}/accept`)).status).toBe(400);
  const sent = await a.api.patch(`/quotes/${id}/send`);
  expect(sent.status).toBe(200);
  expect(sent.body.status).toBe("SENT");
  expect((await a.api.patch(`/quotes/${id}`, { notes: "late edit" })).status).toBe(400); // only drafts are editable
  expect((await a.api.del(`/quotes/${id}`)).status).toBe(400); // only drafts are deletable
  const accepted = await a.api.patch(`/quotes/${id}/accept`);
  expect(accepted.status).toBe(200);
  expect(accepted.body.status).toBe("ACCEPTED");

  const converted = await a.api.post(`/quotes/${id}/convert-to-invoice`);
  expect(converted.status).toBe(201);
  expect(converted.body.quoteId).toBe(id);
  expect(converted.body.status).toBe("DRAFT");
  expect([dec(converted.body.subtotal), dec(converted.body.taxAmount), dec(converted.body.grandTotal)]).toEqual(["200", "28", "228"]);
  expect((await a.api.get(`/quotes/${id}`)).body.status).toBe("INVOICED");
  expect((await a.api.post(`/quotes/${id}/convert-to-invoice`)).status).toBe(400); // converts exactly once

  // clone and decline
  const clone = await a.api.post(`/quotes/${id}/clone`);
  expect(clone.status).toBe(201);
  expect(clone.body.status).toBe("DRAFT");
  expect(clone.body.id).not.toBe(id);
  const q2 = (await a.api.post("/quotes", body)).body.id;
  expect((await a.api.patch(`/quotes/${q2}/send`)).status).toBe(200);
  expect((await a.api.patch(`/quotes/${q2}/decline`)).body.status).toBe("DECLINED");
  const draftId = (await a.api.post("/quotes", body)).body.id;
  expect((await a.api.del(`/quotes/${draftId}`)).status).toBe(200);
  expect((await a.api.get(`/quotes/${draftId}`)).status).toBe(404);
});

test("[mz-sales-invoices.2] invoice API: exact decimal totals, gapless numbers, validation and draft editing", { tags: ["feat:mz-sales-invoices", "shard:sales-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/invoices")).status).toBe(401);
  expect((await anon.post("/invoices", {})).status).toBe(401);
  const customer = (await a.api.post("/customers", { name: seeded("Invoice customer"), currency: "EGP" })).body.id;
  const make = (lines: Array<Record<string, string>>) => a.api.post("/invoices", invoiceBody(customer, lines));
  const totals = (r: any) => [dec(r.body.subtotal), dec(r.body.taxAmount), dec(r.body.grandTotal), dec(r.body.balanceDue)];

  const vat = await make([{ quantity: "2", rate: "100", taxRate: "14" }]);
  expect(vat.status).toBe(201);
  expect(vat.body.status).toBe("DRAFT");
  expect(vat.body.invoiceNumber).toMatch(/^INV-\d+$/);
  expect(totals(vat)).toEqual(["200", "28", "228", "228"]); // 2 x 100 + 14% VAT
  const discount = await make([{ quantity: "3", rate: "50", discount: "10" }]);
  expect(totals(discount)).toEqual(["135", "0", "135", "135"]); // 3 x 50 less 10%
  const cents = await make([{ quantity: "1", rate: "0.10" }, { quantity: "1", rate: "0.20" }]);
  expect(totals(cents)).toEqual(["0.3", "0", "0.3", "0.3"]); // never 0.30000000000000004
  const mixed = await make([
    { quantity: "3", rate: "33.33", taxRate: "14" },
    { quantity: "1.375", rate: "19.999", taxRate: "5" },
    { quantity: "7", rate: "0.35", taxRate: "0" },
  ]);
  expect(totals(mixed)).toEqual(["129.94", "15.38", "145.32", "145.32"]); // mixed tax rates, 4-digit quantities and rates

  // gapless numbering
  const n = [vat, discount, cents, mixed].map((r) => Number(String(r.body.invoiceNumber).replace(/\D/g, "")));
  expect(n).toEqual([n[0], n[0] + 1, n[0] + 2, n[0] + 3]);

  // validation: DTO whitelist, decimals as strings with <= 4 fraction digits, no negative amounts, own-tenant references only
  expect((await a.api.post("/invoices", { ...invoiceBody(customer, [{ quantity: "1", rate: "1" }]), grandTotal: "1" })).status).toBe(400);
  expect((await make([{ quantity: "1", rate: "1.00001" }])).status).toBe(400);
  expect((await make([{ quantity: "-1", rate: "5" }])).status).toBe(400);
  expect((await make([])).status).toBe(400);
  expect((await a.api.post("/invoices", { ...invoiceBody(customer, [{ quantity: "1", rate: "1" }]), date: "not-a-date" })).status).toBe(400);
  const foreign = await b.api.post("/invoices", invoiceBody(customer, [{ quantity: "1", rate: "1" }]));
  expect(foreign.status).toBe(400);
  expect(foreign.body.message).toMatch(/customer not found/i);

  // a draft is editable (totals are recomputed) and deletable
  const edited = await a.api.patch(`/invoices/${vat.body.id}`, { lines: [{ description: "Edited", quantity: "1", rate: "100", taxRate: "14" }] });
  expect(edited.status).toBe(200);
  expect([dec(edited.body.subtotal), dec(edited.body.taxAmount), dec(edited.body.grandTotal)]).toEqual(["100", "14", "114"]);
  expect((await a.api.del(`/invoices/${discount.body.id}`)).status).toBe(200);
  expect((await a.api.get(`/invoices/${discount.body.id}`)).status).toBe(404);
  expect(ids(await a.api.get("/invoices", { limit: 100 }))).not.toContain(discount.body.id);
  const opts = await a.api.get("/invoices/tax-rate-options");
  expect(opts.status).toBe(200);
  expect(Array.isArray(opts.body)).toBe(true);
});

test("[mz-sales-invoices.3] invoice API: sending posts one balanced journal, sent invoices are immutable, void reverses it, bulk send", { tags: ["feat:mz-sales-invoices", "shard:sales-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  const d = await defaults(a);
  const customer = (await a.api.post("/customers", { name: seeded("Posting customer"), currency: "EGP" })).body.id;
  const inv = (await a.api.post("/invoices", invoiceBody(customer, [{ quantity: "2", rate: "100", taxRate: "14" }]))).body;

  const ar0 = await acct(a.api, d.defaultArAccountId), rev0 = await acct(a.api, d.defaultRevenueAccountId), vat0 = await acct(a.api, d.defaultVatPayableAccountId);
  const sent = await a.api.patch(`/invoices/${inv.id}/send`);
  expect(sent.status).toBe(200);
  expect(sent.body.status).toBe("SENT");
  const ar1 = await acct(a.api, d.defaultArAccountId), rev1 = await acct(a.api, d.defaultRevenueAccountId), vat1 = await acct(a.api, d.defaultVatPayableAccountId);
  expect(subDec(ar1.debit, ar0.debit)).toBe("228"); // Dr Accounts Receivable
  expect(subDec(rev1.credit, rev0.credit)).toBe("200"); // Cr Revenue
  expect(subDec(vat1.credit, vat0.credit)).toBe("28"); // Cr VAT payable

  const journal = await journalOf(a.api, "INVOICE_SEND", inv.id);
  expect(journal).toBeDefined();
  expect(journal.isPosted).toBe(true);
  expect(dec(journal.totalDebit)).toBe(dec(journal.totalCredit));
  expect(lineSig(journal.lines)).toEqual(lineSig([
    { accountId: d.defaultArAccountId, debit: "228", credit: "0" },
    { accountId: d.defaultRevenueAccountId, debit: "0", credit: "200" },
    { accountId: d.defaultVatPayableAccountId, debit: "0", credit: "28" },
  ]));

  // sending again, editing and deleting a sent invoice are refused and post nothing more
  expect([400, 409]).toContain((await a.api.patch(`/invoices/${inv.id}/send`)).status);
  expect((await a.api.patch(`/invoices/${inv.id}`, { notes: "tamper" })).status).toBe(400);
  expect((await a.api.del(`/invoices/${inv.id}`)).status).toBe(400);
  expect(subDec((await acct(a.api, d.defaultArAccountId)).debit, ar0.debit)).toBe("228");
  expect((await b.api.patch(`/invoices/${inv.id}/send`)).status).toBe(404);
  expect((await b.api.patch(`/invoices/${inv.id}/void`)).status).toBe(404);

  // void: a linked reversal brings the balances back, the original journal stays
  const voided = await a.api.patch(`/invoices/${inv.id}/void`);
  expect(voided.status).toBe(200);
  expect(voided.body.status).toBe("VOID");
  const ar2 = await acct(a.api, d.defaultArAccountId);
  expect(subDec(ar2.credit, ar0.credit)).toBe("228");
  const reversal = await journalOf(a.api, "INVOICE_VOID", inv.id);
  expect(reversal?.reversalOfId).toBe(journal.id);
  expect((await a.api.patch(`/invoices/${inv.id}/void`)).status).toBe(400); // already void

  // bulk send reports per-invoice results (a zero-total draft cannot be sent)
  const ok = (await a.api.post("/invoices", invoiceBody(customer, [{ quantity: "1", rate: "10" }]))).body.id;
  const zero = (await a.api.post("/invoices", invoiceBody(customer, [{ quantity: "1", rate: "0" }]))).body.id;
  const bulk = await a.api.post("/invoices/bulk-send", { ids: [ok, zero] });
  expect(bulk.status).toBe(201);
  expect(bulk.body).toMatchObject({ processed: 1, total: 2 });
  expect(bulk.body.failures.map((f: any) => f.id)).toEqual([zero]);
  expect((await a.api.get(`/invoices/${ok}`)).body.status).toBe("SENT");
  const clone = await a.api.post(`/invoices/${ok}/clone`);
  expect(clone.status).toBe(201);
  expect(clone.body.status).toBe("DRAFT");
});

test("[mz-sales-payments.2] payments received API: partial payment journal, overpayment refused, void restores the invoice, bulk pay", { tags: ["feat:mz-sales-payments", "shard:sales-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  const d = await defaults(a);
  expect((await anon.get("/payments-received")).status).toBe(401);
  const customer = (await a.api.post("/customers", { name: seeded("Payer"), currency: "EGP" })).body.id;
  const send = async (rate: string, qty = "1", taxRate?: string) => {
    const inv = (await a.api.post("/invoices", invoiceBody(customer, [{ quantity: qty, rate, ...(taxRate ? { taxRate } : {}) }]))).body;
    expect((await a.api.patch(`/invoices/${inv.id}/send`)).status).toBe(200);
    return inv;
  };
  const inv = await send("100", "2", "14"); // 228
  const bank0 = await acct(a.api, d.defaultBankAccountId), ar0 = await acct(a.api, d.defaultArAccountId);
  const pay = await a.api.post("/payments-received", { customerId: customer, date: DATE.payment, amount: "100", paymentMode: "BANK_TRANSFER", depositToAccountId: d.defaultBankAccountId, allocations: [{ invoiceId: inv.id, amount: "100" }] });
  expect(pay.status).toBe(201);
  expect(pay.body.paymentNumber).toMatch(/^PMT-\d+$/);
  expect(dec(pay.body.amount)).toBe("100");
  const after = (await a.api.get(`/invoices/${inv.id}`)).body;
  expect([after.status, dec(after.balanceDue)]).toEqual(["PARTIALLY_PAID", "128"]);
  expect(subDec((await acct(a.api, d.defaultBankAccountId)).debit, bank0.debit)).toBe("100"); // Dr bank
  expect(subDec((await acct(a.api, d.defaultArAccountId)).credit, ar0.credit)).toBe("100"); // Cr receivable
  const journal = await journalOf(a.api, "PAYMENT_RECEIVED", pay.body.id);
  expect(lineSig(journal.lines)).toEqual(lineSig([{ accountId: d.defaultBankAccountId, debit: "100", credit: "0" }, { accountId: d.defaultArAccountId, debit: "0", credit: "100" }]));

  // overpayment and inconsistent allocations are refused without any effect
  const over = await a.api.post("/payments-received", { customerId: customer, date: DATE.payment, amount: "128.0001", paymentMode: "BANK_TRANSFER", depositToAccountId: d.defaultBankAccountId, allocations: [{ invoiceId: inv.id, amount: "128.0001" }] });
  expect(over.status).toBe(400);
  const mismatch = await a.api.post("/payments-received", { customerId: customer, date: DATE.payment, amount: "50", paymentMode: "CASH", depositToAccountId: d.defaultBankAccountId, allocations: [{ invoiceId: inv.id, amount: "40" }] });
  expect(mismatch.status).toBe(400);
  expect((await a.api.post(`/invoices/${inv.id}/record-payment`, { amount: "128.0001", date: DATE.payment, depositToAccountId: d.defaultBankAccountId })).status).toBe(400);
  expect(dec((await a.api.get(`/invoices/${inv.id}`)).body.balanceDue)).toBe("128");
  expect(subDec((await acct(a.api, d.defaultBankAccountId)).debit, bank0.debit)).toBe("100");

  // tenant B cannot touch it
  expect((await b.api.get(`/payments-received/${pay.body.id}`)).status).toBe(404);
  expect((await b.api.post(`/payments-received/${pay.body.id}/void`)).status).toBe(404);

  // void: linked reversal, invoice restored, second void refused, listed no more
  const voided = await a.api.post(`/payments-received/${pay.body.id}/void`);
  expect(voided.status).toBe(201);
  const restored = (await a.api.get(`/invoices/${inv.id}`)).body;
  expect([restored.status, dec(restored.balanceDue)]).toEqual(["SENT", "228"]);
  expect((await journalOf(a.api, "PAYMENT_RECEIVED_VOID", pay.body.id))?.reversalOfId).toBe(journal.id);
  expect((await a.api.post(`/payments-received/${pay.body.id}/void`)).status).toBe(404);
  await expect.poll(async () => ids(await a.api.get("/payments-received", { limit: 100 })), { timeout: 20_000 }).not.toContain(pay.body.id);

  // record-payment shortcut and bulk pay (drafts fail individually)
  const full = await a.api.post(`/invoices/${inv.id}/record-payment`, { amount: "228", date: DATE.payment, depositToAccountId: d.defaultBankAccountId });
  expect(full.status).toBe(201);
  expect((await a.api.get(`/invoices/${inv.id}`)).body.status).toBe("PAID");
  const i2 = await send("135"), i3 = await send("100");
  const draft = (await a.api.post("/invoices", invoiceBody(customer, [{ quantity: "1", rate: "10" }]))).body.id;
  const bulk = await a.api.post("/invoices/bulk-pay", { ids: [i2.id, i3.id, draft], depositToAccountId: d.defaultBankAccountId, date: DATE.payment, paymentMode: "CASH" });
  expect(bulk.status).toBe(201);
  expect(bulk.body).toMatchObject({ processed: 2, total: 3 });
  expect(bulk.body.failures.map((f: any) => f.id)).toEqual([draft]);
  for (const x of [i2, i3]) expect((await a.api.get(`/invoices/${x.id}`)).body.status).toBe("PAID");
});

test("[mz-credit-notes.2] credit note API: VAT split posted to the returns account, limits, refund account rule, void reversal", { tags: ["feat:mz-credit-notes", "shard:sales-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  const d = await defaults(a);
  expect((await anon.get("/credit-notes")).status).toBe(401);
  const returns = await salesReturnsAccount(a);
  const customer = (await a.api.post("/customers", { name: seeded("Credit customer"), currency: "EGP" })).body.id;
  const inv = (await a.api.post("/invoices", invoiceBody(customer, [{ quantity: "2", rate: "100", taxRate: "14" }]))).body; // 228
  expect((await a.api.patch(`/invoices/${inv.id}/send`)).status).toBe(200);

  const ret0 = await acct(a.api, returns), vat0 = await acct(a.api, d.defaultVatPayableAccountId), ar0 = await acct(a.api, d.defaultArAccountId);
  // 57 is 25% of 228: its VAT share is exactly 7 and the net 50
  const cn = await a.api.post("/credit-notes", { customerId: customer, invoiceId: inv.id, date: DATE.payment, amount: "57", type: "APPLY_TO_INVOICE", reason: "Returned goods" });
  expect(cn.status).toBe(201);
  expect(cn.body.creditNoteNumber).toMatch(/^CN-\d+$/);
  expect(dec((await a.api.get(`/invoices/${inv.id}`)).body.balanceDue)).toBe("171");
  expect(subDec((await acct(a.api, returns)).debit, ret0.debit)).toBe("50");
  expect(subDec((await acct(a.api, d.defaultVatPayableAccountId)).debit, vat0.debit)).toBe("7");
  expect(subDec((await acct(a.api, d.defaultArAccountId)).credit, ar0.credit)).toBe("57");
  const journal = await journalOf(a.api, "CREDIT_NOTE", cn.body.id);
  expect(lineSig(journal.lines)).toEqual(lineSig([
    { accountId: returns, debit: "50", credit: "0" }, { accountId: d.defaultVatPayableAccountId, debit: "7", credit: "0" }, { accountId: d.defaultArAccountId, debit: "0", credit: "57" },
  ]));

  // limits and the refund account rule
  const tooMuch = await a.api.post("/credit-notes", { customerId: customer, invoiceId: inv.id, date: DATE.payment, amount: "171.0001", type: "APPLY_TO_INVOICE", reason: "Too much" });
  expect(tooMuch.status).toBe(400);
  const badRefund = await a.api.post("/credit-notes", { customerId: customer, invoiceId: inv.id, date: DATE.payment, amount: "1", type: "REFUND", refundAccountId: d.defaultRevenueAccountId, reason: "wrong account" });
  expect(badRefund.status).toBe(400);
  const refundAccounts = await a.api.get("/credit-notes/refund-accounts");
  expect(refundAccounts.status).toBe(200);
  expect(ids(refundAccounts)).toContain(d.defaultBankAccountId);
  expect(ids(refundAccounts)).not.toContain(d.defaultArAccountId);
  expect((await a.api.put(`/credit-notes/${cn.body.id}`, { reason: "Returned goods (customer request)" })).status).toBe(200); // only the reason is editable
  expect((await a.api.put(`/credit-notes/${cn.body.id}`, { amount: "1" })).status).toBe(400);

  // tenant isolation + void
  expect((await b.api.get(`/credit-notes/${cn.body.id}`)).status).toBe(404);
  expect((await b.api.del(`/credit-notes/${cn.body.id}`)).status).toBe(404);
  const voided = await a.api.del(`/credit-notes/${cn.body.id}`);
  expect(voided.status).toBe(200);
  expect(dec((await a.api.get(`/invoices/${inv.id}`)).body.balanceDue)).toBe("228");
  expect((await journalOf(a.api, "CREDIT_NOTE_VOID", cn.body.id))?.reversalOfId).toBe(journal.id);
  expect((await a.api.del(`/credit-notes/${cn.body.id}`)).status).toBe(404);
});

test("[mz-delivery-challans.2] delivery challan API: draft -> issue (stock leaves the warehouse) -> returned, stock check, tenant isolation", { tags: ["feat:mz-delivery-challans", "shard:sales-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/delivery-challans")).status).toBe(401);
  const customer = (await a.api.post("/customers", { name: seeded("Challan customer"), currency: "EGP" })).body.id;
  const stock = await stockedItem(a, "challan", 10);
  const stockOf = async () => Number((await a.api.get(`/items/${stock.itemId}`)).body.currentStock);
  const base = { customerId: customer, challanType: "SUPPLY", date: DATE.doc, lines: [{ itemId: stock.itemId, quantity: 2, description: "Two units", warehouseId: stock.warehouseId }] };

  const created = await a.api.post("/delivery-challans", base);
  expect(created.status).toBe(201);
  expect(created.body.status).toBe("DRAFT");
  expect(created.body.challanNumber).toBeTruthy();
  const id = created.body.id as string;
  expect((await a.api.post("/delivery-challans", { ...base, customerId: "nope" })).status).toBe(404);
  expect((await a.api.post("/delivery-challans", { ...base, challanType: "BARTER" })).status).toBe(400);
  expect((await a.api.post("/delivery-challans", { ...base, lines: [{ itemId: stock.itemId, quantity: 0 }] })).status).toBe(400);

  // tenant isolation (audit finding #131: lookups are scoped to the organization)
  expect((await b.api.get(`/delivery-challans/${id}`)).status).toBe(404);
  expect((await b.api.put(`/delivery-challans/${id}`, { notes: "x" })).status).toBe(404);
  expect((await b.api.post(`/delivery-challans/${id}/issue`)).status).toBe(404);
  expect((await b.api.del(`/delivery-challans/${id}`)).status).toBe(404);
  expect(ids(await b.api.get("/delivery-challans", { limit: 100 }))).not.toContain(id);

  expect((await a.api.put(`/delivery-challans/${id}`, { notes: "edited while draft" })).status).toBe(200);
  expect(await stockOf()).toBe(10);
  const issued = await a.api.post(`/delivery-challans/${id}/issue`);
  expect(issued.status).toBe(201);
  expect(issued.body.status).toBe("ISSUED");
  expect(await stockOf()).toBe(8); // two units left the warehouse
  expect((await a.api.put(`/delivery-challans/${id}`, { notes: "late" })).status).toBe(400);
  expect((await a.api.del(`/delivery-challans/${id}`)).status).toBe(400);
  expect((await a.api.post(`/delivery-challans/${id}/issue`)).status).toBe(400);
  const back = await a.api.post(`/delivery-challans/${id}/mark-returned`);
  expect(back.status).toBe(201);
  expect(back.body.status).toBe("RETURNED");
  expect(await stockOf()).toBe(10); // returned goods are back on the shelf
  expect((await a.api.post(`/delivery-challans/${id}/mark-returned`)).status).toBe(400);

  // more than the warehouse holds is refused and changes nothing
  const big = (await a.api.post("/delivery-challans", { ...base, lines: [{ itemId: stock.itemId, quantity: 11, warehouseId: stock.warehouseId }] })).body.id;
  const refused = await a.api.post(`/delivery-challans/${big}/issue`);
  expect(refused.status).toBe(400);
  expect(refused.body.message).toMatch(/Insufficient stock/);
  expect(await stockOf()).toBe(10);
  expect((await a.api.get(`/delivery-challans/${big}`)).body.status).toBe("DRAFT");
  expect((await a.api.del(`/delivery-challans/${big}`)).status).toBe(200);
  expect((await a.api.get(`/delivery-challans/${big}`)).status).toBe(404);
});
