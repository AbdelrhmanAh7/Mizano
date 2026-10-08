// Accounting core + tax features: chart of accounts, journals, recurring journals, trial balance, general ledger, tax rates, VAT returns, VAT payments.
//   shards ui-accounting / ui-tax : browser tests on the seeded demo org
//   shard  ledger-api             : request-level tests on freshly registered tenants (double entry, immutability, VAT arithmetic, isolation)
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { needsModel, seededInt } from "../lib.ts";
import { DATE, acct, adminApi, anon, dec, defaults, ensureAccount, h1, ids, journalOf, ledgerTenant, lineSig, rows, seeded, signIn, subDec, sumDec, tenant, uuidFrom } from "./_mz.e2e.ts";

const L = () => ledgerTenant("ledger");
const LB = () => ledgerTenant("ledger-b");

async function arabic({ app, screen, browser }: any, path: string, title: string) {
  await app.open(path);
  await expect(h1(screen, title)).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
}
const journalBody = (a: string, b: string, amount: string, over: Record<string, unknown> = {}) => ({
  date: DATE.doc, reference: seeded("JRN"), lines: [{ accountId: a, debit: amount, description: "debit side" }, { accountId: b, credit: amount }], ...over,
});

// ───────────────────────────────────────────── ui: accounting ─────────────────────────────────────────────
test("[mz-chart-of-accounts.1] the chart of accounts lists the seeded accounts and a new account can be added", { tags: ["feat:mz-chart-of-accounts", "shard:ui-accounting", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  const code = String(seededInt("ui-account-code", 9000, 9899));
  const name = seeded("Account");
  await signIn(fx, "/en/accounting/accounts");
  await expect(h1(screen, "Chart of Accounts")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the chart of accounts has finished loading and shows accounts such as 'Cash', 'Accounts Receivable' and 'Sales Revenue' with their codes");
  await agent.act("add a new account: press the button that adds an account, enter the code {code} and the name {name}, choose the type Expense if a type must be chosen, then save. The step is complete once save was pressed", { params: { code, name }, maxModelCalls: 14 });
  const api = await adminApi();
  await expect.poll(async () => rows(await api.get("/accounts", { search: name, limit: 50 })).some((a) => a.name === name), { timeout: 30_000 }).toBe(true);
  await arabic(fx, "/ar/accounting/accounts", "دليل الحسابات");
});

test("[mz-journals.1] post a balanced manual journal entry through the form and find it in the journal list", { tags: ["feat:mz-journals", "shard:ui-accounting", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  const reference = seeded("e2e-army entry");
  await signIn(fx, "/en/accounting/journals/new");
  await expect(h1(screen, "New Journal Entry")).toBeVisible({ timeout: 90_000 });
  await agent.act("fill the manual journal entry: reference or description {reference}, one line debiting any account 50 and one line crediting another account 50, then press the create/save button. The step is complete once the button was pressed, even if the app then shows another page", { params: { reference }, maxModelCalls: 16 });
  const api = await adminApi();
  await expect.poll(async () => { const j = rows(await api.get("/journals", { search: reference })).find((x) => x.reference === reference || x.notes === reference); return j ? [dec(j.totalDebit), dec(j.totalCredit)].join("/") : null; }, { timeout: 30_000 }).toBe("50/50");
  await app.open("/en/accounting/journals");
  await expect(h1(screen, "Journal Entries")).toBeVisible({ timeout: 60_000 });
  await agent.waitFor("the journal entries list has finished loading and lists entries with numbers, dates and totals");
  await arabic(fx, "/ar/accounting/journals", "قيود اليومية");
});

test("[mz-recurring-journals.1] the recurring profiles list shows the seeded profile and the new profile form opens", { tags: ["feat:mz-recurring-journals", "shard:ui-accounting", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/accounting/recurring");
  await expect(h1(screen, "Recurring Profiles")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the recurring profiles list has finished loading and lists at least one profile with a frequency and a next run date");
  await app.open("/en/accounting/recurring/new");
  await expect(h1(screen, "New Recurring Profile")).toBeVisible({ timeout: 60_000 });
  await agent.assert("a form is shown to create a recurring profile with a name, a frequency, a start date and template lines");
  await arabic(fx, "/ar/accounting/recurring", "الملفات المتكررة");
});

test("[mz-trial-balance.1] the trial balance page shows debit and credit totals that are equal", { tags: ["feat:mz-trial-balance", "shard:ui-accounting", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { agent, screen } = fx;
  await signIn(fx, "/en/accounting/trial-balance");
  await expect(h1(screen, "Trial Balance")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the trial balance table has finished loading and shows accounts with debit and credit columns and a totals row");
  await agent.assert("the total of the debit column equals the total of the credit column of the trial balance");
  await arabic(fx, "/ar/reports/trial-balance", "ميزان المراجعة");
});

test("[mz-general-ledger.1] the general ledger page lists the movements of a chosen account", { tags: ["feat:mz-general-ledger", "shard:ui-accounting", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { agent, screen } = fx;
  await signIn(fx, "/en/accounting/general-ledger");
  await expect(h1(screen, "General Ledger")).toBeVisible({ timeout: 90_000 });
  await agent.act("choose the account 'Accounts Receivable' (code 1200) in the account selector and show its ledger if a button must be pressed", { maxModelCalls: 12 });
  await agent.waitFor("the general ledger shows posted lines (date, journal, debit, credit and a running balance) for Accounts Receivable");
  await arabic(fx, "/ar/reports/general-ledger", "دفتر الأستاذ العام");
});

// ───────────────────────────────────────────── ui: tax ─────────────────────────────────────────────
test("[mz-tax-rates.1] the tax rates page lists the seeded rates and a new rate can be created", { tags: ["feat:mz-tax-rates", "shard:ui-tax", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { agent, screen } = fx;
  const name = seeded("Tax rate");
  await signIn(fx, "/en/tax/rates");
  await expect(h1(screen, "Tax Rates")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the tax rates list has finished loading and lists the seeded rates with their percentages");
  await agent.act("create a new tax rate: press the button that adds a tax rate, enter the name {name} and the rate 7, choose any linked account if one must be chosen, then save. The step is complete once save was pressed", { params: { name }, maxModelCalls: 14 });
  const api = await adminApi();
  await expect.poll(async () => rows(await api.get("/tax-rates")).some((r) => r.name === name && dec(r.rate) === "7"), { timeout: 30_000 }).toBe(true);
  await arabic(fx, "/ar/tax/rates", "معدلات الضرائب");
});

test("[mz-vat-returns.1] the VAT returns page lists returns and the generate form drafts a return for a period", { tags: ["feat:mz-vat-returns", "shard:ui-tax", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/tax/returns");
  await expect(h1(screen, "VAT Returns")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the VAT returns page has finished loading (a list of returns or an empty state with a button to generate a return)");
  await app.open("/en/tax/returns/generate");
  await expect(h1(screen, "Generate VAT Return")).toBeVisible({ timeout: 60_000 });
  await agent.act("choose the period from 2026-01-01 to 2026-03-31 and press the button that generates / calculates the VAT return. The step is complete once the button was pressed", { maxModelCalls: 14 });
  const api = await adminApi();
  await expect.poll(async () => rows(await api.get("/vat-returns")).some((r) => String(r.startDate).startsWith("2026-01-01") && String(r.endDate).startsWith("2026-03-31")), { timeout: 30_000 }).toBe(true);
  await arabic(fx, "/ar/tax/returns", "إقرارات ضريبة القيمة المضافة");
});

test("[mz-tax-payments.1] the VAT payments page opens with its list or empty state", { tags: ["feat:mz-tax-payments", "shard:ui-tax", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { agent, screen } = fx;
  await signIn(fx, "/en/tax/payments");
  await expect(h1(screen, "VAT Payments")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the VAT payments page has finished loading (a list of VAT payments or an empty state) without an error banner");
  await arabic(fx, "/ar/tax/payments", "مدفوعات ضريبة القيمة المضافة");
});

// ───────────────────────────────────────────── api ─────────────────────────────────────────────
test("[mz-chart-of-accounts.2] accounts API: default chart, create, unique code, hierarchy rules, balances, delete rules, isolation", { tags: ["feat:mz-chart-of-accounts", "shard:ledger-api", "lvl:api"] }, async () => {
  const a = await L(), b = await LB();
  expect((await anon.get("/accounts")).status).toBe(401);
  const list = await a.api.get("/accounts", { limit: 500 });
  expect(rows(list).length).toBeGreaterThan(20);
  expect(rows(list).find((x) => x.code === "1000")).toMatchObject({ name: expect.any(String), type: "ASSET" });
  // idempotent seeding never duplicates or overwrites
  const again = await a.api.post("/accounts/seed-defaults");
  expect(again.status).toBe(201);
  expect(rows(await a.api.get("/accounts", { limit: 500 })).length).toBe(rows(list).length);

  const code = String(seededInt("api-account-code", 9000, 9899));
  const made = await a.api.post("/accounts", { code, name: seeded("Account API"), type: "EXPENSE", description: "created by the e2e army" });
  if (made.status === 409) expect(made.body.message).toMatch(/already exists/); // re-run on the same database
  else { expect(made.status).toBe(201); expect(made.body).toMatchObject({ code, type: "EXPENSE" }); }
  const id = made.status === 201 ? made.body.id : await ensureAccount(a, code, seeded("Account API"), "EXPENSE");
  expect((await a.api.post("/accounts", { code, name: "Dup", type: "EXPENSE" })).status).toBe(409);
  expect((await a.api.post("/accounts", { code: "bad", name: "x", type: "NOT_A_TYPE" })).status).toBe(400);
  expect((await a.api.post("/accounts", { name: "no code", type: "ASSET" })).status).toBe(400);
  // a child must have the type of its parent
  expect((await a.api.post("/accounts", { code: `${code}1`, name: "wrong child", type: "ASSET", parentId: id })).status).toBe(400);
  const child = await a.api.post("/accounts", { code: `${code}2`, name: seeded("Child account"), type: "EXPENSE", parentId: id });
  expect([201, 409]).toContain(child.status);
  expect((await a.api.del(`/accounts/${id}`)).status).toBe(400); // has a child account

  const tree = await a.api.get("/accounts/tree");
  expect(tree.status).toBe(200);
  expect(Array.isArray(tree.body) ? tree.body.length : rows(tree).length).toBeGreaterThan(0);
  const byType = await a.api.get("/accounts/by-type/ASSET");
  expect(byType.status).toBe(200);
  expect(rows(byType).every((x: any) => x.type === "ASSET")).toBe(true);
  const balances = await a.api.get("/accounts/balances");
  expect(balances.status).toBe(200);
  expect(balances.body.length).toBeGreaterThan(20);
  expect(balances.body.every((x: any) => /^-?\d+\.\d{4}$/.test(x.balance))).toBe(true);
  const one = await a.api.get(`/accounts/${a.chart.cash}/balance`);
  expect(one.body).toMatchObject({ accountId: a.chart.cash, accountCode: "1000" });

  const upd = await a.api.patch(`/accounts/${id}`, { description: "edited" });
  expect(upd.status).toBe(200);
  expect(upd.body.description).toBe("edited");
  // accounts with postings cannot be deleted; foreign tenants see nothing
  const j = await a.api.post("/journals", journalBody(id, a.chart.cash, "5.25"));
  expect(j.status).toBe(201);
  expect((await a.api.del(`/accounts/${id}`)).status).toBe(400);
  expect((await b.api.get(`/accounts/${id}`)).status).toBe(404);
  expect((await b.api.get(`/accounts/${id}/balance`)).status).toBe(404);
  expect((await b.api.patch(`/accounts/${id}`, { name: "Hijacked" })).status).toBe(404);
  expect((await b.api.del(`/accounts/${id}`)).status).toBe(404);
  expect(ids(await b.api.get("/accounts", { limit: 500 }))).not.toContain(id);
  const spare = await ensureAccount(a, `${code}9`, seeded("Spare account"), "EXPENSE");
  expect((await a.api.del(`/accounts/${spare}`)).status).toBe(200);
});

test("[mz-journals.2] journal API: balanced double entry, validation, immutability of posted journals, single reversal, bulk operations", { tags: ["feat:mz-journals", "shard:ledger-api", "lvl:api"] }, async () => {
  const a = await L(), b = await LB();
  expect((await anon.get("/journals")).status).toBe(401);
  expect((await anon.post("/journals", {})).status).toBe(401);
  const c = a.chart;
  const created = await a.api.post("/journals", journalBody(c.supplies, c.cash, "10.25"));
  expect(created.status).toBe(201);
  expect(created.body.isPosted).toBe(true);
  expect(created.body.journalNumber).toMatch(/^JRN-\d+$/);
  expect([created.body.totalDebit, created.body.totalCredit]).toEqual(["10.2500", "10.2500"]);
  const id = created.body.id as string;
  expect((await a.api.get(`/journals/${id}`)).body.lines).toHaveLength(2);

  // balance and shape rules
  const unbalanced = await a.api.post("/journals", journalBody(c.supplies, c.cash, "10", { lines: [{ accountId: c.supplies, debit: "10" }, { accountId: c.cash, credit: "9.99" }] }));
  expect(unbalanced.status).toBe(400);
  expect((await a.api.post("/journals", journalBody(c.supplies, c.cash, "1", { lines: [{ accountId: c.supplies, debit: "1" }] }))).status).toBe(400); // two lines minimum
  expect((await a.api.post("/journals", journalBody(c.supplies, c.cash, "1", { lines: [{ accountId: c.supplies, debit: "-1" }, { accountId: c.cash, credit: "-1" }] }))).status).toBe(400);
  expect((await a.api.post("/journals", journalBody(c.supplies, c.cash, "1", { date: "yesterday" }))).status).toBe(400);
  expect((await b.api.post("/journals", journalBody(c.supplies, b.chart.cash, "5"))).status).toBe(400); // another tenant's account
  expect((await b.api.get(`/journals/${id}`)).status).toBe(404);
  expect(ids(await b.api.get("/journals", { limit: 100 }))).not.toContain(id);

  // posted history is immutable: no edit, no delete, no re-post
  expect((await a.api.patch(`/journals/${id}`, { notes: "edit" })).status).toBe(400);
  expect((await a.api.del(`/journals/${id}`)).status).toBe(400);
  expect((await a.api.post(`/journals/${id}/post`)).status).toBe(400);

  // reversal: linked, exact opposite lines, exactly once; a reversal cannot be reversed
  const supplies0 = await acct(a.api, c.supplies);
  const rev = await a.api.post(`/journals/${id}/reverse`, {});
  expect(rev.status).toBe(201);
  expect(rev.body.reversalOfId).toBe(id);
  expect(lineSig(rev.body.lines)).toEqual(lineSig([{ accountId: c.supplies, debit: "0", credit: "10.25" }, { accountId: c.cash, debit: "10.25", credit: "0" }]));
  expect(subDec((await acct(a.api, c.supplies)).credit, supplies0.credit)).toBe("10.25");
  expect((await a.api.post(`/journals/${id}/reverse`, {})).status).toBe(400);
  expect((await a.api.post(`/journals/${rev.body.id}/reverse`, {})).status).toBe(400);
  expect((await b.api.post(`/journals/${id}/reverse`, {})).status).toBe(404);

  // listing, search and date filters
  const ref = seeded("search-ref");
  const tagged = await a.api.post("/journals", journalBody(c.supplies, c.cash, "1", { reference: ref }));
  await expect.poll(async () => ids(await a.api.get("/journals", { search: ref })), { timeout: 20_000 }).toEqual([tagged.body.id]);
  expect(ids(await a.api.get("/journals", { dateFrom: "2030-01-01", limit: 100 }))).not.toContain(tagged.body.id);
  const cursor = await a.api.get("/journals/cursor", { take: 2 });
  expect(cursor.status).toBe(200);

  // bulk delete / bulk post: per-record outcomes, posted journals are refused
  const bulk = await a.api.post("/journals/bulk-delete", { ids: [tagged.body.id] });
  expect(bulk.status).toBe(201);
  expect(bulk.body).toMatchObject({ processed: 0, total: 1 });
  expect((await a.api.post("/journals/bulk-post", { ids: [tagged.body.id] })).body.processed).toBe(0);
});

test("[mz-journals.3] journal API: the organization lock date blocks postings dated inside the locked period", { tags: ["feat:mz-journals", "shard:ledger-api", "lvl:api"] }, async () => {
  const t = await ledgerTenant("ledger-lock");
  const c = t.chart;
  const lock = await t.api.patch("/organization/lock-date", { lockDate: "2026-02-28T00:00:00.000Z" });
  expect(lock.status).toBe(200);
  try {
    const blocked = await t.api.post("/journals", journalBody(c.supplies, c.cash, "3", { date: "2026-02-15" }));
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/locked/i);
    const open = await t.api.post("/journals", journalBody(c.supplies, c.cash, "3", { date: "2026-03-15" }));
    expect(open.status).toBe(201);
    // a reversal dated inside the locked period is refused as well
    const inLock = await t.api.post(`/journals/${open.body.id}/reverse`, { date: "2026-02-10" });
    expect(inLock.status).toBe(400);
  } finally {
    const cleared = await t.api.patch("/organization/lock-date", { lockDate: null });
    expect(cleared.status).toBe(200);
  }
  expect((await t.api.post("/journals", journalBody(c.supplies, c.cash, "3", { date: "2026-02-15" }))).status).toBe(201);
});

test("[mz-recurring-journals.2] recurring profile API: validation, manual execution is idempotent and posts a journal", { tags: ["feat:mz-recurring-journals", "shard:ledger-api", "lvl:api"] }, async () => {
  const a = await L(), b = await LB();
  const c = a.chart;
  expect((await anon.get("/recurring-profiles")).status).toBe(401);
  const template = (rent: string, cash: string, amount = "75.5") => ({ lines: [{ accountId: rent, debit: amount, description: "Rent" }, { accountId: cash, credit: amount }] });
  const body = (templateData: unknown) => ({ name: seeded("Rent profile"), frequency: "MONTHLY", startDate: DATE.doc, autoPost: true, entityType: "journal", templateData });

  expect((await a.api.post("/recurring-profiles", body({ lines: [{ accountId: c.rent, debit: "10" }, { accountId: c.cash, credit: "9" }] }))).status).toBe(400); // unbalanced template
  expect((await b.api.post("/recurring-profiles", body(template(c.rent, c.cash)))).status).toBe(400); // another tenant's accounts
  expect((await a.api.post("/recurring-profiles", { ...body(template(c.rent, c.cash)), frequency: "SOMETIMES" })).status).toBe(400);

  const created = await a.api.post("/recurring-profiles", body(template(c.rent, c.cash)));
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  expect(String(created.body.nextRunDate)).toBeTruthy();
  expect((await a.api.patch(`/recurring-profiles/${id}`, { name: "Renamed profile" })).body.name).toBe("Renamed profile");
  expect((await a.api.patch(`/recurring-profiles/${id}`, { templateData: { lines: [{ accountId: c.rent, debit: "1" }] } })).status).toBe(400);
  expect((await b.api.get(`/recurring-profiles/${id}`)).status).toBe(404);
  expect(ids(await a.api.get("/recurring-profiles", { limit: 100 }))).toContain(id);
  expect((await a.api.get("/recurring-profiles/statistics")).status).toBe(200);
  expect((await a.api.get("/recurring-profiles/upcoming")).status).toBe(200);

  // manual run = the job trigger: needs an idempotency key (uuid); a retry with the same key posts nothing new
  const rent0 = await acct(a.api, c.rent);
  expect((await a.api.post(`/recurring-profiles/${id}/execute`, {})).status).toBe(400);
  expect((await a.api.post(`/recurring-profiles/${id}/execute`, { idempotencyKey: "not-a-uuid" })).status).toBe(400);
  const key = uuidFrom("recurring-run-1");
  const first = await a.api.post(`/recurring-profiles/${id}/execute`, { idempotencyKey: key });
  expect(first.status).toBe(201);
  expect(first.body.success).toBe(true);
  const retry = await a.api.post(`/recurring-profiles/${id}/execute`, { idempotencyKey: key });
  expect(retry.body.createdEntityId).toBe(first.body.createdEntityId);
  expect(subDec((await acct(a.api, c.rent)).debit, rent0.debit)).toBe("75.5"); // one posting, not two
  const posted = await a.api.get(`/journals/${first.body.createdEntityId}`);
  expect(posted.status).toBe(200);
  expect(lineSig(posted.body.lines)).toEqual(lineSig([{ accountId: c.rent, debit: "75.5", credit: "0" }, { accountId: c.cash, debit: "0", credit: "75.5" }]));
  const history = await a.api.get(`/recurring-profiles/${id}/executions`);
  expect(history.status).toBe(200);
  expect((await b.api.post(`/recurring-profiles/${id}/execute`, { idempotencyKey: uuidFrom("recurring-run-b") })).status).toBe(404);

  // pause / resume and delete
  const toggled = await a.api.patch(`/recurring-profiles/${id}/toggle`);
  expect(toggled.status).toBe(200);
  expect((await a.api.del(`/recurring-profiles/${id}`)).status).toBe(200);
  expect((await a.api.get(`/recurring-profiles/${id}`)).status).toBe(404);
});

test("[mz-recurring-scheduler.1] the recurring-journal job posts a due scheduled run through the manual trigger and the schedule is observable", { tags: ["feat:mz-recurring-scheduler", "shard:ledger-api", "lvl:api"] }, async () => {
  // The midnight @Cron has no HTTP hook in the verify stack; its work item (one idempotent posting per profile + date) is the
  // execute endpoint, whose observable result - one journal, execution log, no second posting for the same key - is asserted here.
  const a = await L();
  const c = a.chart;
  const created = await a.api.post("/recurring-profiles", { name: seeded("Scheduler profile"), frequency: "DAILY", startDate: DATE.past, autoPost: true, entityType: "journal", templateData: { lines: [{ accountId: c.rent, debit: "12.34" }, { accountId: c.cash, credit: "12.34" }] } });
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  expect(String(created.body.nextRunDate).slice(0, 10) >= DATE.past).toBe(true);
  const upcoming = await a.api.get("/recurring-profiles/upcoming");
  expect(upcoming.status).toBe(200);
  const before = await acct(a.api, c.rent);
  const run = await a.api.post(`/recurring-profiles/${id}/execute`, { idempotencyKey: uuidFrom("scheduler-1") });
  expect(run.status).toBe(201);
  expect(run.body.success).toBe(true);
  await expect.poll(async () => subDec((await acct(a.api, c.rent)).debit, before.debit), { timeout: 20_000 }).toBe("12.34");
  const executions = await a.api.get(`/recurring-profiles/${id}/executions`);
  expect(executions.status).toBe(200);
  expect(rows(executions).length).toBeGreaterThanOrEqual(1);
  expect((await a.api.del(`/recurring-profiles/${id}`)).status).toBe(200);
});

test("[mz-trial-balance.2] trial balance API: debits equal credits after real postings, report and accounting views agree, tenant scoped", { tags: ["feat:mz-trial-balance", "shard:ledger-api", "lvl:api"] }, async () => {
  const a = await L(), b = await LB();
  const c = a.chart;
  expect((await anon.get("/accounting-reports/trial-balance")).status).toBe(401);
  expect((await anon.get("/reports/trial-balance")).status).toBe(401);
  const sale = await a.api.post("/journals", journalBody(c.bank, c.revenue, "1000", { lines: [{ accountId: c.bank, debit: "1150" }, { accountId: c.revenue, credit: "1000" }, { accountId: c.vatPayable, credit: "150" }] }));
  expect(sale.status).toBe(201);
  const tb = await a.api.get("/accounting-reports/trial-balance");
  expect(tb.status).toBe(200);
  expect(tb.body.totals.totalDebits).toBe(tb.body.totals.totalCredits);
  expect(tb.body.isBalanced).toBe(true);
  const row = (id: string) => tb.body.accounts.find((x: any) => x.id === id);
  expect(dec(row(c.revenue).credit)).not.toBe("0");
  const sum = (f: string) => sumDec(tb.body.accounts.map((x: any) => x[f]));
  expect(sum("debit")).toBe(dec(tb.body.totals.totalDebits));
  expect(sum("credit")).toBe(dec(tb.body.totals.totalCredits));
  const report = await a.api.get("/reports/trial-balance", { asOfDate: "2099-12-31" });
  expect(report.status).toBe(200);
  expect(report.body.isBalanced).toBe(true);
  expect(dec(report.body.totals.debit)).toBe(dec(tb.body.totals.totalDebits));
  // an as-of date before any posting shows nothing; tenant B is isolated
  const early = await a.api.get("/reports/trial-balance", { asOfDate: "2000-01-01" });
  expect(dec(early.body.totals.debit)).toBe("0");
  const other = await b.api.get("/accounting-reports/trial-balance");
  expect(other.status).toBe(200);
  expect(other.body.accounts.find((x: any) => x.id === c.revenue)).toBeUndefined();
});

test("[mz-general-ledger.2] general ledger API: lines of an account with running balance, date filter, tenant scoped", { tags: ["feat:mz-general-ledger", "shard:ledger-api", "lvl:api"] }, async () => {
  const a = await L(), b = await LB();
  const c = a.chart;
  expect((await anon.get(`/accounting-reports/general-ledger/${c.cash}`)).status).toBe(401);
  const ref = seeded("gl-ref");
  const posted = await a.api.post("/journals", journalBody(c.supplies, c.cash, "20.5", { reference: ref, date: "2026-03-11" }));
  expect(posted.status).toBe(201);
  const gl = await a.api.get(`/accounting-reports/general-ledger/${c.cash}`);
  expect(gl.status).toBe(200);
  const text = JSON.stringify(gl.body);
  expect(text).toContain(ref);
  expect(text).toContain("20.5");
  const viaReports = await a.api.get(`/reports/general-ledger/${c.cash}`, { startDate: "2026-03-01", endDate: "2026-03-31" });
  expect(viaReports.status).toBe(200);
  expect(JSON.stringify(viaReports.body)).toContain(ref);
  const outside = await a.api.get(`/reports/general-ledger/${c.cash}`, { startDate: "2020-01-01", endDate: "2020-01-31" });
  expect(JSON.stringify(outside.body)).not.toContain(ref);
  expect((await b.api.get(`/accounting-reports/general-ledger/${c.cash}`)).status).toBe(404);
  expect((await a.api.get("/accounting-reports/general-ledger/does-not-exist")).status).toBe(404);
});

test("[mz-tax-rates.2] tax rate API: create, duplicate name, validation, default flag, update, in-use delete rule, isolation", { tags: ["feat:mz-tax-rates", "shard:ledger-api", "lvl:api"] }, async () => {
  const a = await L(), b = await LB();
  expect((await anon.get("/tax-rates")).status).toBe(401);
  const name = seeded("Tax rate API");
  const created = await a.api.post("/tax-rates", { name, rate: "14", type: "BOTH", linkedAccountId: a.chart.vatPayable });
  if (created.status === 400) expect(created.body.message).toMatch(/already exists/); // re-run on the same database
  else expect(created.status).toBe(201);
  const rate = created.status === 201 ? created.body : rows(await a.api.get("/tax-rates")).find((r) => r.name === name);
  expect(dec(rate.rate)).toBe("14");
  expect((await a.api.post("/tax-rates", { name, rate: "14", linkedAccountId: a.chart.vatPayable })).status).toBe(400); // duplicate name
  expect((await a.api.post("/tax-rates", { name: seeded("bad rate"), rate: "abc", linkedAccountId: a.chart.vatPayable })).status).toBe(400);
  expect((await a.api.post("/tax-rates", { name: seeded("neg rate"), rate: "-5", linkedAccountId: a.chart.vatPayable })).status).toBe(400);
  expect((await a.api.post("/tax-rates", { name: seeded("no account"), rate: "5" })).status).toBe(400);
  expect((await a.api.post("/tax-rates", { name: seeded("foreign account"), rate: "5", linkedAccountId: b.chart.vatPayable })).status).toBe(400); // another tenant's account
  expect((await a.api.get(`/tax-rates/${rate.id}`)).body.name).toBe(name);
  const upd = await a.api.put(`/tax-rates/${rate.id}`, { rate: "15", isDefault: true });
  expect(upd.status).toBe(200);
  expect(dec(upd.body.rate)).toBe("15");
  const def = await a.api.get("/tax-rates/default");
  expect(def.status).toBe(200);
  expect(def.body.id).toBe(rate.id);
  expect(ids(await a.api.get("/tax-rates"))).toContain(rate.id);
  expect((await b.api.get(`/tax-rates/${rate.id}`)).status).toBe(404);
  expect(ids(await b.api.get("/tax-rates"))).not.toContain(rate.id);
  expect((await b.api.put(`/tax-rates/${rate.id}`, { rate: "1" })).status).toBe(404);
  expect((await b.api.del(`/tax-rates/${rate.id}`)).status).toBe(404);
  expect((await a.api.del(`/tax-rates/${rate.id}`)).status).toBe(200);
  expect((await a.api.get(`/tax-rates/${rate.id}`)).status).toBe(404);
  const seededDefaults = await a.api.post("/tax-rates/seed-defaults", { linkedAccountId: a.chart.vatPayable });
  expect(seededDefaults.status).toBe(201);
});

test("[mz-vat-returns.2] VAT return API: calculation from the ledger, submit posts the settlement once, exact payment, filing, isolation", { tags: ["feat:mz-vat-returns", "shard:ledger-api", "lvl:api"] }, async () => {
  const a = await ledgerTenant("tax"), b = await LB();
  const c = a.chart;
  expect((await anon.get("/vat-returns")).status).toBe(401);
  // output VAT 150 on a 1000 sale, input VAT 45 on a 300 purchase, inside the first quarter of 2026
  const sale = await a.api.post("/journals", { date: "2026-02-10", reference: seeded("SALE"), lines: [{ accountId: c.bank, debit: "1150" }, { accountId: c.revenue, credit: "1000" }, { accountId: c.vatPayable, credit: "150" }] });
  const purchase = await a.api.post("/journals", { date: "2026-02-12", reference: seeded("PURCH"), lines: [{ accountId: c.rent, debit: "300" }, { accountId: c.vatInput, debit: "45" }, { accountId: c.bank, credit: "345" }] });
  expect([sale.status, purchase.status]).toEqual([201, 201]);

  const created = await a.api.post("/vat-returns", { startDate: DATE.q1Start, endDate: DATE.q1End });
  expect(created.status).toBe(201);
  expect(created.body.status).toBe("DRAFT");
  const id = created.body.id as string;
  expect((await a.api.post("/vat-returns", { startDate: "bad", endDate: DATE.q1End })).status).toBe(400);
  const calc = await a.api.post(`/vat-returns/${id}/calculate`, {});
  expect(calc.status).toBe(201);
  expect(calc.body.status).toBe("CALCULATED");
  expect([dec(calc.body.outputVAT), dec(calc.body.inputVAT), dec(calc.body.netPayable)]).toEqual(["150", "45", "105"]);
  const summary = await a.api.get("/vat-returns/summary", { startDate: DATE.q1Start, endDate: DATE.q1End });
  expect(summary.status).toBe(200);
  expect((await a.api.get("/vat-returns/dashboard-stats")).status).toBe(200);

  // tenant isolation and anonymous access
  expect((await b.api.get(`/vat-returns/${id}`)).status).toBe(404);
  expect((await b.api.post(`/vat-returns/${id}/submit`, {})).status).toBe(404);
  expect(ids(await b.api.get("/vat-returns"))).not.toContain(id);
  expect((await anon.post(`/vat-returns/${id}/submit`, {})).status).toBe(401);

  // no payment before submission; submission posts one settlement journal dated on the period end
  const payBody = (amount: string) => ({ amount, date: "2026-04-15", paidFromAccountId: c.bank, reference: "EFT-1" });
  expect((await a.api.post(`/vat-returns/${id}/payment`, payBody("105"))).status).toBe(400);
  const vatPay0 = await acct(a.api, c.vatPayable);
  const submitted = await a.api.post(`/vat-returns/${id}/submit`, {});
  expect(submitted.status).toBe(201);
  expect(submitted.body.status).toBe("SUBMITTED");
  const settlement = await journalOf(a.api, "VAT_RETURN", id);
  expect(String(settlement.date).slice(0, 10)).toBe(DATE.q1End);
  expect(lineSig(settlement.lines)).toEqual(lineSig([
    { accountId: c.vatPayable, debit: "150", credit: "0" }, { accountId: c.vatInput, debit: "0", credit: "45" }, { accountId: c.vatPayable, debit: "0", credit: "105" },
  ]));
  expect(subDec((await acct(a.api, c.vatPayable)).debit, vatPay0.debit)).toBe("150");
  expect((await a.api.post(`/vat-returns/${id}/submit`, {})).status).toBe(400); // exactly once

  // the payment must equal the net payable exactly and come from an own bank/cash account
  for (const amount of ["50", "105.0001", "0", "105.00001"]) expect((await a.api.post(`/vat-returns/${id}/payment`, payBody(amount))).status).toBe(400);
  expect((await a.api.post(`/vat-returns/${id}/payment`, { ...payBody("105"), paidFromAccountId: c.revenue })).status).toBe(400);
  expect((await a.api.post(`/vat-returns/${id}/payment`, { ...payBody("105"), paidFromAccountId: b.chart.bank })).status).toBe(400);
  const accounts = await a.api.get("/vat-returns/payment-accounts");
  expect(ids(accounts)).toContain(c.bank);
  expect(ids(accounts)).not.toContain(c.revenue);
  const bank0 = await acct(a.api, c.bank);
  const paid = await a.api.post(`/vat-returns/${id}/payment`, payBody("105.0000"));
  expect(paid.status).toBe(201);
  expect(dec(paid.body.amount)).toBe("105");
  expect(subDec((await acct(a.api, c.bank)).credit, bank0.credit)).toBe("105");
  expect((await a.api.get(`/vat-returns/${id}`)).body.status).toBe("FILED");
  expect((await a.api.post(`/vat-returns/${id}/payment`, payBody("105"))).status).toBe(400); // second payment refused
  expect((await a.api.post(`/vat-returns/${id}/file`, {})).status).toBe(400); // a return with VAT payable is filed by its payment
  const tb = await a.api.get("/accounting-reports/trial-balance");
  expect(tb.body.totals.totalDebits).toBe(tb.body.totals.totalCredits);
});

test("[mz-vat-returns.3] VAT return API: a zero-VAT return is submitted without a journal and filed with /file; returns can be deleted while draft", { tags: ["feat:mz-vat-returns", "shard:ledger-api", "lvl:api"] }, async () => {
  const a = await ledgerTenant("tax");
  const created = await a.api.post("/vat-returns", { startDate: "2025-01-01", endDate: "2025-03-31" });
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  expect((await a.api.post(`/vat-returns/${id}/file`, {})).status).toBe(400); // not submitted yet
  expect((await a.api.post(`/vat-returns/${id}/calculate`, {})).status).toBe(201);
  expect((await a.api.post(`/vat-returns/${id}/submit`, {})).status).toBe(201);
  expect(await journalOf(a.api, "VAT_RETURN", id)).toBeUndefined();
  const filed = await a.api.post(`/vat-returns/${id}/file`, {});
  expect(filed.status).toBe(201);
  expect(filed.body.status).toBe("FILED");
  expect((await a.api.post(`/vat-returns/${id}/file`, {})).status).toBe(400);
  const draft = await a.api.post("/vat-returns", { startDate: "2024-01-01", endDate: "2024-03-31" });
  expect((await a.api.del(`/vat-returns/${draft.body.id}`)).status).toBe(200);
  expect((await a.api.get(`/vat-returns/${draft.body.id}`)).status).toBe(404);
});

test("[mz-tax-payments.2] VAT payment API: a recorded payment is listed against its return and posts Dr VAT payable / Cr bank", { tags: ["feat:mz-tax-payments", "shard:ledger-api", "lvl:api"] }, async () => {
  const a = await ledgerTenant("tax-pay");
  const c = a.chart;
  const sale = await a.api.post("/journals", { date: "2026-02-10", reference: seeded("SALE-P"), lines: [{ accountId: c.bank, debit: "114" }, { accountId: c.revenue, credit: "100" }, { accountId: c.vatPayable, credit: "14" }] });
  expect(sale.status).toBe(201);
  const ret = (await a.api.post("/vat-returns", { startDate: DATE.q1Start, endDate: DATE.q1End })).body.id;
  expect((await a.api.post(`/vat-returns/${ret}/calculate`, {})).status).toBe(201);
  expect((await a.api.post(`/vat-returns/${ret}/submit`, {})).status).toBe(201);
  const pay = await a.api.post(`/vat-returns/${ret}/payment`, { amount: "14", date: "2026-04-10", paidFromAccountId: c.bank });
  expect(pay.status).toBe(201);
  const journal = await journalOf(a.api, "VAT_PAYMENT", pay.body.id);
  expect(lineSig(journal.lines)).toEqual(lineSig([{ accountId: c.vatPayable, debit: "14", credit: "0" }, { accountId: c.bank, debit: "0", credit: "14" }]));
  expect(dec((await acct(a.api, c.vatPayable)).natural)).toBe("0"); // the liability is settled
  const detail = await a.api.get(`/vat-returns/${ret}`);
  expect(JSON.stringify(detail.body)).toContain(pay.body.id);
});
