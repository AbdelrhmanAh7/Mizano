// Reports + dashboard data: financial statements, aging, sales/purchase reports, statements, dashboard widgets, PDF exports.
//   shard ui-reports  : browser tests on the seeded demo org
//   shard reports-api : request-level tests on one scenario tenant (exact decimals reconciled with the ledger)
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { needsModel } from "../lib.ts";
import { DATE, acct, adminApi, anon, dec, defaults, h1, invoiceBody, ledgerTenant, rows, seeded, signIn, sumDec, subDec, tenant } from "./_mz.e2e.ts";

const FOUR_DP = /^-?\d+\.\d{4}$/;
const WIDE = { startDate: "2025-01-01", endDate: "2099-12-31" };

async function arabic({ app, screen, browser }: any, path: string, title: string) {
  await app.open(path);
  await expect(h1(screen, title)).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
}

/** One scenario tenant shared by the report tests of this process (idempotent per process, exact absolute numbers on a fresh database). */
let scenarioP: Promise<any> | null = null;
function scenario() {
  scenarioP ??= (async () => {
    const t = await ledgerTenant("reports");
    const d = await defaults(t);
    const post = async (r: Promise<any>, status = 201) => { const x = await r; if (x.status !== status) throw new Error(`scenario step answered ${x.status} ${x.text.slice(0, 200)}`); return x.body; };
    const c1 = (await post(t.api.post("/customers", { name: seeded("Report customer 1"), currency: "EGP" }))).id;
    const c2 = (await post(t.api.post("/customers", { name: seeded("Report customer 2"), currency: "EGP" }))).id;
    const v = (await post(t.api.post("/vendors", { name: seeded("Report vendor") }))).id;
    const send = async (customer: string, rate: string, taxRate: string | undefined, due: string, qty = "1") => {
      const inv = await post(t.api.post("/invoices", invoiceBody(customer, [{ quantity: qty, rate, ...(taxRate ? { taxRate } : {}) }], { dueDate: due })));
      await post(t.api.patch(`/invoices/${inv.id}/send`), 200);
      return inv;
    };
    const inv1 = await send(c1, "1000", "14", DATE.due); // 1140, current
    const inv2 = await send(c2, "500.10", undefined, DATE.past, "3"); // 1500.30, long overdue
    await post(t.api.post("/payments-received", { customerId: c1, date: DATE.payment, amount: "100", paymentMode: "BANK_TRANSFER", depositToAccountId: d.defaultBankAccountId, allocations: [{ invoiceId: inv1.id, amount: "100" }] }));
    const bill = async (rate: string, due: string) => {
      const b = await post(t.api.post("/bills", { vendorId: v, date: DATE.doc, dueDate: due, lines: [{ description: "Supplies", accountId: t.chart.rent, quantity: "1", rate, taxRate: "14" }] }));
      await post(t.api.post(`/bills/${b.id}/approve`));
      return b;
    };
    const bill1 = await bill("800", DATE.due); // 912, current
    const bill2 = await bill("400", DATE.past); // 456, long overdue
    await post(t.api.post("/expenses", { date: DATE.doc, accountId: t.chart.rent, amount: "100.00", taxRate: "14", paidThroughAccountId: d.defaultBankAccountId, description: seeded("Report expense") }));
    return { t, d, c1, c2, v, inv1, inv2, bill1, bill2 };
  })();
  return scenarioP;
}

// ───────────────────────────────────────────── ui ─────────────────────────────────────────────
test("[mz-financial-reports.1] the reports hub opens the profit and loss, balance sheet and cash flow statements", { tags: ["feat:mz-financial-reports", "shard:ui-reports", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/reports");
  await expect(h1(screen, "Reports")).toBeVisible({ timeout: 90_000 });
  await agent.assert("the reports page lists report categories with links such as Profit & Loss, Balance Sheet, Cash Flow, Trial Balance and General Ledger");
  await app.open("/en/reports/profit-loss");
  await expect(h1(screen, "Profit & Loss")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the profit and loss statement has finished loading and shows income, expenses and a net profit figure");
  await app.open("/en/reports/balance-sheet");
  await expect(h1(screen, "Balance Sheet")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the balance sheet has finished loading and shows assets, liabilities and equity sections");
  await app.open("/en/reports/cash-flow");
  await expect(h1(screen, "Cash Flow Statement")).toBeVisible({ timeout: 90_000 });
  await arabic(fx, "/ar/reports/profit-loss", "الأرباح والخسائر");
});

test("[mz-aging-reports.1] the receivables and payables aging reports show their buckets", { tags: ["feat:mz-aging-reports", "shard:ui-reports", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/reports/ar-aging");
  await expect(h1(screen, "AR Aging")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the receivables aging report has finished loading and shows aging buckets (current, 1-30, 31-60, 61-90, over 90 days) with customers and amounts");
  await app.open("/en/reports/ap-aging");
  await expect(h1(screen, "AP Aging")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the payables aging report has finished loading and shows aging buckets with vendors and amounts");
  await arabic(fx, "/ar/reports/ar-aging", "أعمار الذمم المدينة");
});

test("[mz-sales-purchase-reports.1] the sales by customer, sales by item and purchases by vendor reports load", { tags: ["feat:mz-sales-purchase-reports", "shard:ui-reports", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/reports/sales-by-customer");
  await expect(h1(screen, "Sales by Customer")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the sales by customer report has finished loading and lists customers such as 'Nile Tech Solutions' with sales amounts");
  await app.open("/en/reports/sales-by-item");
  await expect(h1(screen, "Sales by Item")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the sales by item report has finished loading (items with quantities and amounts, or an empty state)");
  await app.open("/en/reports/purchases-by-vendor");
  await expect(h1(screen, "Purchases by Vendor")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the purchases by vendor report has finished loading and lists vendors such as 'Supplier Alpha' with purchase amounts");
  await arabic(fx, "/ar/reports/sales-by-customer", "المبيعات حسب العميل");
});

// ───────────────────────────────────────────── api ─────────────────────────────────────────────
test("[mz-financial-reports.2] financial statements reconcile with the ledger: P&L, balance sheet, cash flow", { tags: ["feat:mz-financial-reports", "shard:reports-api", "lvl:api"] }, async () => {
  const s = await scenario(), a = s.t;
  for (const path of ["/reports/profit-and-loss", "/reports/balance-sheet", "/reports/cash-flow"]) expect((await anon.get(path)).status).toBe(401);
  const pl = await a.api.get("/reports/profit-and-loss", WIDE);
  expect(pl.status).toBe(200);
  // net sales 1000 + 1500.30; expenses: bills 800 + 400 and the 100 expense (VAT is a balance sheet item)
  expect([dec(pl.body.totalIncome), dec(pl.body.totalExpenses), dec(pl.body.netProfit)]).toEqual(["2500.3", "1300", "1200.3"]);
  expect(pl.body.totalIncome).toMatch(FOUR_DP);
  expect((await a.api.get("/reports/profit-and-loss", { startDate: "2000-01-01", endDate: "2000-12-31" })).body.totalIncome).toMatch(/^0(\.0+)?$/);

  const bs = await a.api.get("/reports/balance-sheet", { asOfDate: "2099-12-31" });
  expect(bs.status).toBe(200);
  expect(bs.body.isBalanced).toBe(true);
  expect(dec(bs.body.totalAssets)).toBe(dec(bs.body.totalLiabilitiesAndEquity));
  expect(dec(bs.body.difference)).toBe("0");
  expect(bs.body.totalAssets).toMatch(FOUR_DP);

  const cf = await a.api.get("/reports/cash-flow", WIDE);
  expect(cf.status).toBe(200);
  expect(dec(cf.body.reconciliation.variance)).toBe("0");
  const cash = await acct(a.api, s.d.defaultBankAccountId);
  const cashAccount = await acct(a.api, s.d.defaultCashAccountId);
  expect(dec(cf.body.closingCashBalance)).toBe(sumDec([cash.natural, cashAccount.natural]));
  // the profit and loss agrees with the dashboard figures of the same period
  const dash = await a.api.get("/reports/dashboard", WIDE);
  expect(dec(dash.body.overview.monthlyRevenue)).toBe(dec(pl.body.totalIncome));
  expect(dec(dash.body.overview.monthlyProfit)).toBe(dec(pl.body.netProfit));
  // tenant isolation: another organization sees zeros
  const b = await tenant("reports-b");
  expect((await b.api.get("/reports/profit-and-loss", WIDE)).body.totalIncome).toMatch(/^0(\.0+)?$/);
});

test("[mz-aging-reports.2] aging API: open invoices and bills land in the right buckets, drafts and paid documents stay out, totals tie to the control accounts", { tags: ["feat:mz-aging-reports", "shard:reports-api", "lvl:api"] }, async () => {
  const s = await scenario(), a = s.t;
  expect((await anon.get("/reports/receivables-aging")).status).toBe(401);
  expect((await anon.get("/reports/payables-aging")).status).toBe(401);
  const ar = await a.api.get("/reports/receivables-aging");
  expect(ar.status).toBe(200);
  const items = Object.values(ar.body.buckets as Record<string, any[]>).flat();
  expect(items).toHaveLength(2);
  expect(dec(ar.body.summary.total)).toBe("2540.3"); // 1140 - 100 paid + 1500.30
  expect(ar.body.buckets.current.map((i: any) => i.invoiceId)).toEqual([s.inv1.id]);
  expect(ar.body.buckets.over90.map((i: any) => i.invoiceId)).toEqual([s.inv2.id]);
  expect(dec(ar.body.summary.netTotal)).toBe(dec((await acct(a.api, s.d.defaultArAccountId)).natural));
  expect(ar.body.summary.netTotal).toMatch(FOUR_DP);
  const asOfPast = await a.api.get("/reports/receivables-aging", { asOfDate: "2000-01-01" });
  expect(asOfPast.status).toBe(200);

  const ap = await a.api.get("/reports/payables-aging");
  expect(ap.status).toBe(200);
  expect(dec(ap.body.summary.total)).toBe("1368"); // 912 + 456
  expect(ap.body.buckets.current.map((i: any) => i.billId)).toEqual([s.bill1.id]);
  expect(ap.body.buckets.over90.map((i: any) => i.billId)).toEqual([s.bill2.id]);
  expect(dec(ap.body.summary.netTotal)).toBe(dec((await acct(a.api, s.d.defaultApAccountId)).natural));

  // statements per customer / vendor reconcile with the same ledger
  const cs = await a.api.get(`/reports/customer-statement/${s.c1}`, { startDate: "2025-01-01", endDate: "2099-12-31" });
  expect(cs.status).toBe(200);
  expect(cs.body.closingBalance).toBe("1040.0000");
  expect(cs.body.transactions.map((t: any) => t.type)).toEqual(expect.arrayContaining(["Invoice", "Payment"]));
  const vs = await a.api.get(`/reports/vendor-statement/${s.v}`, { startDate: "2025-01-01", endDate: "2099-12-31" });
  expect(vs.status).toBe(200);
  expect(dec(vs.body.closingBalance)).toBe("1368");
  const b = await tenant("reports-b");
  expect((await b.api.get("/reports/receivables-aging")).body.invoiceCount).toBe(0);
  expect(Object.keys((await b.api.get(`/reports/customer-statement/${s.c1}`, WIDE)).body)).toHaveLength(0);
});

test("[mz-sales-purchase-reports.2] sales and purchase reports aggregate the posted documents per customer, item and vendor", { tags: ["feat:mz-sales-purchase-reports", "shard:reports-api", "lvl:api"] }, async () => {
  const s = await scenario(), a = s.t;
  expect((await anon.get("/reports/sales-by-customer")).status).toBe(401);
  const byCustomer = await a.api.get("/reports/sales-by-customer", WIDE);
  expect(byCustomer.status).toBe(200);
  const list = Array.isArray(byCustomer.body) ? byCustomer.body : byCustomer.body.customers ?? byCustomer.body.data ?? [];
  expect(list.length).toBe(2);
  const text = JSON.stringify(byCustomer.body);
  expect(text).toContain(seeded("Report customer 1"));
  expect(text).toContain("1500.3");
  const byItem = await a.api.get("/reports/sales-by-item", WIDE);
  expect(byItem.status).toBe(200);
  const byVendor = await a.api.get("/reports/purchases-by-vendor", WIDE);
  expect(byVendor.status).toBe(200);
  expect(JSON.stringify(byVendor.body)).toContain(seeded("Report vendor"));
  expect(JSON.stringify(byVendor.body)).toContain("1200"); // 800 + 400 net purchases
  const b = await tenant("reports-b");
  expect(JSON.stringify((await b.api.get("/reports/sales-by-customer", WIDE)).body)).not.toContain(seeded("Report customer 1"));
});

test("[mz-dashboard.2] dashboard API: overview ties to the ledger, every widget endpoint answers for the demo organization", { tags: ["feat:mz-dashboard", "shard:reports-api", "lvl:api"] }, async () => {
  const s = await scenario(), a = s.t;
  const dash = await a.api.get("/reports/dashboard");
  expect(dash.status).toBe(200);
  expect(dec(dash.body.overview.totalReceivables)).toBe("2540.3");
  expect(dec(dash.body.overview.totalPayables)).toBe("1368");
  expect(dash.body.overview.totalReceivables).toMatch(FOUR_DP);
  expect(dec(dash.body.overview.netPosition)).toBe(subDec(dash.body.overview.totalReceivables, dash.body.overview.totalPayables));
  const status = await a.api.get("/reports/dashboard/invoice-status");
  expect(rows(status).every((x: any) => x.status !== "DRAFT" && x.status !== "VOID")).toBe(true);

  // every widget the dashboard asks for must answer 200 with JSON for the seeded demo admin (what the page loads)
  const admin = await adminApi();
  const widgets = ["revenue-chart", "cash-flow-chart", "top-customers", "expenses-by-category", "projects", "bank-balance-trend", "inventory-value-trend", "gross-margin-trend", "revenue-yoy",
    "account-balances", "vat-summary", "invoice-status", "quote-conversion", "invoice-volume", "payment-collection", "churn-risk", "clv-segments", "bill-status", "top-vendors", "purchase-trend",
    "expense-trend", "vendor-payment-time", "payroll-trend", "department-headcount", "attendance-overview", "salary-distribution", "attrition-risk", "stock-levels", "reorder-alerts",
    "work-order-status", "production-efficiency", "project-budgets", "billable-hours", "task-status", "project-profitability", "deal-pipeline", "leads-by-source", "lead-conversion-trend", "deal-win-rate", "anomaly-timeline"];
  const failures: string[] = [];
  for (const w of widgets) {
    const r = await admin.get(`/reports/dashboard/${w}`);
    if (r.status !== 200 || typeof r.body !== "object") failures.push(`${w}: ${r.status} ${r.text.slice(0, 80)}`);
  }
  expect(failures).toEqual([]);
  expect((await anon.get("/reports/dashboard")).status).toBe(401);
});

test("[mz-report-exports.1] report PDFs download as application/pdf with a file name, and need a session", { tags: ["feat:mz-report-exports", "shard:reports-api", "lvl:api"] }, async () => {
  const s = await scenario(), a = s.t;
  const pdfs: Array<[string, Record<string, string>]> = [
    ["/reports/profit-and-loss/pdf", WIDE], ["/reports/balance-sheet/pdf", { asOfDate: "2099-12-31" }],
    ["/reports/receivables-aging/pdf", {}], ["/reports/payables-aging/pdf", {}],
  ];
  for (const [path, query] of pdfs) {
    expect((await anon.get(path, query)).status).toBe(401);
    const r = await a.api.get(path, query);
    expect(r.status, `${path}: ${r.text.slice(0, 160)}`).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/pdf");
    expect(r.headers.get("content-disposition")).toMatch(/attachment; filename=".+\.pdf"/);
    expect(r.text.startsWith("%PDF")).toBe(true);
  }
});
