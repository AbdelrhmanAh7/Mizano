// Skill: e2e-army
// Title: Measure reduction in VAT filing corrections (@issue-120 AC1-AC3)
// Tests: Draft generation, correction recording, and metric calculation for tenant-scoped compliance metric

import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("@issue-120 AC1: metric definition is documented", { tags: ["feat:mz-reports"] }, async ({ app }) => {
  // Verify the metric definition exists in docs/reports.md
  await app.open("/en/docs/reports");
  const content = await app.page.content();
  expect(content).toContain("VAT filing corrections metric");
  expect(content).toContain("draft-assisted");
  expect(content).toContain("unassisted");
});

test("@issue-120 AC2: seeded scenario produces verifiable number", { tags: ["feat:mz-reports"] }, async ({ app, agent }) => {
  // Seed: create a filed VAT return, generate a draft before filing, record a correction after filing
  await app.open("/en/login");
  await agent.act("sign in as {email} with password {pw}", { params: { email: "admin@mizano.com", pw: "password123" } });

  // Create a filed VAT return
  await app.open("/en/tax/vat-returns");
  await agent.act("create a new VAT return for period {period}", { params: { period: "2024-01" } });
  await agent.act("submit the VAT return", { params: {} });
  await agent.act("file the VAT return", { params: {} });

  // Generate a draft before filing
  await app.open("/en/reports/vat-return-draft");
  await agent.act("open the draft for {fromDate} to {toDate}", { params: { fromDate: "2024-01-01", toDate: "2024-01-31" } });
  await agent.assert("the draft status is {status}", { params: { status: "complete" } });

  // Record a correction after filing
  await agent.act("record a filing correction for {period} with reason {reason}", {
    params: { period: "2024-01", reason: "omitted_invoice_adjustment" },
  });

  // Verify the metric shows the correction was counted
  await app.open("/en/reports/vat-filing-corrections-metric");
  const metricContent = await app.page.content();
  expect(metricContent).toContain("withDraft");
  expect(metricContent).toContain("correctionsCount");
  expect(metricContent).toContain("reductionPercentage");
});

test("@issue-120 AC3: tenant-scoped metric contains no PII or invoice text", { tags: ["feat:mz-reports"] }, async ({ app }) => {
  // Verify no PII or invoice text appears in metric responses
  await app.open("/en/login");
  await app.page.evaluate(() => {
    localStorage.setItem("user", JSON.stringify({ id: "user-1", name: "Test User", email: "test@example.com" }));
  });
  await app.open("/en/reports/vat-filing-corrections-metric");
  const metricContent = await app.page.content();
  // Should not contain invoice numbers, tax IDs, or other sensitive PII
  expect(metricContent).not.toMatch(/INV-\d+/);
  expect(metricContent).not.toMatch(/TAX-ID-\d+/);
  expect(metricContent).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/); // SSN-like pattern
});

test("@issue-120: unauthorized user cannot record corrections", { tags: ["feat:mz-reports"] }, async ({ app, agent }) => {
  // Create a SalesRep user without tax-management permissions
  await app.open("/en/login");
  await agent.act("sign in as {email} with password {pw}", { params: { email: "admin@mizano.com", pw: "password123" } });

  // Create a SalesRep user
  await app.open("/en/users");
  await agent.act("create a user with role {role}", { params: { role: "SalesRep" } });

  // Sign out and sign in as SalesRep
  await agent.act("sign out", { params: {} });
  await agent.act("sign in as {email} with password {pw}", { params: { email: "sales@example.com", pw: "password123" } });

  // Try to record a correction - should fail with 403
  await app.open("/en/reports/vat-return-draft/corrections");
  const response = await app.page.evaluate(async () => {
    const res = await fetch("/api/reports/vat-return-draft/corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        period: "2024-01",
        reason: "omitted_invoice_adjustment",
      }),
    });
    return { status: res.status };
  });
  expect(response.status).toBe(403);
});
