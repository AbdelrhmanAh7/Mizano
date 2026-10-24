import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Request-level test for issue #11:
// Bill approval and payment posting are atomic and idempotent under concurrency.
// Seeded names and credentials keep the run deterministic.

const PASSWORD = "ArmyE2e2026x";
const EMAIL = "army-11-atomic@army-e2e.test";

type Json = Record<string, any>;

test(
  "@issue-11 AC1 AC2: concurrent bill approval and payment posting are atomic and idempotent",
  { tags: ["feat:mz-purchase-bills", "feat:mz-purchase-payments", "lvl:api"] },
  async ({ app }) => {
    const api = (process.env.E2E_ARMY_API ?? new URL("/api", app.baseUrl).href).replace(/\/+$/, "");
    const call = async (
      path: string,
      method: string,
      body?: unknown,
      token?: string,
    ): Promise<{ status: number; body: Json }> => {
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
      lastName: "Atomic",
      organizationName: "Army 11 Atomic AP",
    });
    if (auth.status === 409) {
      auth = await call("/auth/login", "POST", { email: EMAIL, password: PASSWORD });
    }
    expect([200, 201]).toContain(auth.status);
    const token: string = auth.body.tokens.accessToken;

    // Seed defaults for Chart of Accounts and default organization accounts.
    expect((await call("/accounts/seed-defaults", "POST", undefined, token)).status).toBe(201);

    const list = await call("/accounts?limit=500", "GET", undefined, token);
    const accounts: Json[] = list.body.data ?? list.body;
    expect(accounts.length).toBeGreaterThan(2);

    const expenseAccount = accounts.find(
      (a) => a.accountType === "EXPENSE" || a.accountSubtype === "OPERATING_EXPENSE",
    )?.id;
    expect(expenseAccount).toBeDefined();

    const bankAccountObj =
      accounts.find((a) => a.code === "1010" || a.code === "1000") ??
      accounts.find((a) => a.accountSubtype === "BANK" || a.accountSubtype === "CASH");
    expect(bankAccountObj).toBeDefined();
    expect(["1010", "1000"]).toContain(bankAccountObj.code);
    const bankAccount = bankAccountObj.id;

    // Create a vendor or find existing
    let vendorId: string;
    const vendorRes = await call("/vendors", "POST", { name: "Army 11 Vendor" }, token);
    if (vendorRes.status === 201) {
      vendorId = vendorRes.body.id;
    } else {
      const vendorsList = await call("/vendors", "GET", undefined, token);
      const v = (vendorsList.body.data ?? vendorsList.body)[0];
      vendorId = v.id;
    }
    expect(vendorId).toBeDefined();

    // ───────────────────────────────────────────────────────────
    // AC1: Concurrent approval of the same draft bill
    // ───────────────────────────────────────────────────────────
    const bill1Res = await call(
      "/bills",
      "POST",
      {
        vendorId,
        date: "2026-03-01",
        dueDate: "2026-03-31",
        lines: [
          {
            description: "Consulting",
            accountId: expenseAccount,
            quantity: "1",
            rate: "100",
            taxRate: "0",
          },
        ],
      },
      token,
    );
    expect(bill1Res.status).toBe(201);
    const bill1Id = bill1Res.body.id;

    // Three simultaneous approval attempts (restored per CTO requirement)
    const approvalResults = await Promise.all([
      call(`/bills/${bill1Id}/approve`, "POST", undefined, token),
      call(`/bills/${bill1Id}/approve`, "POST", undefined, token),
      call(`/bills/${bill1Id}/approve`, "POST", undefined, token),
    ]);

    const approvalStatuses = approvalResults.map((r) => r.status);
    const approvalSuccesses = approvalStatuses.filter((s) => s === 201);
    const approvalFailures = approvalStatuses.filter((s) => s !== 201);

    expect(approvalSuccesses).toHaveLength(1);
    expect(approvalFailures).toHaveLength(2);
    for (const f of approvalFailures) expect([400, 409]).toContain(f);

    const bill1After = await call(`/bills/${bill1Id}`, "GET", undefined, token);
    expect(bill1After.status).toBe(200);
    expect(bill1After.body.status).toBe("OPEN");

    const journalsRes = await call(`/journals?sourceType=BILL_APPROVAL&sourceId=${bill1Id}`, "GET", undefined, token);
    const journalsList: Json[] = journalsRes.body.data ?? journalsRes.body;
    const bill1Journals = journalsList.filter(
      (j) => j.sourceType === "BILL_APPROVAL" && j.sourceId === bill1Id,
    );
    expect(bill1Journals).toHaveLength(1);

    // ───────────────────────────────────────────────────────────
    // AC2: Concurrent payments that together exceed bill balance
    // ───────────────────────────────────────────────────────────
    const bill2Res = await call(
      "/bills",
      "POST",
      {
        vendorId,
        date: "2026-03-02",
        dueDate: "2026-03-31",
        lines: [
          {
            description: "Maintenance",
            accountId: expenseAccount,
            quantity: "1",
            rate: "100",
            taxRate: "0",
          },
        ],
      },
      token,
    );
    expect(bill2Res.status).toBe(201);
    const bill2Id = bill2Res.body.id;

    const approveBill2 = await call(`/bills/${bill2Id}/approve`, "POST", undefined, token);
    expect(approveBill2.status).toBe(201);

    const paymentPayload = {
      vendorId,
      date: "2026-03-03",
      amount: "100",
      paymentMode: "BANK_TRANSFER",
      paidFromAccountId: bankAccount,
      allocations: [{ billId: bill2Id, amount: "100" }],
    };

    // Two simultaneous payments of 100 for a 100-balance bill
    const paymentResults = await Promise.all([
      call("/payments-made", "POST", paymentPayload, token),
      call("/payments-made", "POST", paymentPayload, token),
    ]);

    const paymentStatuses = paymentResults.map((r) => r.status);
    const paymentSuccesses = paymentStatuses.filter((s) => s === 201);
    const paymentFailures = paymentStatuses.filter((s) => s !== 201);

    expect(paymentSuccesses).toHaveLength(1);
    expect(paymentFailures).toHaveLength(1);
    expect(paymentFailures[0]).toBe(400);

    const paymentId = paymentSuccesses[0].body.id;
    const bill2After = await call(`/bills/${bill2Id}`, "GET", undefined, token);
    expect(bill2After.status).toBe(200);
    expect(bill2After.body.status).toBe("PAID");
    expect(Number(bill2After.body.balanceDue)).toBe(0);
    expect(bill2After.body.billAllocations).toBeDefined();
    expect(bill2After.body.billAllocations).toHaveLength(1);

    // Explicit assertion: exactly one PAYMENT_MADE journal and one allocation for bill2
    const paymentJournalsRes = await call(
      `/journals?sourceType=PAYMENT_MADE&sourceId=${paymentId}`,
      "GET",
      undefined,
      token,
    );
    const paymentJournalsList: Json[] = paymentJournalsRes.body.data ?? paymentJournalsRes.body;
    const paymentJournals = paymentJournalsList.filter(
      (j) => j.sourceType === "PAYMENT_MADE" && j.sourceId === paymentId,
    );
    expect(paymentJournals).toHaveLength(1);

    const allocationsRes = await call(`/bills/${bill2Id}/allocations`, "GET", undefined, token);
    const allocationsList: Json[] = allocationsRes.body.data ?? allocationsRes.body;
    expect(allocationsList).toHaveLength(1);
    expect(allocationsList[0].amount).toBe("100");
    expect(allocationsList[0].paymentId).toBe(paymentId);

    const tbRes = await call("/accounting-reports/trial-balance", "GET", undefined, token);
    expect(tbRes.status).toBe(200);
    expect(tbRes.body.totals.totalDebits).toBe(tbRes.body.totals.totalCredits);
  },
);
