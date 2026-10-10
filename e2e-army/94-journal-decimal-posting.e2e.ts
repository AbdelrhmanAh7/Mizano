import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Request-level test (no model call) for issue #94: the ledger command stores money exactly.
// Amounts are decimal strings; seeded names keep the run deterministic.

const PASSWORD = "ArmyE2e2026x";
const EMAIL = "army-94-ledger@army-e2e.test";

type Json = Record<string, any>;

test(
  "@issue-94 AC1: a journal with more than 4 decimals or a 0.0001 imbalance is rejected, an EGP 2dp journal balances exactly",
  { tags: ["feat:mz-journals"] },
  async ({ app }) => {
    const api = (process.env.E2E_ARMY_API ?? new URL("/api", app.baseUrl).href).replace(/\/+$/, "");
    const call = async (path: string, method: string, body?: unknown, token?: string): Promise<{ status: number; body: Json }> => {
      const res = await fetch(`${api}${path}`, {
        method,
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: (await res.json().catch(() => ({}))) as Json };
    };

    // A throwaway tenant: register it, or log in when an earlier run already did.
    let auth = await call("/auth/register", "POST", {
      email: EMAIL,
      password: PASSWORD,
      firstName: "Army",
      lastName: "Ledger",
      organizationName: "Army 94 Ledger",
    });
    if (auth.status === 409) auth = await call("/auth/login", "POST", { email: EMAIL, password: PASSWORD });
    expect([200, 201]).toContain(auth.status);
    const token: string = auth.body.tokens.accessToken;

    expect((await call("/accounts/seed-defaults", "POST", undefined, token)).status).toBe(201);
    const list = await call("/accounts?limit=500", "GET", undefined, token);
    const accounts: Json[] = list.body.data ?? list.body;
    expect(accounts.length).toBeGreaterThan(2);
    const [debitAccount, creditAccount] = [accounts[0].id as string, accounts[1].id as string];

    const post = (debit: string, credit: string, reference: string) =>
      call(
        "/journals",
        "POST",
        {
          date: "2026-03-10",
          reference,
          lines: [
            { accountId: debitAccount, debit },
            { accountId: creditAccount, credit },
          ],
        },
        token,
      );

    // Five decimals would be rounded per line by the Decimal(19,4) column: refused up front.
    expect((await post("10.00005", "10.00005", "army-94-5dp")).status).toBe(400);
    // One ten-thousandth apart is not balanced: no float tolerance.
    expect((await post("1000000.0001", "1000000", "army-94-imbalance")).status).toBe(400);
    // A balanced EGP amount with 2 decimals is stored exactly.
    const ok = await post("1234.56", "1234.56", "army-94-egp");
    expect(ok.status).toBe(201);
    const stored = await call(`/journals/${ok.body.id}`, "GET", undefined, token);
    expect(stored.status).toBe(200);
    expect(Number.parseFloat(stored.body.totalDebit)).toBe(1234.56);
    expect(String(stored.body.totalDebit)).toBe(String(stored.body.totalCredit));
  },
);
