// Shared helpers of the Mizano feature suite. This file declares NO tests (the name keeps it inside the *.e2e.ts glob the hub copies).
//
// What the suite assumes about the verify stack (ops/verify/Mizano.sh): Nest API on its own port (E2E_ARMY_API = http://127.0.0.1:<PORT_API>/api),
// next dev on E2E_ARMY_URL, seeded demo org (admin@mizano.com / password123: public seed credentials of the throwaway DB), rate limits relaxed
// (RATE_LIMIT_MAX=1000) EXCEPT the AuthController (@Throttle short = 5 requests / 60 s per handler): login, register and logout are therefore
// rationed here (one tenant registration per label and process, one NextAuth session per process) and a 429 is waited out, never retried blindly.
import { createHash } from "node:crypto";
import { expect } from "e2e";
import { apiBase, seeded, seededEmail } from "../lib.ts";

export { seeded, seededEmail };
export const ADMIN = { email: "admin@mizano.com", password: "password123" } as const;
/** Password of the tenants this suite registers (>= 8 chars, upper + lower + digit). */
export const TENANT_PASSWORD = "ArmyE2e2026x";

// ─────────────────────────────── HTTP client against the Nest API ───────────────────────────────
export interface Res { status: number; body: any; text: string; headers: Headers }
type Query = Record<string, string | number | boolean | undefined>;
interface Opts { body?: unknown; query?: Query; form?: FormData; headers?: Record<string, string> }

export class Api {
  constructor(readonly token?: string) {}
  as(token?: string) { return new Api(token); }
  private async once(method: string, path: string, o: Opts): Promise<Res> {
    const url = new URL(apiBase() + path);
    for (const [k, v] of Object.entries(o.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { accept: "application/json", ...(o.headers ?? {}) };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    let body: any;
    if (o.form) body = o.form;
    else if (o.body !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(o.body); }
    const res = await fetch(url, { method, headers, body, redirect: "manual" });
    const text = await res.text();
    let parsed: any = text;
    if ((res.headers.get("content-type") ?? "").includes("json")) { try { parsed = JSON.parse(text); } catch { /* keep text */ } }
    return { status: res.status, body: parsed, text, headers: res.headers };
  }
  /** One request; a 429 (auth rate limit) is waited out with expect.poll instead of failing the test. */
  async request(method: string, path: string, o: Opts = {}): Promise<Res> {
    let res = await this.once(method, path, o);
    if (res.status === 429) {
      await expect.poll(async () => (res = await this.once(method, path, o)).status, { timeout: 85_000, interval: 5_000, message: `${method} ${path} stayed rate limited` }).not.toBe(429);
    }
    return res;
  }
  get(path: string, query?: Query) { return this.request("GET", path, { query }); }
  post(path: string, body?: unknown, query?: Query) { return this.request("POST", path, { body: body ?? {}, query }); }
  patch(path: string, body?: unknown) { return this.request("PATCH", path, { body: body ?? {} }); }
  put(path: string, body?: unknown) { return this.request("PUT", path, { body: body ?? {} }); }
  del(path: string, body?: unknown) { return this.request("DELETE", path, body === undefined ? {} : { body }); }
  upload(path: string, file: { name: string; type: string; data: Uint8Array | string }, fields: Record<string, string> = {}, field = "file") {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    form.set(field, new Blob([file.data as any], { type: file.type }), file.name);
    return this.request("POST", path, { form });
  }
}
export const anon = new Api();

/** Rows of a list response: `{data: [...]}` (paged) or a bare array. */
export const rows = (r: Res): any[] => (Array.isArray(r.body) ? r.body : Array.isArray(r.body?.data) ? r.body.data : []);
export const ids = (r: Res): string[] => rows(r).map((x) => x.id);
/** Decimal-string equality that ignores trailing zeros ("228" == "228.0000"). */
export function dec(v: unknown): string {
  const s = String(v ?? "0").trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
  let [i, f = ""] = s.split(".");
  f = f.replace(/0+$/, "");
  const neg = i.startsWith("-"); i = i.replace(/^-?0*(?=\d)/, "");
  const out = f ? `${i}.${f}` : i;
  return neg && out !== "0" ? `-${out}` : out;
}
/** Sum of decimal strings with 4 fraction digits (no floats). */
export function sumDec(values: unknown[]): string {
  let t = 0n;
  for (const v of values) {
    const [i, f = ""] = String(v ?? "0").split("."); const neg = i.startsWith("-");
    const scaled = BigInt(i.replace("-", "") || "0") * 10000n + BigInt((f + "0000").slice(0, 4));
    t += neg ? -scaled : scaled;
  }
  const neg = t < 0n; if (neg) t = -t;
  return dec(`${neg ? "-" : ""}${t / 10000n}.${String(t % 10000n).padStart(4, "0")}`);
}
export function lineSig(lines: Array<{ accountId: string; debit: unknown; credit: unknown }>): string[] {
  return lines.map((l) => `${l.accountId}|${dec(l.debit)}|${dec(l.credit)}`).sort();
}

// ─────────────────────────────── tenants (isolated organizations) ───────────────────────────────
export interface Chart { cash: string; bank: string; ar: string; ap: string; vatPayable: string; vatInput: string; revenue: string; rent: string; software: string; supplies: string }
export interface Tenant { label: string; email: string; orgId: string; orgName: string; userId: string; api: Api; refreshToken: string; chart?: Chart }
const tenants = new Map<string, Promise<Tenant>>();

/** A fresh organization + admin user per (label, SEED): registered on first use in this process, logged into when it already exists. */
export function tenant(label: string): Promise<Tenant> {
  let p = tenants.get(label);
  if (!p) {
    p = (async () => {
      const email = seededEmail(`mz-${label}`), orgName = seeded(`Mizano E2E ${label}`);
      let r = await anon.post("/auth/register", { email, password: TENANT_PASSWORD, firstName: "E2E", lastName: label.replace(/[^A-Za-z]/g, "") || "Army", organizationName: orgName });
      if (r.status === 409) r = await anon.post("/auth/login", { email, password: TENANT_PASSWORD });
      if (![200, 201].includes(r.status)) throw new Error(`tenant ${label}: register/login answered ${r.status} ${r.text.slice(0, 300)}`);
      return { label, email, orgId: r.body.organization.id, orgName: r.body.organization.name, userId: r.body.user.id, api: new Api(r.body.tokens.accessToken), refreshToken: r.body.tokens.refreshToken } as Tenant;
    })();
    tenants.set(label, p);
  }
  return p;
}
/** The tenant with the default chart of accounts seeded (idempotent) and the default account ids resolved. */
export async function ledgerTenant(label: string): Promise<Tenant & { chart: Chart }> {
  const t = await tenant(label);
  if (!t.chart) {
    const seededChart = await t.api.post("/accounts/seed-defaults");
    if (seededChart.status !== 201) throw new Error(`seed-defaults answered ${seededChart.status} ${seededChart.text.slice(0, 200)}`);
    const list = await t.api.get("/accounts", { limit: 500 });
    const byCode = new Map<string, string>(rows(list).map((a: any) => [a.code, a.id]));
    const pick = (code: string) => { const id = byCode.get(code); if (!id) throw new Error(`default chart lacks account ${code}`); return id; };
    const settings = (await t.api.get("/organization/account-settings")).body;
    t.chart = { cash: pick("1000"), bank: pick("1010"), ap: pick("2000"), vatPayable: pick("2200"), vatInput: pick("2210"), revenue: pick("4000"), rent: pick("6100"), software: pick("6200"), supplies: pick("6600"), ar: settings.defaultArAccountId };
  }
  return t as Tenant & { chart: Chart };
}

// ─────────────────────────────── the seeded demo admin (UI tests + verification reads) ───────────────────────────────
let adminP: Promise<Api> | null = null;
/** API client signed in as the demo admin (one login per process; the login endpoint allows 5 per minute). */
export function adminApi(): Promise<Api> {
  adminP ??= (async () => {
    const r = await anon.post("/auth/login", ADMIN);
    if (r.status !== 200) throw new Error(`demo admin login answered ${r.status} ${r.text.slice(0, 200)}`);
    return new Api(r.body.tokens.accessToken);
  })();
  return adminP;
}

// ─────────────────────────────── browser sign-in ───────────────────────────────
/**
 * Demo admin sign-in through the real form (next dev compiles on first hit and a submit before hydration is a plain GET: retry like
 * ops/verify/browse.ts does). Used by the auth feature tests and as the fallback of signIn().
 */
export async function formSignIn({ app, screen, browser }: any, locale = "en") {
  for (let i = 0; i < 3; i++) {
    await app.open(`/${locale}/login`);
    await expect(screen.getByRole("button", "Sign In")).toBeVisible({ timeout: 60_000 });
    await screen.getByRole("textbox", "Email").fill(ADMIN.email);
    await screen.getByRole("textbox", "Password").fill(ADMIN.password);
    await screen.getByRole("button", "Sign In").tap();
    try { await expect(browser).toHaveURL(new RegExp(`/${locale}/(dashboard|onboarding|accounting|sales)`), { timeout: 45_000 }); return; } catch (e) { if (i === 2) throw e; }
  }
}

let sessionCookies: Promise<Array<{ name: string; value: string }>> | null = null;
/** NextAuth credentials sign-in done over HTTP (csrf + callback): the cookies a browser would hold, without loading the login page. */
async function nextAuthCookies(web: string): Promise<Array<{ name: string; value: string }>> {
  const jar = new Map<string, string>();
  const take = (res: Response) => { for (const c of (res.headers as any).getSetCookie?.() ?? []) { const pair = String(c).split(";")[0]; const i = pair.indexOf("="); if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1)); } };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${web}/api/auth/csrf`); take(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${web}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() },
    body: new URLSearchParams({ csrfToken, email: ADMIN.email, password: ADMIN.password, callbackUrl: `${web}/en/dashboard`, json: "true" }),
  });
  take(res);
  return [...jar].filter(([k]) => /next-auth\.session-token/.test(k)).map(([name, value]) => ({ name, value }));
}

/**
 * Signs the browser in as the demo admin and opens `landing`. Fast path: the NextAuth session cookies are minted over HTTP once per process and
 * set on the browser (no model, no login-page compile); fallback: the real form. Every UI test calls this first.
 */
export async function signIn(fx: any, landing = "/en/dashboard") {
  const { app, browser } = fx;
  const web = String(app.baseUrl ?? process.env.E2E_ARMY_URL ?? "").replace(/\/+$/, "");
  try {
    sessionCookies ??= nextAuthCookies(web);
    const cookies = await sessionCookies;
    if (cookies.length) {
      await browser.setCookies(cookies.map((c) => ({ url: web, name: c.name, value: c.value, httpOnly: true, sameSite: "Lax" as const })));
      await app.open(landing);
      if (!/\/login/.test(await browser.url())) return;
    }
  } catch { sessionCookies = null; /* fall back to the form */ }
  await formSignIn(fx);
  await app.open(landing);
}

/** The heading (h1) of a dashboard page. */
export const h1 = (screen: any, name: string | RegExp) => screen.getByRole("heading", name, { level: 1 });

// ─────────────────────────────── misc builders ───────────────────────────────
/** Fixed document dates (deterministic): booked in the past, due far in the future so "current" aging never rots. */
export const DATE = { doc: "2026-03-10", payment: "2026-03-20", due: "2099-12-31", past: "2025-01-15", q1Start: "2026-01-01", q1End: "2026-03-31" } as const;
export const invoiceBody = (customerId: string, lines: Array<Record<string, string>>, extra: Record<string, unknown> = {}) => ({
  customerId, date: DATE.doc, dueDate: DATE.due, lines: lines.map((l, i) => ({ description: `Line ${i + 1}`, ...l })), ...extra,
});

// ─────────────────────────────── ledger helpers ───────────────────────────────
/** Deterministic UUID for an idempotency key (same name + SEED -> same key). */
export const uuidFrom = (name: string): string => {
  const h = createHash("sha1").update(`${process.env.E2E_ARMY_SEED ?? "nql-e2e-army-1"}:uuid:${name}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export const subDec = (a: unknown, b: unknown): string => { const n = String(b ?? "0").trim(); return sumDec([a, n.startsWith("-") ? n.slice(1) : `-${n}`]); };
/** Posted debit / credit totals of one account (exact strings). */
export async function acct(api: Api, accountId: string): Promise<{ debit: string; credit: string; natural: string }> {
  const r = await api.get(`/accounts/${accountId}/balance`);
  if (r.status !== 200) throw new Error(`balance of ${accountId} answered ${r.status} ${r.text.slice(0, 200)}`);
  return { debit: dec(r.body.totalDebits), credit: dec(r.body.totalCredits), natural: dec(r.body.balance) };
}
/** Creates an account of the tenant, or returns the one that already has this code (re-runs on the same database). */
export async function ensureAccount(t: Tenant, code: string, name: string, type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE"): Promise<string> {
  const made = await t.api.post("/accounts", { code, name, type });
  if (made.status === 201) return made.body.id;
  const list = await t.api.get("/accounts", { limit: 500, search: code });
  const found = rows(list).find((a: any) => a.code === code);
  if (!found) throw new Error(`account ${code}: create answered ${made.status} ${made.text.slice(0, 200)} and none exists`);
  return found.id;
}
/** The posted journal a source document produced (system journals carry sourceType + sourceId). */
export async function journalOf(api: Api, sourceType: string, sourceId: string, search?: string): Promise<any | undefined> {
  for (let page = 1; page <= 5; page++) {
    const r = await api.get("/journals", { limit: 100, page, sortBy: "createdAt", sortOrder: "desc", ...(search ? { search } : {}) });
    const hit = rows(r).find((j: any) => j.sourceType === sourceType && j.sourceId === sourceId);
    if (hit) return hit;
    if (rows(r).length < 100) break;
  }
  return undefined;
}
/** Links a sales-returns account to the tenant (credit notes post the net amount there). */
export async function salesReturnsAccount(t: Tenant): Promise<string> {
  const id = await ensureAccount(t, "4150", "Sales Returns and Allowances", "INCOME");
  const r = await t.api.patch("/organization/account-settings", { defaultSalesReturnsAccountId: id });
  if (r.status !== 200) throw new Error(`account-settings answered ${r.status} ${r.text.slice(0, 200)}`);
  return id;
}

/** The tenant's organization account settings (default AR / AP / revenue / VAT / bank / cash account ids), cached per tenant. */
const settingsCache = new WeakMap<Tenant, any>();
export async function defaults(t: Tenant): Promise<any> {
  let s = settingsCache.get(t);
  if (!s) { const r = await t.api.get("/organization/account-settings"); if (r.status !== 200) throw new Error(`account-settings answered ${r.status}`); s = r.body; settingsCache.set(t, s); }
  return s;
}

// ─────────────────────────────── inventory helpers ───────────────────────────────
export interface Stocked { itemId: string; sku: string; warehouseId: string; inventoryAccountId: string; shrinkageAccountId: string; cost: string }
/** A warehouse + an item holding `qty` units at `cost`, brought in through a real inventory adjustment (so stock and ledger agree). */
export async function stockedItem(t: Tenant, tag: string, qty = 10, cost = "60.25"): Promise<Stocked> {
  const inventoryAccountId = await ensureAccount(t, "1490", "E2E Inventory", "ASSET");
  const shrinkageAccountId = await ensureAccount(t, "6790", "E2E Inventory Shrinkage", "EXPENSE");
  const code = seeded(`WH-${tag}`, 4);
  const wh = await t.api.post("/warehouses", { code, name: seeded(`Warehouse ${tag}`) });
  const warehouseId = wh.status === 201 ? wh.body.id : rows(await t.api.get("/warehouses", { search: code })).find((w: any) => w.code === code)?.id;
  if (!warehouseId) throw new Error(`warehouse ${code}: ${wh.status} ${wh.text.slice(0, 200)}`);
  const sku = seeded(`SKU-${tag}`).toUpperCase();
  const item = await t.api.post("/items", { name: seeded(`Item ${tag}`), sku, type: "GOODS", unit: "PCS", sellingPrice: "100.00", costPrice: cost, inventoryAccountId });
  const itemId = item.status === 201 ? item.body.id : rows(await t.api.get("/items", { search: sku })).find((i: any) => i.sku === sku)?.id;
  if (!itemId) throw new Error(`item ${sku}: ${item.status} ${item.text.slice(0, 200)}`);
  const adj = await t.api.post("/inventory-adjustments", { date: DATE.doc, warehouseId, itemId, type: "INCREASE", quantity: qty, reason: "STOCKTAKE", accountId: shrinkageAccountId });
  if (adj.status !== 201) throw new Error(`opening adjustment: ${adj.status} ${adj.text.slice(0, 200)}`);
  return { itemId, sku, warehouseId, inventoryAccountId, shrinkageAccountId, cost };
}
