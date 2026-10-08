// Purchases (AP) features: vendors, bills, expenses, payments made, vendor credits (+ the scan-bill page).
//   shard ui-purchases  : browser tests on the seeded demo org
//   shard purchases-api : request-level tests on freshly registered tenants (decimal arithmetic, AP postings, isolation)
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { needsModel } from "../lib.ts";
import { DATE, acct, adminApi, anon, dec, defaults, h1, ids, journalOf, ledgerTenant, lineSig, rows, seeded, seededEmail, signIn, subDec, tenant } from "./_mz.e2e.ts";

const A = () => ledgerTenant("purchases");
const B = () => tenant("purchases-b");

async function arabic({ app, screen, browser }: any, path: string, title: string) {
  await app.open(path);
  await expect(h1(screen, title)).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
}
async function docWithLine(api: any, list: string, description: string): Promise<any | undefined> {
  const r = await api.get(list, { limit: 30, sortBy: "createdAt", sortOrder: "desc" });
  for (const row of rows(r).slice(0, 30)) {
    const full = Array.isArray(row.lines) ? row : (await api.get(`${list}/${row.id}`)).body;
    if ((full?.lines ?? []).some((l: any) => l.description === description)) return full;
  }
  return undefined;
}
const billBody = (vendorId: string, accountId: string, lines: Array<Record<string, string>>, extra: Record<string, unknown> = {}) => ({
  vendorId, date: DATE.doc, dueDate: DATE.due, lines: lines.map((l, i) => ({ description: `Line ${i + 1}`, accountId, ...l })), ...extra,
});

// ───────────────────────────────────────────── ui ─────────────────────────────────────────────
test("[mz-vendors.1] create a vendor through the form and find it in the vendors list; Arabic page is right-to-left", { tags: ["feat:mz-vendors", "shard:ui-purchases", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  const name = seeded("Vendor"), email = seededEmail("vendor");
  await signIn(fx, "/en/purchases/vendors/new");
  await expect(h1(screen, "New Vendor")).toBeVisible({ timeout: 90_000 });
  await agent.act("fill the new vendor form with the name {name} and the email {email}, then press the save / create button. The step is complete once save was pressed, even if the app then shows another page", { params: { name, email }, maxModelCalls: 12 });
  const api = await adminApi();
  await expect.poll(async () => rows(await api.get("/vendors", { search: name })).some((v) => v.name === name), { timeout: 30_000 }).toBe(true);
  await app.open("/en/purchases/vendors");
  await expect(h1(screen, "Vendors")).toBeVisible({ timeout: 60_000 });
  await agent.waitFor("the vendors table has finished loading and lists vendors such as 'Supplier Alpha' and 'Supplier Beta'");
  await arabic(fx, "/ar/purchases/vendors", "الموردون");
});

test("[mz-purchase-bills.1] create a vendor bill through the form and see it in the bills list", { tags: ["feat:mz-purchase-bills", "shard:ui-purchases", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  const line = seeded("Bill line");
  await signIn(fx, "/en/purchases/bills/new");
  await expect(h1(screen, "New Bill")).toBeVisible({ timeout: 90_000 });
  await agent.act("fill the new bill: choose the first available vendor, add one line with the description {line}, quantity 1 and price 100 (choose any expense account if the line asks for one), then press the save button (draft). The step is complete once save was pressed, even if the app then shows another page", { params: { line }, maxModelCalls: 16 });
  const api = await adminApi();
  await expect.poll(async () => { const d = await docWithLine(api, "/bills", line); return d ? `${d.status}:${dec(d.grandTotal)}` : null; }, { timeout: 30_000 }).toBe("DRAFT:100");
  await app.open("/en/purchases/bills");
  await expect(h1(screen, "Bills")).toBeVisible({ timeout: 60_000 });
  await agent.waitFor("the bills table has finished loading and lists bills with vendors, amounts and status badges");
  await arabic(fx, "/ar/purchases/bills", "الفواتير");
});

test("[mz-expenses.1] record an expense through the form and see it in the expenses list", { tags: ["feat:mz-expenses", "shard:ui-purchases", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  const description = seeded("Expense");
  await signIn(fx, "/en/purchases/expenses/new");
  await expect(h1(screen, "New Expense")).toBeVisible({ timeout: 90_000 });
  await agent.act("fill the new expense: choose any expense account, enter the amount 50, choose any paid-through (bank or cash) account, enter the description {description}, then press the save button. The step is complete once save was pressed, even if the app then shows another page", { params: { description }, maxModelCalls: 16 });
  const api = await adminApi();
  await expect.poll(async () => rows(await api.get("/expenses", { limit: 30, sortBy: "createdAt", sortOrder: "desc" })).some((e) => e.description === description && dec(e.amount) === "50"), { timeout: 30_000 }).toBe(true);
  await app.open("/en/purchases/expenses");
  await expect(h1(screen, "Expenses")).toBeVisible({ timeout: 60_000 });
  await agent.waitFor("the expenses table has finished loading and lists expenses with accounts and amounts");
  await arabic(fx, "/ar/purchases/expenses", "المصروفات");
});

test("[mz-purchase-payments.1] the payments made list shows the seeded payment and the record-payment form opens", { tags: ["feat:mz-purchase-payments", "shard:ui-purchases", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/purchases/payments");
  await expect(h1(screen, "Payments Made")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the payments table has finished loading and lists at least one payment made with a number, vendor and amount");
  await app.open("/en/purchases/payments/new");
  await expect(h1(screen, "Record Payment")).toBeVisible({ timeout: 60_000 });
  await agent.assert("a payment form is shown with a vendor selection, an amount, a payment date and a paid-from account");
  await arabic(fx, "/ar/purchases/payments", "المدفوعات");
});

test("[mz-vendor-credits.1] the vendor credits list shows the seeded credit and the new vendor credit form opens", { tags: ["feat:mz-vendor-credits", "shard:ui-purchases", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/purchases/credits");
  await expect(h1(screen, "Vendor Credits")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the vendor credits table has finished loading and lists at least one credit with a number, vendor and amount");
  await app.open("/en/purchases/credits/new");
  await expect(h1(screen, "New Vendor Credit")).toBeVisible({ timeout: 60_000 });
  await agent.assert("a vendor credit form is shown with a vendor, a bill, an amount and a reason");
  await arabic(fx, "/ar/purchases/credits", "ائتمانات الموردين");
});

test("[mz-bill-scan.1] the scan-bill page offers the upload step and its stepper (OCR itself is off in the verify stack)", { tags: ["feat:mz-bill-scan", "shard:ui-purchases", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { agent, screen } = fx;
  await signIn(fx, "/en/purchases/bills/scan");
  await expect(h1(screen, "Scan Bill")).toBeVisible({ timeout: 90_000 });
  await agent.assert("the page shows a four-step progress indicator (upload, processing, review, done) and an upload area for a bill document (drag and drop or click to choose a file)");
  await arabic(fx, "/ar/purchases/bills/scan", "مسح فاتورة مورد");
});

// ───────────────────────────────────────────── api ─────────────────────────────────────────────
test("[mz-vendors.2] vendor API: create, validation, search, update, delete and tenant isolation", { tags: ["feat:mz-vendors", "shard:purchases-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/vendors")).status).toBe(401);
  expect((await anon.post("/vendors", { name: "x" })).status).toBe(401);
  const name = seeded("Vendor API"), email = seededEmail("vendor-api");
  const v = await a.api.post("/vendors", { name, email, city: "Cairo", country: "Egypt", paymentTerms: 30 });
  expect(v.status).toBe(201);
  expect(v.body).toMatchObject({ name, email });
  const id = v.body.id as string;
  expect((await a.api.post("/vendors", { email })).status).toBe(400);
  expect((await a.api.post("/vendors", { name: "x", paymentTerms: -1 })).status).toBe(400);
  expect((await a.api.post("/vendors", { name: "x", organizationId: a.orgId })).status).toBe(400);
  await expect.poll(async () => ids(await a.api.get("/vendors", { search: name })), { timeout: 20_000 }).toContain(id);
  expect((await a.api.get(`/vendors/${id}`)).body.name).toBe(name);
  const upd = await a.api.patch(`/vendors/${id}`, { name: `${name} Co` });
  expect(upd.status).toBe(200);
  expect(upd.body.name).toBe(`${name} Co`);
  expect((await b.api.get(`/vendors/${id}`)).status).toBe(404);
  expect((await b.api.patch(`/vendors/${id}`, { name: "Hijacked" })).status).toBe(404);
  expect((await b.api.del(`/vendors/${id}`)).status).toBe(404);
  expect(ids(await b.api.get("/vendors", { limit: 100 }))).not.toContain(id);
  expect((await a.api.del(`/vendors/${id}`)).status).toBe(200);
  expect((await a.api.get(`/vendors/${id}`)).status).toBe(404);
  const bulk = await a.api.post("/vendors/bulk-delete", { ids: [id] });
  expect(bulk.status).toBe(201);
  expect(bulk.body.processed).toBe(0); // already deleted: reported per record, not an error
});

test("[mz-purchase-bills.2] bill API: exact decimal totals, auto numbering, validation, duplicate check and draft editing", { tags: ["feat:mz-purchase-bills", "shard:purchases-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/bills")).status).toBe(401);
  const vendor = (await a.api.post("/vendors", { name: seeded("Bill vendor") })).body.id;
  const make = (lines: Array<Record<string, string>>, extra: Record<string, unknown> = {}) => a.api.post("/bills", billBody(vendor, a.chart.rent, lines, extra));
  const totals = (r: any) => [dec(r.body.subtotal), dec(r.body.taxAmount), dec(r.body.grandTotal), dec(r.body.balanceDue)];

  const vat = await make([{ quantity: "2", rate: "100", taxRate: "14" }]);
  expect(vat.status).toBe(201);
  expect(vat.body.status).toBe("DRAFT");
  expect(vat.body.billNumber).toMatch(/^BILL-\d+$/);
  expect(totals(vat)).toEqual(["200", "28", "228", "228"]);
  expect(vat.body.lines[0]).toMatchObject({ taxRate: expect.anything() });
  expect(dec(vat.body.lines[0].amount)).toBe("200");
  const next = await make([{ quantity: "1", rate: "300", taxRate: "14" }]);
  expect(Number(String(next.body.billNumber).replace(/\D/g, ""))).toBe(Number(String(vat.body.billNumber).replace(/\D/g, "")) + 1);
  expect(totals(next)).toEqual(["300", "42", "342", "342"]);
  const shared = await make([{ quantity: "1", rate: "50", taxRate: "14" }, { quantity: "1", rate: "25", taxRate: "14" }]);
  expect(totals(shared)).toEqual(["75", "10.5", "85.5", "85.5"]);
  const mixed = await make([{ quantity: "3", rate: "33.33", taxRate: "14" }, { quantity: "1.375", rate: "19.999", taxRate: "5" }, { quantity: "7", rate: "0.35", taxRate: "0" }]);
  expect(totals(mixed)).toEqual(["129.94", "15.38", "145.32", "145.32"]);

  // validation
  expect((await make([])).status).toBe(400);
  expect((await make([{ quantity: "1", rate: "1.00001" }])).status).toBe(400);
  expect((await make([{ quantity: "-2", rate: "5" }])).status).toBe(400);
  expect((await a.api.post("/bills", { ...billBody(vendor, a.chart.rent, [{ quantity: "1", rate: "1" }]), grandTotal: "1" })).status).toBe(400);
  expect((await b.api.post("/bills", billBody(vendor, a.chart.rent, [{ quantity: "1", rate: "1" }]))).status).toBe(400); // foreign vendor / account
  expect((await a.api.post("/bills", billBody(vendor, "does-not-exist", [{ quantity: "1", rate: "1" }]))).status).toBe(400);

  // duplicate warning: same vendor + same number, or the same amount within a few days
  const numbered = await make([{ quantity: "1", rate: "77" }], { billNumber: seeded("VB") });
  expect(numbered.status).toBe(201);
  const dupNumber = await a.api.post("/bills/check-duplicate", { vendorId: vendor, billNumber: seeded("VB") });
  expect(dupNumber.status).toBe(201);
  expect(dupNumber.body).toMatchObject({ isDuplicate: true, existingBillId: numbered.body.id, matchType: "exact_number" });
  const dupAmount = await a.api.post("/bills/check-duplicate", { vendorId: vendor, amount: 77, date: DATE.doc });
  expect(dupAmount.body).toMatchObject({ isDuplicate: true, matchType: "amount_date" });
  expect((await a.api.post("/bills/check-duplicate", { vendorId: vendor, billNumber: seeded("VB-other") })).body.isDuplicate).toBe(false);

  // drafts are editable and deletable; foreign tenants cannot see them
  const edited = await a.api.patch(`/bills/${vat.body.id}`, { notes: "edited while draft" });
  expect(edited.status).toBe(200);
  expect((await b.api.get(`/bills/${vat.body.id}`)).status).toBe(404);
  expect((await a.api.del(`/bills/${next.body.id}`)).status).toBe(200);
  expect((await a.api.get(`/bills/${next.body.id}`)).status).toBe(404);
  const clone = await a.api.post(`/bills/${shared.body.id}/clone`);
  expect(clone.status).toBe(201);
  expect(clone.body.status).toBe("DRAFT");
});

test("[mz-purchase-bills.3] bill API: approval posts one balanced journal exactly once, approved bills are immutable, bulk approve", { tags: ["feat:mz-purchase-bills", "shard:purchases-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  const d = await defaults(a);
  const vendor = (await a.api.post("/vendors", { name: seeded("Approval vendor") })).body.id;
  const bill = (await a.api.post("/bills", billBody(vendor, a.chart.rent, [{ quantity: "2", rate: "100", taxRate: "14" }]))).body;
  const rent0 = await acct(a.api, a.chart.rent), vat0 = await acct(a.api, d.defaultVatReceivableAccountId), ap0 = await acct(a.api, d.defaultApAccountId);

  expect((await b.api.post(`/bills/${bill.id}/approve`)).status).toBe(404);
  const approved = await a.api.post(`/bills/${bill.id}/approve`);
  expect(approved.status).toBe(201);
  expect([approved.body.status, dec(approved.body.balanceDue)]).toEqual(["OPEN", "228"]);
  expect(subDec((await acct(a.api, a.chart.rent)).debit, rent0.debit)).toBe("200"); // Dr expense
  expect(subDec((await acct(a.api, d.defaultVatReceivableAccountId)).debit, vat0.debit)).toBe("28"); // Dr VAT receivable
  expect(subDec((await acct(a.api, d.defaultApAccountId)).credit, ap0.credit)).toBe("228"); // Cr accounts payable
  const journal = await journalOf(a.api, "BILL_APPROVAL", bill.id);
  expect(journal.isPosted).toBe(true);
  expect(lineSig(journal.lines)).toEqual(lineSig([
    { accountId: a.chart.rent, debit: "200", credit: "0" },
    { accountId: d.defaultVatReceivableAccountId, debit: "28", credit: "0" },
    { accountId: d.defaultApAccountId, debit: "0", credit: "228" },
  ]));

  // a second approval is refused and posts nothing; concurrent approvals post exactly once
  expect([400, 409]).toContain((await a.api.post(`/bills/${bill.id}/approve`)).status);
  const raced = (await a.api.post("/bills", billBody(vendor, a.chart.rent, [{ quantity: "1", rate: "40" }]))).body.id;
  const results = await Promise.all([1, 2, 3].map(() => a.api.post(`/bills/${raced}/approve`)));
  expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  for (const r of results.filter((x) => x.status !== 201)) expect([400, 409]).toContain(r.status);
  expect(subDec((await acct(a.api, d.defaultApAccountId)).credit, ap0.credit)).toBe("268"); // 228 + 40, never twice

  // approved bills are immutable
  expect((await a.api.patch(`/bills/${bill.id}`, { notes: "tamper" })).status).toBe(400);
  expect((await a.api.del(`/bills/${bill.id}`)).status).toBe(400);

  // bulk approve reports per-bill outcomes
  const ok = (await a.api.post("/bills", billBody(vendor, a.chart.rent, [{ quantity: "4", rate: "10" }]))).body.id;
  const bulk = await a.api.post("/bills/bulk-approve", { ids: [ok, bill.id] });
  expect(bulk.status).toBe(201);
  expect(bulk.body).toMatchObject({ processed: 1, total: 2 });
  expect(bulk.body.failures.map((f: any) => f.id)).toEqual([bill.id]);
  expect((await a.api.get(`/bills/${ok}`)).body.status).toBe("OPEN");
});

test("[mz-purchase-payments.2] payments made API: partial payment journal, overpayment refused, void with linked reversal, bulk pay", { tags: ["feat:mz-purchase-payments", "shard:purchases-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  const d = await defaults(a);
  expect((await anon.get("/payments-made")).status).toBe(401);
  const vendor = (await a.api.post("/vendors", { name: seeded("Paid vendor") })).body.id;
  const approve = async (rate: string, qty = "1", taxRate?: string) => {
    const bill = (await a.api.post("/bills", billBody(vendor, a.chart.rent, [{ quantity: qty, rate, ...(taxRate ? { taxRate } : {}) }]))).body;
    expect((await a.api.post(`/bills/${bill.id}/approve`)).status).toBe(201);
    return bill;
  };
  const bill = await approve("100", "2", "14"); // 228
  const bank0 = await acct(a.api, d.defaultBankAccountId), ap0 = await acct(a.api, d.defaultApAccountId);
  const pay = await a.api.post("/payments-made", { vendorId: vendor, date: DATE.payment, amount: "100", paymentMode: "BANK_TRANSFER", paidFromAccountId: d.defaultBankAccountId, allocations: [{ billId: bill.id, amount: "100" }] });
  expect(pay.status).toBe(201);
  expect(pay.body.paymentNumber).toMatch(/^VPMT-\d+$/);
  const partial = (await a.api.get(`/bills/${bill.id}`)).body;
  expect([partial.status, dec(partial.balanceDue)]).toEqual(["PARTIALLY_PAID", "128"]);
  expect(subDec((await acct(a.api, d.defaultApAccountId)).debit, ap0.debit)).toBe("100"); // Dr AP
  expect(subDec((await acct(a.api, d.defaultBankAccountId)).credit, bank0.credit)).toBe("100"); // Cr bank
  const journal = await journalOf(a.api, "PAYMENT_MADE", pay.body.id);
  expect(lineSig(journal.lines)).toEqual(lineSig([{ accountId: d.defaultApAccountId, debit: "100", credit: "0" }, { accountId: d.defaultBankAccountId, debit: "0", credit: "100" }]));

  const over = await a.api.post("/payments-made", { vendorId: vendor, date: DATE.payment, amount: "200", paymentMode: "BANK_TRANSFER", paidFromAccountId: d.defaultBankAccountId, allocations: [{ billId: bill.id, amount: "200" }] });
  expect(over.status).toBe(400);
  expect(dec((await a.api.get(`/bills/${bill.id}`)).body.balanceDue)).toBe("128");
  expect(subDec((await acct(a.api, d.defaultBankAccountId)).credit, bank0.credit)).toBe("100");
  // another tenant cannot pay (or see) it
  expect((await b.api.get(`/payments-made/${pay.body.id}`)).status).toBe(404);
  expect((await b.api.del(`/payments-made/${pay.body.id}`)).status).toBe(404);

  const voided = await a.api.del(`/payments-made/${pay.body.id}`);
  expect(voided.status).toBe(200);
  const restored = (await a.api.get(`/bills/${bill.id}`)).body;
  expect([restored.status, dec(restored.balanceDue)]).toEqual(["OPEN", "228"]);
  expect((await journalOf(a.api, "PAYMENT_MADE_VOID", pay.body.id))?.reversalOfId).toBe(journal.id);
  expect((await a.api.del(`/payments-made/${pay.body.id}`)).status).toBe(404);

  // bulk pay: real payments from the organization's default bank, per-bill failures for drafts
  const b2 = await approve("135"), b3 = await approve("65");
  const draft = (await a.api.post("/bills", billBody(vendor, a.chart.rent, [{ quantity: "1", rate: "5" }]))).body.id;
  const bulk = await a.api.post("/bills/bulk-pay", { ids: [b2.id, b3.id, draft], paymentMode: "BANK_TRANSFER" });
  expect(bulk.status).toBe(201);
  expect(bulk.body).toMatchObject({ processed: 2, total: 3 });
  expect(bulk.body.failures.map((f: any) => f.id)).toEqual([draft]);
  for (const x of [b2, b3]) expect((await a.api.get(`/bills/${x.id}`)).body).toMatchObject({ status: "PAID" });
});

test("[mz-vendor-credits.2] vendor credit API: credit against a posted bill, apply, refund, void and guards", { tags: ["feat:mz-vendor-credits", "shard:purchases-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  const d = await defaults(a);
  expect((await anon.get("/vendor-credits")).status).toBe(401);
  const vendor = (await a.api.post("/vendors", { name: seeded("Credit vendor") })).body.id;
  const bill = (await a.api.post("/bills", billBody(vendor, a.chart.rent, [{ quantity: "2", rate: "100", taxRate: "14" }]))).body; // 228
  const draftCredit = await a.api.post("/vendor-credits", { vendorId: vendor, billId: bill.id, date: DATE.payment, reason: "Returned goods", amount: "50" });
  expect(draftCredit.status).toBe(400); // only against a posted bill
  expect((await a.api.post(`/bills/${bill.id}/approve`)).status).toBe(201);

  const ap0 = await acct(a.api, d.defaultApAccountId);
  const credit = await a.api.post("/vendor-credits", { vendorId: vendor, billId: bill.id, date: DATE.payment, reason: "Returned goods", amount: "57" });
  expect(credit.status).toBe(201);
  expect(credit.body.creditNumber).toBeTruthy();
  expect(dec(credit.body.amount)).toBe("57");
  expect(subDec((await acct(a.api, d.defaultApAccountId)).debit, ap0.debit)).toBe("57"); // Dr AP
  const journal = await journalOf(a.api, "VENDOR_CREDIT", credit.body.id);
  expect(journal).toBeDefined();
  expect(dec(journal.totalDebit)).toBe(dec(journal.totalCredit));

  expect((await a.api.post("/vendor-credits", { vendorId: vendor, billId: bill.id, amount: "1.00001" })).status).toBe(400);
  expect((await a.api.post("/vendor-credits", { vendorId: vendor, billId: "nope", amount: "1" })).status).toBe(400);
  expect((await b.api.get(`/vendor-credits/${credit.body.id}`)).status).toBe(404);
  expect((await b.api.post(`/vendor-credits/${credit.body.id}/apply-to-bill`, { billId: bill.id })).status).toBe(404);
  const accounts = await a.api.get("/vendor-credits/refund-accounts");
  expect(accounts.status).toBe(200);
  expect(ids(accounts)).toContain(d.defaultBankAccountId);

  // apply the credit to the bill it was issued against: balance drops by the credit
  const applied = await a.api.post(`/vendor-credits/${credit.body.id}/apply-to-bill`, { billId: bill.id });
  expect([200, 201]).toContain(applied.status);
  expect(dec((await a.api.get(`/bills/${bill.id}`)).body.balanceDue)).toBe("171");
  expect((await a.api.post(`/vendor-credits/${credit.body.id}/apply-to-bill`, { billId: bill.id })).status).toBe(400); // already applied
  expect((await a.api.post(`/vendor-credits/${credit.body.id}/refund`, { bankAccountId: d.defaultBankAccountId })).status).toBe(400); // an applied credit cannot be refunded

  // a second credit is refunded in cash instead
  const second = (await a.api.post("/vendor-credits", { vendorId: vendor, billId: bill.id, date: DATE.payment, reason: "Price adjustment", amount: "11.40" })).body;
  const bank0 = await acct(a.api, d.defaultBankAccountId);
  const refund = await a.api.post(`/vendor-credits/${second.id}/refund`, { bankAccountId: d.defaultBankAccountId });
  expect([200, 201]).toContain(refund.status);
  expect(subDec((await acct(a.api, d.defaultBankAccountId)).debit, bank0.debit)).toBe("11.4"); // Dr bank
  expect((await a.api.post(`/vendor-credits/${second.id}/refund`, { bankAccountId: d.defaultBankAccountId })).status).toBe(400);

  // an unapplied, unrefunded credit can be voided (deleted)
  const third = (await a.api.post("/vendor-credits", { vendorId: vendor, billId: bill.id, date: DATE.payment, reason: "Typo", amount: "1" })).body;
  expect((await a.api.del(`/vendor-credits/${third.id}`)).status).toBe(200);
  expect((await a.api.del(`/vendor-credits/${third.id}`)).status).toBe(404);
});

test("[mz-expenses.2] expense API: net/VAT/gross arithmetic, journal against the paid-through account, void, validation", { tags: ["feat:mz-expenses", "shard:purchases-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  const d = await defaults(a);
  expect((await anon.get("/expenses")).status).toBe(401);
  const body = (over: Record<string, unknown> = {}) => ({ date: DATE.doc, accountId: a.chart.rent, amount: "100.00", taxRate: "14", paidThroughAccountId: d.defaultBankAccountId, description: seeded("Expense API"), ...over });
  const rent0 = await acct(a.api, a.chart.rent), vat0 = await acct(a.api, d.defaultVatReceivableAccountId), bank0 = await acct(a.api, d.defaultBankAccountId);
  const e = await a.api.post("/expenses", body());
  expect(e.status).toBe(201);
  expect(e.body.status).toBe("POSTED");
  expect([dec(e.body.amount), dec(e.body.taxAmount)]).toEqual(["100", "14"]);
  expect(subDec((await acct(a.api, a.chart.rent)).debit, rent0.debit)).toBe("100");
  expect(subDec((await acct(a.api, d.defaultVatReceivableAccountId)).debit, vat0.debit)).toBe("14");
  expect(subDec((await acct(a.api, d.defaultBankAccountId)).credit, bank0.credit)).toBe("114");
  const journal = await journalOf(a.api, "EXPENSE", e.body.id);
  expect(lineSig(journal.lines)).toEqual(lineSig([
    { accountId: a.chart.rent, debit: "100", credit: "0" }, { accountId: d.defaultVatReceivableAccountId, debit: "14", credit: "0" }, { accountId: d.defaultBankAccountId, debit: "0", credit: "114" },
  ]));

  // tax-inclusive entry: 114 gross at 14% is 100 net + 14 VAT
  const inclusive = await a.api.post("/expenses", body({ amount: "114.00", taxInclusive: true }));
  expect(inclusive.status).toBe(201);
  expect([dec(inclusive.body.amount), dec(inclusive.body.taxAmount)]).toEqual(["100", "14"]);
  const noTax = await a.api.post("/expenses", body({ taxRate: undefined, amount: "33.33" }));
  expect([dec(noTax.body.amount), dec(noTax.body.taxAmount)]).toEqual(["33.33", "0"]);

  // validation and references
  expect((await a.api.post("/expenses", body({ amount: "0" }))).status).toBe(400);
  expect((await a.api.post("/expenses", body({ taxRate: "101" }))).status).toBe(400);
  expect((await a.api.post("/expenses", body({ accountId: d.defaultArAccountId }))).status).toBe(400); // not an expense account
  expect((await a.api.post("/expenses", body({ paidThroughAccountId: a.chart.rent }))).status).toBe(400); // not a bank/cash account
  expect((await b.api.post("/expenses", body())).status).toBe(400); // another tenant's accounts
  const lookups = await a.api.get("/expenses/expense-accounts");
  expect(lookups.status).toBe(200);
  expect(ids(lookups)).toContain(a.chart.rent);
  expect(ids(await a.api.get("/expenses/paid-through-accounts"))).toContain(d.defaultBankAccountId);

  // void
  expect((await b.api.get(`/expenses/${e.body.id}`)).status).toBe(404);
  expect((await b.api.del(`/expenses/${e.body.id}`)).status).toBe(404);
  const voided = await a.api.del(`/expenses/${e.body.id}`);
  expect(voided.status).toBe(200);
  expect(subDec((await acct(a.api, a.chart.rent)).credit, rent0.credit)).toBe("100"); // reversal brings the expense account back
  expect((await a.api.del(`/expenses/${e.body.id}`)).status).toBe(404);
});
