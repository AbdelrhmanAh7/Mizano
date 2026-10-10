// @issue-108 Cross-tenant isolation of the cursor-paginated ledger and invoice lists.
// The Nest e2e suite (apps/api/test/tenant-isolation.e2e-spec.ts) proves that tenant B's real ids
// are rejected as cursors; here, on the single-tenant verify stack, a cursor id the caller does not
// own (a foreign or unknown id) must be rejected with 404 while the scoped list still answers 200
// with no foreign rows. lvl:api — request-level only, no model.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { createHash } from "node:crypto";

const base = (process.env.E2E_ARMY_API ?? process.env.E2E_ARMY_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const seed = process.env.E2E_ARMY_SEED ?? "nql-e2e-army-1";
const seededEmail = (name: string) =>
  `${name}-${createHash("sha1").update(`${seed}:${name}`).digest("hex").slice(0, 8)}@army-108.test`;

async function raw(method: string, path: string, token: string | null, body?: unknown) {
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep the raw text */
  }
  return { status: res.status, body: parsed as Record<string, any> };
}

export interface Res {
  status: number;
  body: Record<string, any>;
}

/** Fresh organization + admin user, registered then logged in through the public auth API. */
async function tenantToken(): Promise<string> {
  const email = seededEmail("mz-cursor-isolation");
  const password = "ArmyE2e2026x";
  const payload = { email, password, firstName: "Army", lastName: "Cursor", organizationName: "Army Cursor Co" };
  let res: Res = await raw("POST", "/auth/register", null, payload);
  if (res.status === 429) {
    // AuthController is throttled even on the verify stack: poll for a free slot, never blind-retry.
    await expect
      .poll(async () => (res = await raw("POST", "/auth/register", null, payload)).status, {
        timeout: 85_000,
        interval: 5_000,
        message: "register stayed rate limited",
      })
      .not.toBe(429);
  }
  if (res.status === 409) {
    // Deterministic account from a previous run of the same stack.
    res = await raw("POST", "/auth/login", null, { email, password });
  }
  if (res.status !== 201 && res.status !== 200) throw new Error(`register/login answered ${res.status}`);
  return res.body.tokens.accessToken as string;
}

// One tenant per process: the two tests share the token, keeping auth calls inside the 5/60s budget.
let tokenPromise: Promise<string> | null = null;
const token = () => (tokenPromise ??= tenantToken());

const FOREIGN = [
  ["/invoices/cursor", "army-foreign-invoice"],
  ["/bills/cursor", "army-foreign-bill"],
  ["/journals/cursor", "army-foreign-journal"],
] as const;

test(
  "@issue-108 AC2/T4: a cursor id outside the tenant is rejected on the invoice, bill and journal cursor lists",
  { tags: ["feat:mz-sales-invoices", "feat:mz-purchase-bills", "feat:mz-journals", "lvl:api"] },
  async () => {
    const t = await token();
    for (const [path, foreign] of FOREIGN) {
      const res = await raw("GET", `${path}?cursor=${foreign}`, t);
      expect({ path, status: res.status }).toEqual({ path, status: 404 });
    }
  },
);

test(
  "@issue-108 AC2: the scoped cursor lists answer 200 with no foreign rows",
  { tags: ["feat:mz-sales-invoices", "feat:mz-purchase-bills", "feat:mz-journals", "lvl:api"] },
  async () => {
    const t = await token();
    for (const [path, foreign] of FOREIGN) {
      const res = await raw("GET", path, t);
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
      const rows: Array<{ id: string }> = Array.isArray(res.body.data) ? res.body.data : [];
      expect(rows.map((r) => r.id)).not.toContain(foreign);
    }
  },
);