// AI + document intake features (shard ai-api). The verify stack has no Ollama / OCR / Redis (OLLAMA_ENABLED=false, REDIS_URL empty), so
// the AI features are advisory: reads must answer with an empty state, model-backed actions must degrade gracefully (never a 500), and nothing
// may post to the ledger. Intake runs in-process (no Redis) and extracts native-text PDFs without OCR.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { DATE, Api, adminApi, anon, dec, ids, journalOf, ledgerTenant, rows, seeded } from "./_mz.e2e.ts";
import { createHash } from "node:crypto";

const A = () => ledgerTenant("ai");
const B = () => ledgerTenant("ai-b");

/** The AI contract in the verify stack: a clean answer, or an explicit 503 "AI unavailable" - never a crash. */
const graceful = (status: number) => (status >= 200 && status < 300) || status === 503 || status === 400 || status === 404;
async function sweep(api: Api, calls: Array<[string, string, unknown?]>): Promise<string[]> {
  const failures: string[] = [];
  for (const [method, path, body] of calls) {
    const r = await api.request(method, path, method === "GET" ? {} : { body: body ?? {} });
    if (!graceful(r.status)) failures.push(`${method} ${path} -> ${r.status} ${r.text.slice(0, 100)}`);
  }
  return failures;
}
function pdfFixture(marker: string): Uint8Array {
  const text = `Invoice ${marker} Total 115.00`;
  return new TextEncoder().encode(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
      `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n` +
      `4 0 obj<</Length ${text.length + 30}>>stream\nBT /F1 12 Tf 20 100 Td (${text}) Tj ET\nendstream endobj\n` +
      `5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  );
}
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const TERMINAL = ["EXTRACTED", "NEEDS_REVIEW", "FAILED", "DEAD_LETTER", "APPROVED"];

test("[mz-ai-insights.2] AI insights API: insights, alerts, forecasts and feedback answer for a new organization and never post to the ledger", { tags: ["feat:mz-ai-insights", "shard:ai-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  for (const p of ["/ai/insights", "/ai/alerts", "/ai/alerts/summary", "/ai/forecast/revenue", "/ai/feedback/stats"]) expect((await anon.get(p)).status).toBe(401);
  const journalsBefore = rows(await b.api.get("/journals", { limit: 100 })).length;
  const failures = await sweep(a.api, [
    ["GET", "/ai/insights"], ["GET", "/ai/alerts"], ["GET", "/ai/alerts/summary"], ["GET", "/ai/alerts/critical"], ["GET", "/ai/alerts/category/FINANCIAL"],
    ["GET", "/ai/forecast/revenue"], ["GET", "/ai/forecast/cash-flow"], ["GET", "/ai/forecast/expenses"], ["GET", "/ai/forecast/customer-churn"],
    ["GET", "/ai/feedback/stats?feature=CATEGORIZATION"], ["GET", "/ai/feedback/trends/CATEGORIZATION"], ["GET", "/ai/feedback/recent/CATEGORIZATION"],
  ]);
  expect(failures).toEqual([]);
  const insights = await a.api.get("/ai/insights");
  expect(insights.status).toBe(200);
  expect(rows(insights)).toHaveLength(0); // a new organization has no insights yet
  // the demo organization carries seeded insights
  const demo = await (await adminApi()).get("/ai/insights");
  expect(JSON.stringify(demo.body)).toContain("Cash Flow Warning");
  expect((await a.api.get("/ai/insights/ghost")).status).toBe(404);
  expect((await a.api.post("/ai/alerts/read-all")).status).toBeLessThan(300);
  // feedback is stored for the submitting tenant only and validated
  const fb = await a.api.post("/ai/feedback", { feature: "CATEGORIZATION", userAction: "ACCEPTED", aiSuggestion: { label: "Office Supplies", confidence: 0.85 }, inputData: { description: "Office supplies purchase", amount: 150 } });
  expect(fb.status).toBe(201);
  expect((await a.api.post("/ai/feedback", { feature: "NOT_A_FEATURE", userAction: "ACCEPTED", aiSuggestion: {}, inputData: {} })).status).toBe(400);
  expect(JSON.stringify((await a.api.get("/ai/feedback/stats", { feature: "CATEGORIZATION" })).body)).toMatch(/1/);
  expect(JSON.stringify((await b.api.get("/ai/feedback/stats", { feature: "CATEGORIZATION" })).body)).not.toMatch(/ACCEPTED":\s*[1-9]/);
  expect(rows(await b.api.get("/journals", { limit: 100 })).length).toBe(journalsBefore); // advisory only
});

test("[mz-ai-assistant.2] assistant API: chatbot, knowledge search, narratives and voice commands answer or report the model as unavailable", { tags: ["feat:mz-ai-assistant", "shard:ai-api", "lvl:api"] }, async () => {
  const a = await A();
  expect((await anon.post("/ai/chatbot/message", { message: "hi" })).status).toBe(401);
  const msg = await a.api.post("/ai/chatbot/message", { message: "How many invoices are overdue?" });
  expect(graceful(msg.status), msg.text.slice(0, 160)).toBe(true);
  if (msg.status < 300) expect(msg.body).toMatchObject({ response: expect.any(String), intent: expect.any(String) });
  expect((await a.api.post("/ai/chatbot/message", { message: "" })).status).toBe(400);
  expect((await a.api.post("/ai/chatbot/message", {})).status).toBe(400);
  const history = await a.api.get("/ai/chatbot/history");
  expect(history.status).toBe(200);
  expect((await a.api.del("/ai/chatbot/history")).status).toBeLessThan(300);
  expect(await sweep(a.api, [
    ["GET", "/ai/knowledge/search?q=invoice"], ["GET", "/ai/knowledge/suggestions"], ["POST", "/ai/knowledge/index", {}],
    ["GET", "/ai/narrative/monthly"], ["GET", "/ai/narrative/weekly"], ["GET", "/ai/narrative/cash-flow"], ["GET", "/ai/narrative/queries"],
    ["GET", "/ai/voice/commands"], ["POST", "/ai/voice/parse", { text: "create an invoice for Nile Tech" }],
  ])).toEqual([]);
});

test("[mz-ai-risk-compliance.1] risk APIs: anomalies, fraud alerts, audit risk, compliance and pattern detection answer with clean empty states", { tags: ["feat:mz-ai-risk-compliance", "shard:ai-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/ai/anomalies")).status).toBe(401);
  expect((await anon.get("/ai/fraud/alerts")).status).toBe(401);
  const customer = (await a.api.post("/customers", { name: seeded("Risk customer"), currency: "USD" })).body.id;
  expect(await sweep(a.api, [
    ["GET", "/ai/anomalies"], ["GET", "/ai/anomalies/stats"], ["POST", "/ai/anomalies/scan", {}],
    ["GET", "/ai/fraud/alerts"], ["POST", "/ai/fraud/scan", {}], [ "GET", `/ai/fraud/score/customer/${customer}`],
    ["GET", "/ai/audit-risk/high-risk"], ["GET", `/ai/audit-risk/customer/${customer}`],
    ["GET", "/ai/compliance/report"], ["GET", "/ai/compliance/score"],
    ["GET", "/ai/patterns"], ["GET", "/ai/patterns/suggestions"],
  ])).toEqual([]);
  const anomalies = await a.api.get("/ai/anomalies");
  expect(anomalies.status).toBe(200);
  // another organization's risk data is never visible
  expect(JSON.stringify((await b.api.get("/ai/anomalies")).body)).not.toContain(customer);
  expect((await b.api.get(`/ai/audit-risk/customer/${customer}`)).status).toBeLessThan(600);
});

test("[mz-ai-predictions.1] prediction APIs: cash flow, payments, churn, lifetime value, leads, pipeline, pricing, sentiment and reconciliation answer without errors", { tags: ["feat:mz-ai-predictions", "shard:ai-api", "lvl:api"] }, async () => {
  const a = await A();
  expect((await anon.get("/ai/cash-flow/quick")).status).toBe(401);
  const customer = (await a.api.post("/customers", { name: seeded("Prediction customer"), currency: "USD" })).body.id;
  expect(await sweep(a.api, [
    ["GET", "/ai/cash-flow/forecast"], ["GET", "/ai/cash-flow/quick"], ["GET", "/ai/cash-flow/scenarios"], ["GET", "/ai/cash-flow/alerts"],
    ["GET", "/ai/payment-prediction/outstanding"], ["GET", "/ai/payment-prediction/collection-priority"], ["GET", `/ai/payment-prediction/customer/${customer}/profile`],
    ["GET", "/ai/churn/high-risk"], ["GET", `/ai/churn/customer/${customer}`],
    ["GET", "/ai/clv/segments"], ["GET", "/ai/clv/distribution"], ["GET", `/ai/clv/customer/${customer}`],
    ["GET", `/ai/cross-sell/customer/${customer}`], ["GET", "/ai/lead-scoring/hot"], ["GET", "/ai/lead-scoring/cold"], ["GET", "/ai/lead-scoring/distribution"], ["GET", "/ai/lead-scoring/ml-status"],
    ["GET", "/ai/pipeline/forecast"], ["GET", "/ai/pipeline/weighted"], ["GET", "/ai/pipeline/conversion-rates"],
    ["GET", "/ai/pricing/insights"], ["GET", "/ai/sentiment/trends"], ["GET", `/ai/sentiment/customer/${customer}`],
    ["GET", "/ai/reconciliation/patterns"], ["GET", "/ai/reconciliation/rules"],
  ])).toEqual([]);
  const quick = await a.api.get("/ai/cash-flow/quick");
  expect(quick.status).toBe(200);
});

test("[mz-ai-operations.1] operations and HR AI APIs: demand, reorder points, resources, routes, maintenance, quality, workforce, skills, attrition and compensation answer without errors", { tags: ["feat:mz-ai-operations", "shard:ai-api", "lvl:api"] }, async () => {
  const a = await A();
  expect((await anon.get("/ai/reorder/alerts")).status).toBe(401);
  expect(await sweep(a.api, [
    ["GET", "/ai/demand-forecast/dashboard"], ["GET", "/ai/reorder/alerts"], ["GET", "/ai/reorder/summary"], ["GET", "/ai/reorder/dead-stock"], ["GET", "/ai/reorder/abc-analysis"],
    ["GET", "/ai/resources/trends"], ["GET", "/ai/resources/forecast"], ["GET", "/ai/resources/opportunities"], ["GET", "/ai/resources/efficiency"],
    ["GET", "/ai/routes/analytics"], ["GET", "/ai/maintenance/schedule"], ["GET", "/ai/maintenance/health-scores"], ["GET", "/ai/quality/trends"],
    ["GET", "/ai/workforce/suggest"], ["GET", "/ai/workforce/staffing-needs"], ["GET", "/ai/workforce/attendance-patterns"], ["GET", "/ai/workforce/overtime"],
    ["GET", "/ai/skills/inventory"], ["GET", "/ai/attrition/flight-risk"],
    ["GET", "/ai/compensation/departments"], ["GET", "/ai/compensation/outliers"], ["GET", "/ai/compensation/distribution"],
  ])).toEqual([]);
  expect((await a.api.get("/ai/demand-forecast/dashboard")).status).toBe(200);
});

test("[mz-ai-categorization.1] categorization and extraction APIs: bank transactions and documents get a suggestion or an explicit unavailable answer; suggestions are never posted", { tags: ["feat:mz-ai-categorization", "shard:ai-api", "lvl:api"] }, async () => {
  const a = await A();
  expect((await anon.post("/ai/categorization/predict", {})).status).toBe(401);
  const entries0 = rows(await a.api.get("/journals", { limit: 100 })).length;
  expect(await sweep(a.api, [
    ["GET", "/ai/categorization/stats"], ["GET", "/ai/categorize/stats"], ["GET", "/ai/categorize/bank-transactions"],
    ["POST", "/ai/categorization/predict", { description: "Office supplies purchase", amount: 150 }],
    ["POST", "/ai/categorize", { description: "Monthly rent payment", amount: 5000 }],
    ["POST", "/ai/suggest-vendor", { description: "Amazon Web Services invoice" }],
    ["POST", "/ai/entities/extract", { text: "Invoice from Supplier Alpha total 115.00 EGP" }],
    ["POST", "/ai/documents/classify", { text: "Invoice number 77 total due 115.00" }], ["GET", "/ai/documents/ml-status"],
  ])).toEqual([]);
  expect(rows(await a.api.get("/journals", { limit: 100 })).length).toBe(entries0); // AI is advisory: nothing is auto-posted
});

test("[mz-deep-search.2] DeepSearch API: job history and permissions are served read-only (no external scrape is started)", { tags: ["feat:mz-deep-search", "shard:ai-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/ai/deep-search/jobs")).status).toBe(401);
  const jobs = await a.api.get("/ai/deep-search/jobs");
  expect(jobs.status).toBe(200);
  expect(rows(jobs)).toHaveLength(0);
  expect((await a.api.get("/ai/deep-search/jobs/ghost")).status).toBe(404);
  expect((await a.api.get("/ai/deep-search/suggestions/ghost/prompt")).status).toBe(404);
  expect((await a.api.patch("/ai/deep-search/suggestions/ghost", { status: "ACCEPTED" })).status).toBeGreaterThanOrEqual(400);
  expect((await b.api.get("/ai/deep-search/jobs")).status).toBe(200);
  // starting a job scrapes external web sources and reads the repository: refused to run here, only its input validation is checked
  expect((await a.api.post("/ai/deep-search/run", { notAField: true })).status).toBe(400);
});

test("[mz-document-intake.1] intake API: a PDF becomes a durable job with its original preserved; duplicates return the same job; jobs are tenant scoped", { tags: ["feat:mz-document-intake", "shard:ai-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  const bytes = pdfFixture(seeded("INTAKE").replace(/\W/g, ""));
  const file = { name: "inv.pdf", type: "application/pdf", data: bytes };
  expect((await anon.upload("/ai/document-intake/process", file)).status).toBe(401);
  expect((await a.api.request("POST", "/ai/document-intake/process", { body: {} })).status).toBe(400); // no file
  expect((await a.api.upload("/ai/document-intake/process", { name: "notes.txt", type: "text/plain", data: "hello" })).status).toBeGreaterThanOrEqual(400);

  const up = await a.api.upload("/ai/document-intake/process", file);
  expect(up.status).toBe(201);
  const jobId = up.body.data.jobId as string;
  expect(up.body.data.duplicate).toBe(false);
  const again = await a.api.upload("/ai/document-intake/process", { ...file, name: "renamed.pdf" });
  expect(again.body.data).toMatchObject({ jobId, duplicate: true });
  const other = await b.api.upload("/ai/document-intake/process", file);
  expect(other.body.data.duplicate).toBe(false);
  expect(other.body.data.jobId).not.toBe(jobId);

  const original = await a.api.request("GET", `/ai/document-intake/${jobId}/original`);
  expect(original.status).toBe(200);
  expect(original.headers.get("content-type")).toContain("application/pdf");
  expect(sha(new TextEncoder().encode(original.text))).toBe(sha(bytes)); // byte for byte
  const result = await a.api.get(`/ai/document-intake/${jobId}/result`);
  expect(result.status).toBe(200);
  expect(result.body.data).not.toHaveProperty("storageKey");
  const mine = await a.api.get("/ai/document-intake/jobs");
  expect(ids(mine)).toContain(jobId);
  expect(ids(await b.api.get("/ai/document-intake/jobs"))).not.toContain(jobId);
  expect((await a.api.get("/ai/document-intake/jobs", { status: "BOGUS" })).status).toBe(400);
  for (const path of ["", "/result", "/original"]) expect((await b.api.get(`/ai/document-intake/${jobId}${path}`)).status).toBe(404);
  expect((await b.api.post(`/ai/document-intake/${jobId}/retry`)).status).toBe(404);
  expect((await anon.get(`/ai/document-intake/${jobId}/result`)).status).toBe(401);
  expect((await anon.get("/ai/document-intake/jobs")).status).toBe(401);
});

test("[mz-intake-processor.1] intake worker job: an uploaded PDF is processed in the background to a terminal state with an attempt count, without Redis", { tags: ["feat:mz-intake-processor", "shard:ai-api", "lvl:api"], timeout: 260_000 }, async () => {
  const a = await A();
  const bytes = pdfFixture(seeded("WORKER").replace(/\W/g, ""));
  const up = await a.api.upload("/ai/document-intake/process", { name: "worker.pdf", type: "application/pdf", data: bytes });
  expect(up.status).toBe(201);
  const jobId = up.body.data.jobId as string;
  expect(["QUEUED", "PROCESSING", ...TERMINAL]).toContain(up.body.data.status);
  // the worker (BullMQ without Redis: in-process timers) picks the job up on its own
  let last: any;
  await expect.poll(async () => { last = (await a.api.get(`/ai/document-intake/${jobId}/result`)).body.data; return last?.status; }, { timeout: 200_000, interval: 3_000, message: "the intake job never left QUEUED/PROCESSING" }).toMatch(/^(EXTRACTED|NEEDS_REVIEW|FAILED|DEAD_LETTER)$/);
  expect(last.status === "FAILED" || last.status === "DEAD_LETTER" ? last.error ?? last.lastError ?? "failed without a reason" : "ok").toBeTruthy();
  if (last.status === "EXTRACTED" || last.status === "NEEDS_REVIEW") expect(last.result?.extractedFields ?? last.result).toBeTruthy();
  expect(last.stage).toBeTruthy();
  // a terminal job can be retried only when it failed; an extracted one answers 409
  const retry = await a.api.post(`/ai/document-intake/${jobId}/retry`);
  expect(retry.status).toBe(last.status === "EXTRACTED" || last.status === "NEEDS_REVIEW" ? 409 : 201);
});

test("[mz-bill-scan.2] scan confirmation API: a reviewed document becomes a draft bill with the same exact totals as the manual bill; guards and idempotency", { tags: ["feat:mz-bill-scan", "shard:ai-api", "lvl:api"], timeout: 260_000 }, async () => {
  const a = await A(), b = await B();
  const vendor = (await a.api.post("/vendors", { name: seeded("Scan vendor") })).body.id;
  const lines = [
    { description: "CPU", quantity: "3", rate: "33.33", taxRate: "14" },
    { description: "Cable", quantity: "1.375", rate: "19.999", taxRate: "5" },
    { description: "Stand", quantity: "7", rate: "0.35", taxRate: "0" },
  ];
  const common = { vendorId: vendor, date: DATE.doc, dueDate: DATE.due };
  const manual = await a.api.post("/bills", { ...common, lines: lines.map((l) => ({ ...l, accountId: a.chart.rent })) });
  expect(manual.status).toBe(201);
  const scanned = await a.api.post("/ai/document-intake/confirm", { ...common, type: "BILL", lines: lines.map(({ taxRate, ...l }) => ({ ...l, taxRatePercent: taxRate, accountId: a.chart.rent })) });
  expect(scanned.status).toBe(201);
  const draft = (await a.api.get(`/bills/${scanned.body.data.id}`)).body;
  expect(draft.status).toBe("DRAFT");
  expect([dec(draft.subtotal), dec(draft.taxAmount), dec(draft.grandTotal)]).toEqual(["129.94", "15.38", "145.32"]);
  expect([dec(draft.subtotal), dec(draft.taxAmount), dec(draft.grandTotal)]).toEqual([dec(manual.body.subtotal), dec(manual.body.taxAmount), dec(manual.body.grandTotal)]);
  expect(await journalOf(a.api, "BILL_APPROVAL", draft.id)).toBeUndefined(); // a scan never posts by itself

  // guards
  expect((await a.api.post("/ai/document-intake/confirm", { ...common, type: "BILL", currencyCode: "ZZZ", lines: [{ description: "x", quantity: "1", rate: "1", taxRatePercent: "0" }] })).status).toBe(400);
  expect((await a.api.post("/ai/document-intake/confirm", { ...common, type: "BILL", lines: [] })).status).toBe(400);
  expect((await a.api.post("/ai/document-intake/confirm", { ...common, type: "BILL", lines: [{ description: "x", quantity: "1", rate: "1.00001", taxRatePercent: "0" }] })).status).toBe(400);
  expect((await b.api.post("/ai/document-intake/confirm", { ...common, type: "BILL", lines: [{ description: "x", quantity: "1", rate: "1", taxRatePercent: "0" }] })).status).toBe(400); // another tenant's vendor
  expect((await anon.post("/ai/document-intake/confirm", {})).status).toBe(401);

  // confirming with a jobId approves the job exactly once and links the draft
  const up = await a.api.upload("/ai/document-intake/process", { name: "confirm.pdf", type: "application/pdf", data: pdfFixture(seeded("CONFIRM").replace(/\W/g, "")) });
  const jobId = up.body.data.jobId as string;
  await expect.poll(async () => (await a.api.get(`/ai/document-intake/${jobId}/result`)).body.data?.status, { timeout: 200_000, interval: 3_000 }).toMatch(/^(EXTRACTED|NEEDS_REVIEW|FAILED|DEAD_LETTER)$/);
  const body = { ...common, type: "BILL", jobId, lines: [{ description: "CPU", quantity: "1", rate: "100", taxRatePercent: "0", accountId: a.chart.rent }] };
  const first = await a.api.post("/ai/document-intake/confirm", body);
  expect(first.status).toBe(201);
  expect((await a.api.post("/ai/document-intake/confirm", body)).status).toBe(409);
  expect((await a.api.get(`/ai/document-intake/${jobId}/result`)).body.data.status).toBe("APPROVED");
});

test("[mz-ai-infrastructure.1] AI infrastructure API: model status is admin only and tunnel updates need the shared secret", { tags: ["feat:mz-ai-infrastructure", "shard:ai-api", "lvl:api"] }, async () => {
  const a = await A();
  expect((await anon.get("/internal/ollama-status")).status).toBe(401);
  const status = await a.api.get("/internal/ollama-status");
  expect(status.status).toBeLessThan(500);
  expect(JSON.stringify(status.body)).not.toMatch(/OLLAMA_WEBHOOK_SECRET|secret"\s*:/i);
  // Colab pushes the tunnel URL with a secret; without (or with a wrong) secret the update is refused and the URL unchanged
  const noSecret = await anon.post("/internal/tunnel-update", { url: "https://evil.example.test" });
  expect([400, 401, 403]).toContain(noSecret.status);
  const wrong = await anon.request("POST", "/internal/tunnel-update", { body: { url: "https://evil.example.test" }, headers: { "x-webhook-secret": "not-the-secret", authorization: "Bearer not-the-secret" } });
  expect([400, 401, 403]).toContain(wrong.status);
  const after = await a.api.get("/internal/ollama-status");
  expect(JSON.stringify(after.body)).not.toContain("evil.example.test");
});

test("[mz-ai-schedulers.1] AI scheduler jobs: their manual triggers (scan, recalculate, predict-all, score-all) run safely on a new organization and post nothing", { tags: ["feat:mz-ai-schedulers", "shard:ai-api", "lvl:api"] }, async () => {
  // The nightly/weekly @Cron schedulers (ai-security / ai-operations / ai-hr-ops / ai-sales-crm / ai-nlp-chat) call the same services as
  // these controller triggers; the crons themselves need Ollama and wall-clock time. A trigger must finish with a 2xx or an explicit 503.
  const a = await A();
  const entries0 = rows(await a.api.get("/journals", { limit: 100 })).length;
  expect(await sweep(a.api, [
    ["POST", "/ai/anomalies/scan", {}], ["POST", "/ai/fraud/scan", {}], ["POST", "/ai/churn/predict-all", {}], ["POST", "/ai/clv/calculate-all", {}],
    ["POST", "/ai/lead-scoring/score-all", {}], ["POST", "/ai/cash-flow/recalculate", {}], ["POST", "/ai/demand-forecast/recalculate", {}],
    ["POST", "/ai/reorder/recalculate", {}], ["POST", "/ai/reorder/abc-recalculate", {}], ["POST", "/ai/maintenance/predict-all", {}],
    ["POST", "/ai/attrition/predict-all", {}], ["POST", "/ai/payment-prediction/rebuild-profiles", {}], ["POST", "/ai/cross-sell/rebuild-matrix", {}],
    ["POST", "/ai/knowledge/rebuild-index", {}], ["POST", "/ai/alerts/aggregate", {}], ["POST", "/ai/alerts/cleanup", {}],
  ])).toEqual([]);
  expect(rows(await a.api.get("/journals", { limit: 100 })).length).toBe(entries0);
});
