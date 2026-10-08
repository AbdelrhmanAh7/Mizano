// Banking + fixed assets: bank accounts, bank transactions (manual + statement import), reconciliation, bank rules, fixed assets and depreciation.
//   shard ui-banking  : browser tests on the seeded demo org
//   shard banking-api : request-level tests on fresh tenants (reconciliation posts real payments, depreciation journals, isolation)
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { needsModel } from "../lib.ts";
import { DATE, acct, adminApi, anon, dec, ensureAccount, h1, ids, invoiceBody, journalOf, ledgerTenant, lineSig, rows, seeded, signIn, subDec } from "./_mz.e2e.ts";

const A = () => ledgerTenant("banking");
const B = () => ledgerTenant("banking-b");

async function arabic({ app, screen, browser }: any, path: string, title?: string) {
  await app.open(path);
  if (title) await expect(h1(screen, title)).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
}
const csv = (lines: string[]) => lines.join("\n") + "\n";

// ───────────────────────────────────────────── ui ─────────────────────────────────────────────
test("[mz-bank-accounts.1] create a bank account through the form and find it in the bank accounts list", { tags: ["feat:mz-bank-accounts", "shard:ui-banking", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  const name = seeded("Bank account");
  await signIn(fx, "/en/banking/accounts/new");
  await expect(h1(screen, "New Bank Account")).toBeVisible({ timeout: 90_000 });
  await agent.act("fill the new bank account form with the name {name}, type Bank, and choose the first available linked ledger account; then press the save / create button. The step is complete once save was pressed, even if the app then shows another page", { params: { name }, maxModelCalls: 16 });
  const api = await adminApi();
  await expect.poll(async () => rows(await api.get("/bank-accounts", { limit: 100 })).some((b) => b.name === name), { timeout: 30_000 }).toBe(true);
  await app.open("/en/banking/accounts");
  await expect(h1(screen, "Bank Accounts")).toBeVisible({ timeout: 60_000 });
  await agent.waitFor("the bank accounts list has finished loading and lists 'Business Checking', 'Petty Cash' and 'Business Credit Card'");
  await arabic(fx, "/ar/banking/accounts", "الحسابات البنكية");
});

test("[mz-bank-transactions.1] the bank transactions page lists the seeded transactions with their reconciliation status", { tags: ["feat:mz-bank-transactions", "shard:ui-banking", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { agent, screen } = fx;
  await signIn(fx, "/en/banking/transactions");
  await expect(h1(screen, "Bank Transactions")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the bank transactions table has finished loading and lists transactions with dates, descriptions, deposit or withdrawal amounts and a status");
  await arabic(fx, "/ar/banking/transactions", "المعاملات البنكية");
});

test("[mz-bank-reconciliation.1] the reconciliation page shows the unmatched transactions of a bank account with match suggestions", { tags: ["feat:mz-bank-reconciliation", "shard:ui-banking", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { agent, screen } = fx;
  await signIn(fx, "/en/banking/reconcile");
  await expect(h1(screen, "Bank Reconciliation")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the reconciliation page has finished loading and shows bank accounts or the transactions to reconcile (matched / unmatched counts)");
  await agent.act("open the reconciliation of the account 'Business Checking' if the page lists bank accounts to choose from", { maxModelCalls: 10 });
  await agent.assert("the page shows reconciliation progress for a bank account (matched and unmatched transactions) or a list of pending transactions with suggested matches");
  await arabic(fx, "/ar/banking/reconcile", "التسوية البنكية");
});

test("[mz-bank-rules.1] the bank rules page shows the seeded rules and the new rule form opens", { tags: ["feat:mz-bank-rules", "shard:ui-banking", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/banking/rules");
  await expect(h1(screen, "Bank Rules")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the rules list has finished loading and lists 'Match Nile Tech deposits' and 'Rent payments'");
  await app.open("/en/banking/rules/new");
  await expect(h1(screen, "New Bank Rule")).toBeVisible({ timeout: 60_000 });
  await agent.assert("a rule form is shown with a name, conditions (field, operator, value) and an action");
  await arabic(fx, "/ar/banking/rules", "قواعد البنك");
});

test("[mz-fixed-assets.1] the fixed assets page lists the seeded assets and the new asset form opens", { tags: ["feat:mz-fixed-assets", "shard:ui-banking", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/assets");
  await expect(h1(screen, "Fixed Assets")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the assets list has finished loading and lists 'Dell Server Rack' (FA-001) and 'Office Furniture Set' (FA-002) with book values");
  await app.open("/en/assets/new");
  await expect(h1(screen, "New Fixed Asset")).toBeVisible({ timeout: 60_000 });
  await agent.assert("an asset form is shown with a name, an asset type, a purchase date, a purchase price, a salvage value, a useful life and ledger accounts");
  await arabic(fx, "/ar/assets", "الأصول الثابتة");
});

// ───────────────────────────────────────────── api ─────────────────────────────────────────────
test("[mz-bank-accounts.2] bank account API: create linked to a ledger account, validation, opening-balance rule, update, delete, isolation", { tags: ["feat:mz-bank-accounts", "shard:banking-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/bank-accounts")).status).toBe(401);
  expect((await anon.post("/bank-accounts", {})).status).toBe(401);
  const name = seeded("Bank API");
  const created = await a.api.post("/bank-accounts", { name, accountNumber: "5678", currency: "USD", type: "BANK", linkedAccountId: a.chart.bank });
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject({ name, linkedAccountId: a.chart.bank, type: "BANK" });
  const id = created.body.id as string;
  expect((await a.api.post("/bank-accounts", { name: "Funded", currency: "USD", type: "BANK", openingBalance: "1000.00", linkedAccountId: a.chart.cash })).status).toBe(400); // opening balances go through Opening Balances
  expect((await a.api.post("/bank-accounts", { name: "Bad type", type: "CHECKING", linkedAccountId: a.chart.bank })).status).toBe(400);
  expect((await a.api.post("/bank-accounts", { type: "BANK", linkedAccountId: a.chart.bank })).status).toBe(400);
  expect((await a.api.post("/bank-accounts", { name: "Foreign link", currency: "USD", type: "BANK", linkedAccountId: b.chart.bank })).status).toBe(400);
  expect(ids(await a.api.get("/bank-accounts"))).toContain(id);
  expect((await a.api.get(`/bank-accounts/${id}`)).body.id).toBe(id);
  expect((await a.api.patch(`/bank-accounts/${id}`, { name: `${name} v2` })).body.name).toBe(`${name} v2`);
  const stats = await a.api.get("/bank-accounts/stats");
  expect(stats.status).toBe(200);
  expect((await a.api.get(`/bank-accounts/${id}/balance-history`)).status).toBe(200);
  expect((await a.api.get(`/bank-accounts/${id}/transactions`)).status).toBe(200);
  // isolation
  expect((await b.api.get(`/bank-accounts/${id}`)).status).toBe(404);
  expect((await b.api.patch(`/bank-accounts/${id}`, { name: "Hijacked" })).status).toBe(404);
  expect((await b.api.del(`/bank-accounts/${id}`)).status).toBe(404);
  expect(ids(await b.api.get("/bank-accounts"))).not.toContain(id);
  expect((await a.api.del(`/bank-accounts/${id}`)).status).toBe(200);
  expect((await a.api.get(`/bank-accounts/${id}`)).status).toBe(404);
});

test("[mz-bank-transactions.2] bank transaction API: manual entry, bulk import, CSV statement import with de-duplication, isolation", { tags: ["feat:mz-bank-transactions", "shard:banking-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/bank-transactions")).status).toBe(401);
  const account = (await a.api.post("/bank-accounts", { name: seeded("Bank tx"), currency: "USD", type: "BANK", linkedAccountId: a.chart.bank })).body.id;
  const bAccount = (await b.api.post("/bank-accounts", { name: seeded("Bank tx B"), currency: "USD", type: "BANK", linkedAccountId: b.chart.bank })).body.id;
  const dep = await a.api.post("/bank-transactions", { bankAccountId: account, date: DATE.doc, type: "DEPOSIT", amount: "250.50", description: seeded("deposit"), payee: "Nile Tech" });
  expect(dep.status).toBe(201);
  expect(dec(dep.body.amount)).toBe("250.5");
  expect(dep.body.status).toBe("PENDING");
  expect((await a.api.get(`/bank-transactions/${dep.body.id}`)).status).toBe(200);
  await expect.poll(async () => ids(await a.api.get("/bank-transactions", { bankAccountId: account })), { timeout: 20_000 }).toContain(dep.body.id);
  expect(ids(await a.api.get("/bank-transactions/unmatched", { bankAccountId: account }))).toContain(dep.body.id);
  expect((await a.api.post("/bank-transactions", { bankAccountId: "does-not-exist", date: DATE.doc, type: "DEPOSIT", amount: "1.00" })).status).toBe(400);
  expect((await a.api.post("/bank-transactions", { bankAccountId: account, date: DATE.doc, type: "TRANSFER", amount: "1.00" })).status).toBe(400);
  expect((await a.api.post("/bank-transactions", { bankAccountId: bAccount, date: DATE.doc, type: "DEPOSIT", amount: "1.00" })).status).toBe(400); // another tenant's account
  expect((await b.api.get(`/bank-transactions/${dep.body.id}`)).status).toBe(404);
  expect(rows(await b.api.get("/bank-transactions")).map((x: any) => x.id)).not.toContain(dep.body.id);

  const bulk = await a.api.post("/bank-transactions/import", { bankAccountId: account, transactions: [
    { date: DATE.doc, type: "DEPOSIT", amount: "10.00", description: "bulk deposit" }, { date: DATE.doc, type: "WITHDRAWAL", amount: "4.25", description: "bulk withdrawal" }] });
  expect([200, 201]).toContain(bulk.status);
  expect((await b.api.post("/bank-transactions/import", { bankAccountId: account, transactions: [{ date: DATE.doc, type: "DEPOSIT", amount: "1.00", description: "foreign import" }] })).status).toBe(400);

  // statement file import: columns are auto-detected, repeated rows are not imported twice
  const file = csv(["Date,Description,Amount", `2026-03-01,${seeded("Statement salary")},1500.00`, `2026-03-02,${seeded("Statement rent")},-300.75`]);
  const imported = await a.api.upload("/bank-transactions/import-statement", { name: "statement.csv", type: "text/csv", data: file }, { bankAccountId: account });
  expect(imported.status).toBe(201);
  expect(imported.body).toMatchObject({ imported: 2, duplicates: 0, total: 2 });
  const again = await a.api.upload("/bank-transactions/import-statement", { name: "statement.csv", type: "text/csv", data: file }, { bankAccountId: account });
  expect(again.body).toMatchObject({ imported: 0, duplicates: 2 });
  expect((await a.api.upload("/bank-transactions/import-statement", { name: "statement.txt", type: "text/plain", data: "x" }, { bankAccountId: account })).status).toBe(400);
  expect((await a.api.upload("/bank-transactions/import-statement", { name: "statement.csv", type: "text/csv", data: file }, {})).status).toBe(400);
  expect((await b.api.upload("/bank-transactions/import-statement", { name: "statement.csv", type: "text/csv", data: file }, { bankAccountId: account })).status).toBe(404);
  const rowsAfter = rows(await a.api.get("/bank-transactions", { bankAccountId: account, limit: 100 }));
  const salary = rowsAfter.find((t: any) => String(t.description).includes(seeded("Statement salary")));
  const rent = rowsAfter.find((t: any) => String(t.description).includes(seeded("Statement rent")));
  expect([salary?.type, dec(salary?.amount)]).toEqual(["DEPOSIT", "1500"]);
  expect([rent?.type, dec(rent?.amount)]).toEqual(["WITHDRAWAL", "300.75"]);
  expect((await a.api.get("/bank-transactions/cursor", { take: 3 })).status).toBe(200);
});

test("[mz-bank-reconciliation.2] reconciliation API: a confirmed match posts a real customer payment once; a withdrawal becomes a posted expense", { tags: ["feat:mz-bank-reconciliation", "shard:banking-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/reconciliation/summary/x")).status).toBe(401);
  const bank = (await a.api.post("/bank-accounts", { name: seeded("Bank recon"), currency: "USD", type: "BANK", linkedAccountId: a.chart.bank })).body.id;
  const customer = (await a.api.post("/customers", { name: seeded("Recon customer"), currency: "USD" })).body.id;
  const inv = (await a.api.post("/invoices", invoiceBody(customer, [{ quantity: "2", rate: "100", taxRate: "14" }]))).body; // 228
  expect((await a.api.patch(`/invoices/${inv.id}/send`)).status).toBe(200);
  const dep = (await a.api.post("/bank-transactions", { bankAccountId: bank, date: DATE.payment, type: "DEPOSIT", amount: "228.00", description: `Payment ${inv.invoiceNumber}`, reference: inv.invoiceNumber })).body;
  const wd = (await a.api.post("/bank-transactions", { bankAccountId: bank, date: DATE.payment, type: "WITHDRAWAL", amount: "75.50", description: seeded("Office rent") })).body;

  const summary0 = await a.api.get(`/reconciliation/summary/${bank}`);
  expect(summary0.status).toBe(200);
  expect(summary0.body).toMatchObject({ total: 2, pending: 2, matched: 0, created: 0 });
  const suggestions = await a.api.get(`/reconciliation/suggestions/${bank}`);
  expect(suggestions.status).toBe(200);
  const forDeposit = suggestions.body.find((s: any) => s.transaction.id === dep.id);
  expect(forDeposit.matches[0]).toMatchObject({ type: "invoice", confidence: 100 });
  expect(forDeposit.matches[0].entity.id).toBe(inv.id);

  // wrong direction / kind is refused before anything posts; tenant B cannot touch it
  expect((await a.api.post("/reconciliation/confirm", { transactionId: wd.id, entityType: "invoice", entityId: inv.id })).status).toBe(400);
  expect((await a.api.post("/reconciliation/confirm", { transactionId: dep.id, entityType: "customer", entityId: inv.id })).status).toBe(400);
  expect((await b.api.post("/reconciliation/confirm", { transactionId: dep.id, entityType: "invoice", entityId: inv.id })).status).toBe(404);
  expect(dec((await a.api.get(`/invoices/${inv.id}`)).body.balanceDue)).toBe("228");

  const bank0 = await acct(a.api, a.chart.bank);
  const confirmed = await a.api.post("/reconciliation/confirm", { transactionId: dep.id, entityType: "invoice", entityId: inv.id });
  expect(confirmed.status).toBe(201);
  expect(confirmed.body.message).toBe("Reconciliation confirmed");
  const paid = (await a.api.get(`/invoices/${inv.id}`)).body;
  expect([paid.status, dec(paid.balanceDue)]).toEqual(["PAID", "0"]);
  expect(subDec((await acct(a.api, a.chart.bank)).debit, bank0.debit)).toBe("228"); // Dr bank
  expect((await a.api.get(`/bank-transactions/${dep.id}`)).body.status).toBe("MATCHED");
  expect((await a.api.post("/reconciliation/confirm", { transactionId: dep.id, entityType: "invoice", entityId: inv.id })).status).toBe(400); // exactly once

  const rent0 = await acct(a.api, a.chart.rent);
  const expense = await a.api.post("/reconciliation/create-expense", { transactionId: wd.id, accountId: a.chart.rent });
  expect(expense.status).toBe(201);
  expect(subDec((await acct(a.api, a.chart.rent)).debit, rent0.debit)).toBe("75.5");
  expect((await a.api.get(`/bank-transactions/${wd.id}`)).body.status).toBe("CREATED");
  expect((await a.api.post("/reconciliation/create-expense", { transactionId: wd.id, accountId: a.chart.rent })).status).toBe(400);
  expect((await a.api.post("/reconciliation/create-expense", { transactionId: dep.id, accountId: a.chart.rent })).status).toBe(400); // only withdrawals
  const summary1 = await a.api.get(`/reconciliation/summary/${bank}`);
  expect(summary1.body).toMatchObject({ total: 2, pending: 0, matched: 1, created: 1, reconciliationRate: 100 });
});

test("[mz-bank-rules.2] bank rule API: create, test a rule against a transaction, update, reorder, delete, isolation", { tags: ["feat:mz-bank-rules", "shard:banking-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/bank-rules")).status).toBe(401);
  const conditions = [{ field: "description", operator: "contains", value: "AMAZON" }, { field: "amount", operator: "greaterThan", value: "100" }];
  const created = await a.api.post("/bank-rules", { name: seeded("Rule"), conditions, action: { description: "Cloud services" }, isActive: true });
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  expect((await a.api.post("/bank-rules", { conditions })).status).toBe(400);
  expect((await a.api.post("/bank-rules", { name: "bad conditions", conditions: "nope" })).status).toBe(400);
  const hit = await a.api.post("/bank-rules/test", { conditions, transaction: { description: "AWS via Amazon Web Services", amount: "250.00" } });
  expect(hit.status).toBe(201);
  expect(hit.body).toEqual({ matches: true, matchedConditions: [0, 1] });
  const partial = await a.api.post("/bank-rules/test", { conditions, transaction: { description: "Amazon", amount: "50" } });
  expect(partial.body).toEqual({ matches: false, matchedConditions: [0] });
  const miss = await a.api.post("/bank-rules/test", { conditions, transaction: { description: "Coffee", amount: "5" } });
  expect(miss.body.matches).toBe(false);
  expect((await a.api.get(`/bank-rules/${id}`)).body.name).toBe(seeded("Rule"));
  expect((await a.api.patch(`/bank-rules/${id}`, { isActive: false })).body.isActive).toBe(false);
  expect(ids(await a.api.get("/bank-rules"))).toContain(id);
  expect((await a.api.post("/bank-rules/reorder", { ids: [id] })).status).toBe(201);
  expect((await a.api.post("/bank-rules/reorder", { ids: [id, "ghost"] })).status).toBe(404);
  expect((await b.api.get(`/bank-rules/${id}`)).status).toBe(404);
  expect((await b.api.patch(`/bank-rules/${id}`, { name: "Hijacked" })).status).toBe(404);
  expect((await b.api.del(`/bank-rules/${id}`)).status).toBe(404);
  expect((await b.api.post("/bank-rules/reorder", { ids: [id] })).status).toBe(404);
  expect(ids(await b.api.get("/bank-rules"))).not.toContain(id);
  expect((await a.api.del(`/bank-rules/${id}`)).status).toBe(200);
  expect((await a.api.get(`/bank-rules/${id}`)).status).toBe(404);

  // an active rule is applied to imported statement rows
  const account = (await a.api.post("/bank-accounts", { name: seeded("Bank rule apply"), currency: "USD", type: "BANK", linkedAccountId: a.chart.bank })).body.id;
  const rule = await a.api.post("/bank-rules", { name: seeded("Apply rule"), bankAccountId: account, conditions: [{ field: "description", operator: "contains", value: "ZZRULE" }], action: { description: "Categorised by rule" } });
  expect(rule.status).toBe(201);
  const imported = await a.api.upload("/bank-transactions/import-statement", { name: "rule.csv", type: "text/csv", data: csv(["Date,Description,Amount", "2026-03-03,ZZRULE shop,-12.00"]) }, { bankAccountId: account });
  expect(imported.body).toMatchObject({ imported: 1, rulesApplied: 1 });
});

test("[mz-fixed-assets.2] fixed asset API: create with schedule, validation, update, dispose with journal, delete rules, isolation", { tags: ["feat:mz-fixed-assets", "shard:banking-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/assets")).status).toBe(401);
  const fixed = await ensureAccount(a, "1590", "E2E Fixed Assets", "ASSET");
  const accum = await ensureAccount(a, "1599", "E2E Accumulated Depreciation", "ASSET");
  const expense = await ensureAccount(a, "5290", "E2E Depreciation Expense", "EXPENSE");
  const body = { name: seeded("Asset"), assetType: "ELECTRONICS", purchaseDate: "2025-01-15", purchasePrice: 12000, salvageValue: 2000, usefulLifeYears: 5, assetAccountId: fixed, depreciationAccountId: expense, accumulatedDeprAccountId: accum };
  const created = await a.api.post("/assets", body);
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  expect(created.body.assetNumber).toMatch(/^FA-\d+$/);
  const schedule = await a.api.get(`/assets/${id}/schedule`);
  expect(schedule.status).toBe(200);
  expect(schedule.body).toHaveLength(60); // 5 years, monthly
  expect(Number(schedule.body[0].amount)).toBeCloseTo(166.67, 2); // (12000 - 2000) / 60
  expect(Number(schedule.body.at(-1).bookValue)).toBeCloseTo(2000, 2);

  for (const bad of [{ purchasePrice: -1 }, { usefulLifeYears: 0 }, { usefulLifeYears: 101 }, { assetType: "SPACESHIP" }, { name: undefined }]) {
    expect((await a.api.post("/assets", { ...body, ...bad })).status).toBe(400);
  }
  expect((await a.api.post("/assets", { ...body, assetAccountId: b.chart.bank })).status).toBeGreaterThanOrEqual(400); // another tenant's account
  expect((await a.api.post("/assets", { ...body, assetAccountId: b.chart.bank })).status).toBeLessThan(500);
  expect(ids(await a.api.get("/assets"))).toContain(id);
  expect((await a.api.get(`/assets/${id}`)).body.id).toBe(id);
  expect((await a.api.put(`/assets/${id}`, { name: seeded("Asset v2"), usefulLifeYears: 4 })).status).toBe(200);
  const summary = await a.api.get("/assets/summary");
  expect(summary.status).toBe(200);
  expect((await a.api.get("/assets/depreciation/forecast", { months: 6 })).status).toBe(200);
  expect((await b.api.get(`/assets/${id}`)).status).toBe(404);
  expect((await b.api.put(`/assets/${id}`, { name: "Hijacked" })).status).toBe(404);
  expect((await b.api.post(`/assets/${id}/dispose`, { disposalDate: DATE.doc, disposalAmount: 1 })).status).toBe(404);
  expect((await b.api.del(`/assets/${id}`)).status).toBe(404);
  expect(ids(await b.api.get("/assets"))).not.toContain(id);

  const disposed = await a.api.post(`/assets/${id}/dispose`, { disposalDate: DATE.doc, disposalAmount: 8000 });
  expect(disposed.status).toBe(200);
  expect(disposed.body.status).toMatch(/DISPOSED|SOLD/);
  expect((await a.api.post(`/assets/${id}/dispose`, { disposalDate: DATE.doc, disposalAmount: 1 })).status).toBe(400);
  expect((await a.api.put(`/assets/${id}`, { name: "late edit" })).status).toBe(400);
  const spare = (await a.api.post("/assets", { ...body, name: seeded("Spare asset") })).body.id;
  expect((await a.api.del(`/assets/${spare}`)).status).toBe(204);
  expect((await a.api.get(`/assets/${spare}`)).status).toBe(404);
});

test("[mz-asset-depreciation.1] depreciation job: running the monthly depreciation posts one balanced journal per active asset and is not repeated", { tags: ["feat:mz-asset-depreciation", "shard:banking-api", "lvl:api"] }, async () => {
  // The monthly @Cron has no HTTP hook of its own; POST /assets/depreciation/run is the same runMonthlyDepreciation(organization) call.
  const a = await ledgerTenant("banking-dep");
  const fixed = await ensureAccount(a, "1590", "E2E Fixed Assets", "ASSET");
  const accum = await ensureAccount(a, "1599", "E2E Accumulated Depreciation", "ASSET");
  const expense = await ensureAccount(a, "5290", "E2E Depreciation Expense", "EXPENSE");
  const asset = (await a.api.post("/assets", { name: seeded("Dep asset"), assetType: "MACHINERY", purchaseDate: "2025-01-15", purchasePrice: 12000, salvageValue: 0, usefulLifeYears: 10, assetAccountId: fixed, depreciationAccountId: expense, accumulatedDeprAccountId: accum })).body;
  expect(asset.id).toBeTruthy();
  const before = await acct(a.api, expense);
  const run = await a.api.post("/assets/depreciation/run");
  expect(run.status).toBe(200);
  expect(run.body.processed).toBeGreaterThanOrEqual(1);
  expect(run.body.journalsCreated).toBe(run.body.processed);
  const after = await acct(a.api, expense);
  expect(subDec(after.debit, before.debit)).toBe("100"); // 12000 / 120 months
  expect(subDec((await acct(a.api, accum)).credit, "0")).toBe("100");
  const again = await a.api.post("/assets/depreciation/run");
  expect(again.status).toBe(200);
  expect(again.body.journalsCreated).toBe(0); // the month is already depreciated
  expect(subDec((await acct(a.api, expense)).debit, before.debit)).toBe("100");
  // an unscheduled period is a client error, not a crash
  const none = await a.api.post(`/assets/${asset.id}/depreciate`, undefined, { month: 1, year: 2000 });
  expect(none.status).toBeGreaterThanOrEqual(400);
  expect(none.status).toBeLessThan(500);
});
