// HR, CRM, projects and manufacturing features.
//   shards ui-people / ui-projects-mfg : browser tests on the seeded demo org
//   shard  people-api                  : request-level tests on fresh tenants
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { needsModel } from "../lib.ts";
import { DATE, acct, adminApi, anon, dec, ensureAccount, h1, ids, ledgerTenant, rows, seeded, seededEmail, signIn, stockedItem, subDec, tenant } from "./_mz.e2e.ts";

const A = () => ledgerTenant("people");
const B = () => tenant("people-b");

async function arabic({ app, screen, browser }: any, path: string, title?: string) {
  await app.open(path);
  if (title) await expect(h1(screen, title)).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
}

// ───────────────────────────────────────────── ui: people ─────────────────────────────────────────────
test("[mz-employees.1] create an employee through the form and find them in the employees list", { tags: ["feat:mz-employees", "shard:ui-people", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  const name = seeded("Employee"), email = seededEmail("employee");
  await signIn(fx, "/en/hr/employees/new");
  await expect(h1(screen, "New Employee")).toBeVisible({ timeout: 90_000 });
  await agent.act("fill the new employee form with the name {name}, the email {email} and the basic salary 5000, then press the save / create button. The step is complete once save was pressed, even if the app then shows another page", { params: { name, email }, maxModelCalls: 16 });
  const api = await adminApi();
  await expect.poll(async () => rows(await api.get("/employees", { search: name })).some((e) => e.name === name && e.email === email), { timeout: 30_000 }).toBe(true);
  await app.open("/en/hr/employees");
  await expect(h1(screen, "Employees")).toBeVisible({ timeout: 60_000 });
  await agent.waitFor("the employees table has finished loading and lists employees such as 'Khaled Mostafa' (Engineering) and 'Dina Samir' (Sales)");
  await arabic(fx, "/ar/hr/employees", "الموظفون");
});

test("[mz-attendance.1] the attendance page lists the seeded attendance records and the record form opens", { tags: ["feat:mz-attendance", "shard:ui-people", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/hr/attendance");
  await expect(h1(screen, "Attendance")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the attendance page has finished loading and shows attendance records or a daily summary with present / absent counts");
  await app.open("/en/hr/attendance/mark");
  await expect(h1(screen, "Record Attendance")).toBeVisible({ timeout: 60_000 });
  await agent.assert("a form is shown to record attendance with an employee, a date and a status");
  await arabic(fx, "/ar/hr/attendance", "الحضور");
});

test("[mz-payroll.1] the payroll page shows the seeded paid payroll run and the new payroll run form opens", { tags: ["feat:mz-payroll", "shard:ui-people", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/hr/payroll");
  await expect(h1(screen, "Payroll")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the payroll runs list has finished loading and lists the run for February 2026 with a Paid status and gross / net totals");
  await app.open("/en/hr/payroll/run");
  await expect(h1(screen, "New Payroll Run")).toBeVisible({ timeout: 60_000 });
  await agent.assert("a form is shown to start a payroll run with a month and a year selection");
  await arabic(fx, "/ar/hr/payroll", "الرواتب");
});

test("[mz-crm-leads.1] create a lead through the form and find it in the leads list", { tags: ["feat:mz-crm-leads", "shard:ui-people", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  const leadName = seeded("Lead");
  await signIn(fx, "/en/crm/leads/new");
  await expect(h1(screen, "New Lead")).toBeVisible({ timeout: 90_000 });
  await agent.act("fill the new lead form with the lead name {leadName} and the company 'Army Test Co', then press the save / create button. The step is complete once save was pressed, even if the app then shows another page", { params: { leadName }, maxModelCalls: 14 });
  const api = await adminApi();
  await expect.poll(async () => rows(await api.get("/crm/leads", { search: leadName })).some((l) => l.leadName === leadName), { timeout: 30_000 }).toBe(true);
  await app.open("/en/crm/leads");
  await expect(h1(screen, "Leads")).toBeVisible({ timeout: 60_000 });
  await agent.waitFor("the leads list has finished loading and lists leads such as 'Mahmoud Fathy' and 'Rania Soliman' with statuses");
  await arabic(fx, "/ar/crm/leads", "العملاء المحتملون");
});

test("[mz-crm-deals.1] the deal pipeline shows the seeded deals by stage and the new deal form opens", { tags: ["feat:mz-crm-deals", "shard:ui-people", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/crm/deals");
  await expect(h1(screen, "Deal Pipeline")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the pipeline board has finished loading and shows stage columns with the deals 'Sinai Mining - Full ERP' and 'Nile Tech - Phase 2'");
  await app.open("/en/crm/deals/new");
  await expect(h1(screen, "New Deal")).toBeVisible({ timeout: 60_000 });
  await arabic(fx, "/ar/crm/deals", "خط أنابيب الصفقات");
});

// ───────────────────────────────────────────── ui: projects + manufacturing ─────────────────────────────────────────────
test("[mz-projects.1] create a project through the form and see the seeded projects and the task list", { tags: ["feat:mz-projects", "shard:ui-projects-mfg", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  const name = seeded("Project");
  await signIn(fx, "/en/projects/new");
  await expect(h1(screen, "New Project")).toBeVisible({ timeout: 90_000 });
  await agent.act("fill the new project form with the name {name}, then press the save / create button. The step is complete once save was pressed, even if the app then shows another page", { params: { name }, maxModelCalls: 14 });
  const api = await adminApi();
  await expect.poll(async () => rows(await api.get("/projects", { search: name })).some((p) => p.name === name), { timeout: 30_000 }).toBe(true);
  await app.open("/en/projects");
  await expect(h1(screen, "Projects")).toBeVisible({ timeout: 60_000 });
  await agent.waitFor("the projects list has finished loading and lists 'Nile Tech ERP Implementation' and 'Delta Logistics Mobile App'");
  await app.open("/en/projects/my-tasks");
  await expect(h1(screen, "My Tasks")).toBeVisible({ timeout: 60_000 });
  await arabic(fx, "/ar/projects", "المشاريع");
});

test("[mz-timesheets.1] the timesheets page lists the seeded time entries and the log-time form opens", { tags: ["feat:mz-timesheets", "shard:ui-projects-mfg", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/projects/timesheets");
  await expect(h1(screen, "Timesheets")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the timesheets page has finished loading and shows time entries with projects, dates and hours");
  await app.open("/en/projects/timesheets/new");
  await expect(h1(screen, "Log Time")).toBeVisible({ timeout: 60_000 });
  await agent.assert("a form is shown to log time with a project, a date and the hours worked");
  await arabic(fx, "/ar/projects/timesheets", "سجلات الوقت");
});

test("[mz-bom.1] the bills of materials page shows the seeded BOM and the new BOM form opens", { tags: ["feat:mz-bom", "shard:ui-projects-mfg", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/manufacturing/bom");
  await expect(h1(screen, "Bills of Materials")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the BOM list has finished loading and lists 'Workstation Assembly BOM' with its output item");
  await app.open("/en/manufacturing/bom/new");
  await expect(h1(screen, "New BOM")).toBeVisible({ timeout: 60_000 });
  await agent.assert("a BOM form is shown with a name, an output item, an output quantity and component lines");
  await arabic(fx, "/ar/manufacturing/bom", "قوائم المواد");
});

test("[mz-work-orders.1] the work orders page shows the seeded work order and the new work order form opens", { tags: ["feat:mz-work-orders", "shard:ui-projects-mfg", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/manufacturing/work-orders");
  await expect(h1(screen, "Work Orders")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the work orders list has finished loading and lists WO-001 with a status and a quantity");
  await app.open("/en/manufacturing/work-orders/new");
  await expect(h1(screen, "New Work Order")).toBeVisible({ timeout: 60_000 });
  await arabic(fx, "/ar/manufacturing/work-orders", "أوامر العمل");
});

// ───────────────────────────────────────────── api ─────────────────────────────────────────────
test("[mz-employees.2] employee API: create, auto id, validation, update, terminate, delete rules, summary, isolation", { tags: ["feat:mz-employees", "shard:people-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/employees")).status).toBe(401);
  const body = { name: seeded("Employee API"), email: seededEmail("employee-api"), department: "Finance", jobTitle: "Accountant", basicSalary: "5000.00", dateOfJoining: "2025-01-01" };
  const created = await a.api.post("/employees", body);
  expect(created.status).toBe(201);
  expect(created.body.employeeId).toMatch(/^EMP-\d+$/);
  expect(dec(created.body.basicSalary)).toBe("5000");
  const id = created.body.id as string;
  expect((await a.api.post("/employees", { ...body, employeeId: created.body.employeeId })).status).toBe(400); // duplicate employee id
  expect((await a.api.post("/employees", { ...body, email: "not-an-email" })).status).toBe(400);
  expect((await a.api.post("/employees", { name: "", email: body.email })).status).toBe(400);
  expect((await a.api.post("/employees", { ...body, organizationId: a.orgId })).status).toBe(400);
  await expect.poll(async () => ids(await a.api.get("/employees", { search: body.name })), { timeout: 20_000 }).toContain(id);
  expect((await a.api.get(`/employees/${id}`)).body.name).toBe(body.name);
  const upd = await a.api.put(`/employees/${id}`, { jobTitle: "Senior Accountant", basicSalary: "5500.50" });
  expect(upd.status).toBe(200);
  expect([upd.body.jobTitle, dec(upd.body.basicSalary)]).toEqual(["Senior Accountant", "5500.5"]);
  expect((await a.api.get("/employees/count")).status).toBe(200);
  const summary = await a.api.get("/employees/summary");
  expect(summary.status).toBe(200);
  expect(JSON.stringify(summary.body)).toContain("Finance");
  expect((await b.api.get(`/employees/${id}`)).status).toBe(404);
  expect((await b.api.put(`/employees/${id}`, { jobTitle: "Hijacked" })).status).toBe(404);
  expect((await b.api.del(`/employees/${id}`)).status).toBe(404);
  expect(ids(await b.api.get("/employees", { limit: 100 }))).not.toContain(id);
  const term = await a.api.post(`/employees/${id}/terminate`);
  expect(term.status).toBe(201);
  expect(term.body.isActive).toBe(false);
  expect((await a.api.del(`/employees/${id}`)).status).toBe(200);
  expect((await a.api.get(`/employees/${id}`)).status).toBe(404);
});

test("[mz-attendance.2] attendance API: clock in/out once a day, manual record, bulk, summary, isolation", { tags: ["feat:mz-attendance", "shard:people-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/attendance")).status).toBe(401);
  const emp = (await a.api.post("/employees", { name: seeded("Attendance employee"), email: seededEmail("attendance"), basicSalary: "3000.00" })).body.id;
  const clockIn = await a.api.post("/attendance/clock-in", { employeeId: emp });
  expect(clockIn.status).toBe(201);
  expect((await a.api.post("/attendance/clock-in", { employeeId: emp })).status).toBe(400); // already clocked in today
  expect((await a.api.post("/attendance/clock-out", { employeeId: emp })).status).toBe(201);
  expect((await a.api.post("/attendance/clock-in", { employeeId: "ghost" })).status).toBe(404);
  expect((await b.api.post("/attendance/clock-in", { employeeId: emp })).status).toBe(404);

  const rec = await a.api.post("/attendance", { employeeId: emp, date: "2026-01-05", status: "PRESENT", checkIn: "2026-01-05T09:00:00Z", checkOut: "2026-01-05T17:00:00Z" });
  expect(rec.status).toBe(201);
  expect((await a.api.post("/attendance", { employeeId: emp, date: "2026-01-05", status: "PRESENT" })).status).toBe(400); // one record per day
  expect((await a.api.post("/attendance", { employeeId: emp, date: "2026-01-06", status: "SOMETIMES" })).status).toBe(400);
  const bulk = await a.api.post("/attendance/bulk", { records: [{ employeeId: emp, date: "2026-01-07", status: "PRESENT" }, { employeeId: emp, date: "2026-01-08", status: "HALF_DAY" }] });
  expect([200, 201]).toContain(bulk.status);
  const byEmployee = await a.api.get(`/attendance/by-employee/${emp}`);
  expect(byEmployee.status).toBe(200);
  expect(rows(byEmployee).length).toBeGreaterThanOrEqual(4);
  const byDate = await a.api.get("/attendance/by-date/2026-01-05");
  expect(JSON.stringify(byDate.body)).toContain(emp);
  const summary = await a.api.get(`/attendance/summary/${emp}`, { startDate: "2026-01-01", endDate: "2026-01-31" });
  expect(summary.status).toBe(200);
  const upd = await a.api.put(`/attendance/${rec.body.id}`, { status: "ABSENT" });
  expect(upd.status).toBe(200);
  expect(upd.body.status).toBe("ABSENT");
  expect((await b.api.put(`/attendance/${rec.body.id}`, { status: "PRESENT" })).status).toBe(404);
  expect((await b.api.del(`/attendance/${rec.body.id}`)).status).toBe(404);
  expect((await a.api.del(`/attendance/${rec.body.id}`)).status).toBe(200);
  expect(ids(await b.api.get("/attendance"))).not.toContain(rec.body.id);
});

test("[mz-payroll.2] payroll API: run for a month, exact payslip arithmetic from attendance, paid run posts a balanced journal, guards", { tags: ["feat:mz-payroll", "shard:people-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/payroll/runs")).status).toBe(401);
  const emp = (await a.api.post("/employees", { name: seeded("Payroll employee"), email: seededEmail("payroll"), basicSalary: "5000.00", allowances: { housing: 500 }, deductions: { insurance: 100 } })).body;
  // 22 present days in March 2026 = a full month, so no proration applies
  const records = Array.from({ length: 22 }, (_, i) => ({ employeeId: emp.id, date: `2026-03-${String(i + 1).padStart(2, "0")}`, status: "PRESENT" }));
  const att = await a.api.post("/attendance/bulk", { records });
  expect([200, 201]).toContain(att.status);

  const run = await a.api.post("/payroll/runs", { month: 3, year: 2026 });
  expect(run.status).toBe(201);
  expect(run.body.status).toBe("DRAFT");
  const id = run.body.id as string;
  expect((await b.api.post(`/payroll/runs/${id}/calculate`)).status).toBe(404);
  expect((await a.api.post(`/payroll/runs/${id}/paid`)).status).toBe(400); // must be processed first
  const calc = await a.api.post(`/payroll/runs/${id}/calculate`);
  expect(calc.status).toBe(201);
  expect(calc.body.payslipsCreated).toBe(1);
  const detail = (await a.api.get(`/payroll/runs/${id}`)).body;
  expect(detail.status).toBe("PROCESSED");
  expect(dec(detail.totalGross)).toBe("5500"); // 5000 basic + 500 housing
  expect(dec(detail.totalNet)).toBe("4575"); // 5500 - 100 insurance - 15% tax (825)
  expect(dec(detail.totalDeductions)).toBe("925");
  const slip = detail.payslips[0];
  expect([dec(slip.grossSalary), dec(slip.taxes), dec(slip.netSalary)]).toEqual(["5500", "825", "4575"]);
  expect((await a.api.get(`/payroll/payslips/${slip.id}`)).status).toBe(200);
  expect(rows(await a.api.get(`/payroll/payslips/employee/${emp.id}`)).length).toBe(1);
  expect((await a.api.post(`/payroll/runs/${id}/calculate`)).status).toBe(400); // already processed

  const tb0 = (await a.api.get("/accounting-reports/trial-balance")).body;
  const paid = await a.api.post(`/payroll/runs/${id}/paid`);
  expect(paid.status).toBe(201);
  expect(paid.body.status).toBe("PAID");
  const tb1 = (await a.api.get("/accounting-reports/trial-balance")).body;
  expect(subDec(tb1.totals.totalDebits, tb0.totals.totalDebits)).toBe("5500"); // Dr salary expense
  expect(tb1.totals.totalDebits).toBe(tb1.totals.totalCredits); // the payroll journal balances
  expect((await a.api.del(`/payroll/runs/${id}`)).status).toBe(400); // paid payroll is immutable
  expect((await a.api.post("/payroll/runs", { month: 3, year: 2026 })).status).toBe(400); // one run per period
  const spare = (await a.api.post("/payroll/runs", { month: 4, year: 2026 })).body.id;
  expect((await a.api.del(`/payroll/runs/${spare}`)).status).toBe(200);
  expect(ids(await b.api.get("/payroll/runs"))).not.toContain(id);
});

test("[mz-crm-leads.2] lead API: create with defaults, filter, update, assign, convert to a customer, isolation", { tags: ["feat:mz-crm-leads", "shard:people-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/crm/leads")).status).toBe(401);
  const name = seeded("Lead API");
  const created = await a.api.post("/crm/leads", { leadName: name, companyName: "Army Co", email: seededEmail("lead"), source: "REFERRAL" });
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject({ leadName: name, source: "REFERRAL", status: "NEW" });
  const id = created.body.id as string;
  expect((await a.api.post("/crm/leads", { companyName: "No name" })).status).toBe(400);
  expect((await a.api.post("/crm/leads", { leadName: "x", source: "TELEPATHY" })).status).toBe(400);
  await expect.poll(async () => ids(await a.api.get("/crm/leads", { search: name })), { timeout: 20_000 }).toContain(id);
  expect(ids(await a.api.get("/crm/leads", { status: "QUALIFIED" }))).not.toContain(id);
  const upd = await a.api.put(`/crm/leads/${id}`, { status: "QUALIFIED", notes: "called" });
  expect(upd.status).toBe(200);
  expect(upd.body.status).toBe("QUALIFIED");
  expect((await a.api.get("/crm/leads/stats")).status).toBe(200);
  expect((await a.api.get(`/crm/leads/${id}/activities`)).status).toBe(200);
  expect((await a.api.post(`/crm/leads/${id}/assign`, { assignedToId: a.userId })).status).toBe(200);
  expect((await b.api.get(`/crm/leads/${id}`)).status).toBe(404);
  expect((await b.api.put(`/crm/leads/${id}`, { notes: "x" })).status).toBe(404);
  expect((await b.api.post(`/crm/leads/${id}/convert`, {})).status).toBe(404);
  expect(ids(await b.api.get("/crm/leads"))).not.toContain(id);
  const converted = await a.api.post(`/crm/leads/${id}/convert`, { createDeal: true, dealValue: 1000 });
  expect(converted.status).toBe(200);
  expect(JSON.stringify(converted.body)).toMatch(/customer/i);
  const spare = (await a.api.post("/crm/leads", { leadName: seeded("Spare lead") })).body.id;
  expect((await a.api.del(`/crm/leads/${spare}`)).status).toBe(204);
  expect((await a.api.get(`/crm/leads/${spare}`)).status).toBe(404);
});

test("[mz-crm-deals.2] deal API: pipeline stages, stage moves, won once, lost, closed deals are frozen, isolation", { tags: ["feat:mz-crm-deals", "shard:people-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/crm/deals")).status).toBe(401);
  const customer = (await a.api.post("/customers", { name: seeded("Deal customer"), currency: "USD" })).body.id;
  const body = { dealName: seeded("Deal"), expectedAmount: 5000, customerId: customer, stage: "NEW" };
  const created = await a.api.post("/crm/deals", body);
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject({ dealName: body.dealName, stage: "NEW" });
  const id = created.body.id as string;
  expect((await a.api.post("/crm/deals", { dealName: "no amount" })).status).toBe(400);
  expect((await a.api.post("/crm/deals", { ...body, stage: "LIMBO" })).status).toBe(400);
  const moved = await a.api.post(`/crm/deals/${id}/stage`, { stage: "PROPOSAL_SENT" });
  expect(moved.status).toBe(200);
  expect(moved.body.stage).toBe("PROPOSAL_SENT");
  expect(Number(moved.body.probability)).toBe(50);
  const pipeline = await a.api.get("/crm/deals/pipeline");
  expect(pipeline.status).toBe(200);
  expect(JSON.stringify(pipeline.body)).toContain(body.dealName);
  expect((await a.api.get("/crm/deals/stats")).status).toBe(200);
  expect((await a.api.get("/crm/deals/pipeline-metrics")).status).toBe(200);
  expect((await b.api.get(`/crm/deals/${id}`)).status).toBe(404);
  expect((await b.api.post(`/crm/deals/${id}/won`, {})).status).toBe(404);
  expect(ids(await b.api.get("/crm/deals"))).not.toContain(id);

  const won = await a.api.post(`/crm/deals/${id}/won`, { createQuote: true });
  expect(won.status).toBe(200);
  expect(won.body.deal.stage).toBe("WON");
  expect(won.body.quoteId).toBeTruthy();
  expect((await a.api.post(`/crm/deals/${id}/won`, {})).status).toBe(400); // already won
  expect((await a.api.post(`/crm/deals/${id}/lost`, { reason: "late" })).status).toBe(400);
  expect((await a.api.post(`/crm/deals/${id}/stage`, { stage: "NEW" })).status).toBe(400); // closed deals cannot move
  const lostId = (await a.api.post("/crm/deals", { ...body, dealName: seeded("Lost deal") })).body.id;
  const lost = await a.api.post(`/crm/deals/${lostId}/lost`, { reason: "Budget" });
  expect(lost.status).toBe(200);
  expect(lost.body.stage).toBe("LOST");
  expect((await a.api.post(`/crm/deals/${lostId}/won`, {})).status).toBe(400);
  const activity = await a.api.post("/crm/activities", { type: "CALL", subject: "Follow-up call", dealId: lostId });
  expect([201, 400]).toContain(activity.status);
  expect((await a.api.get("/crm/activities")).status).toBe(200);
  expect((await a.api.get("/crm/activities/stats")).status).toBe(200);
  expect((await a.api.del(`/crm/deals/${lostId}`)).status).toBe(204);
});

test("[mz-projects.2] project and task API: create, validation, tasks, profitability, delete rules, isolation", { tags: ["feat:mz-projects", "shard:people-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/projects")).status).toBe(401);
  const customer = (await a.api.post("/customers", { name: seeded("Project customer"), currency: "USD" })).body.id;
  const body = { name: seeded("Project API"), customerId: customer, status: "ACTIVE", billingMethod: "HOURLY", hourlyRate: "150.00", budget: "25000.00", startDate: "2026-01-01", endDate: "2026-12-31" };
  const created = await a.api.post("/projects", body);
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject({ name: body.name, status: "ACTIVE" });
  const id = created.body.id as string;
  expect((await a.api.post("/projects", { status: "ACTIVE" })).status).toBe(400);
  expect((await a.api.post("/projects", { ...body, status: "DREAMING" })).status).toBe(400);
  expect((await a.api.post("/projects", { ...body, customerId: "ghost" })).status).toBe(404);
  expect((await b.api.post("/projects", body)).status).toBe(404); // another tenant's customer
  await expect.poll(async () => ids(await a.api.get("/projects", { search: body.name })), { timeout: 20_000 }).toContain(id);
  expect((await a.api.put(`/projects/${id}`, { description: "edited" })).status).toBe(200);
  expect((await a.api.get("/projects/summary")).status).toBe(200);
  expect((await a.api.get(`/projects/${id}/profitability`)).status).toBe(200);

  const task = await a.api.post("/tasks", { projectId: id, name: seeded("Task"), priority: "HIGH", estimatedHours: "8" });
  expect(task.status).toBe(201);
  expect(task.body).toMatchObject({ status: "TODO", priority: "HIGH" });
  expect((await a.api.post("/tasks", { projectId: id, name: "" })).status).toBe(400);
  expect((await a.api.post("/tasks", { projectId: "ghost", name: "orphan" })).status).toBeGreaterThanOrEqual(400);
  const done = await a.api.put(`/tasks/${task.body.id}`, { status: "DONE" });
  expect(done.status).toBe(200);
  expect(done.body.status).toBe("DONE");
  expect(ids(await a.api.get(`/tasks/project/${id}`))).toContain(task.body.id);
  expect((await a.api.get("/tasks/stats")).status).toBe(200);
  expect((await a.api.get("/tasks/my-tasks")).status).toBe(200);
  expect((await b.api.get(`/tasks/${task.body.id}`)).status).toBe(404);
  expect((await b.api.get(`/projects/${id}`)).status).toBe(404);
  expect((await b.api.put(`/projects/${id}`, { name: "Hijacked" })).status).toBe(404);
  expect((await b.api.del(`/projects/${id}`)).status).toBe(404);
  expect(ids(await b.api.get("/projects"))).not.toContain(id);
  expect((await a.api.del(`/tasks/${task.body.id}`)).status).toBe(200);
  const bulk = await a.api.post("/projects/bulk-hold", { ids: [id] });
  expect(bulk.status).toBe(201);
  expect((await a.api.get(`/projects/${id}`)).body.status).toBe("ON_HOLD");
  expect((await a.api.del(`/projects/${id}`)).status).toBe(200);
  expect((await a.api.get(`/projects/${id}`)).status).toBe(404);
});

test("[mz-timesheets.2] timesheet API: log time against a project, timer start/stop, weekly summary, billed rules, isolation", { tags: ["feat:mz-timesheets", "shard:people-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/timesheets")).status).toBe(401);
  const project = (await a.api.post("/projects", { name: seeded("Timesheet project"), status: "ACTIVE", billingMethod: "HOURLY", hourlyRate: "100.00" })).body.id;
  const entry = await a.api.post("/timesheets", { projectId: project, date: "2026-03-09", hours: "7.5", description: "Design work", isBillable: true });
  expect(entry.status).toBe(201);
  expect(dec(entry.body.hours)).toBe("7.5");
  const id = entry.body.id as string;
  expect((await a.api.post("/timesheets", { projectId: "ghost", date: "2026-03-09", hours: "1" })).status).toBe(404);
  expect((await b.api.post("/timesheets", { projectId: project, date: "2026-03-09", hours: "1" })).status).toBe(404);
  expect((await a.api.post("/timesheets", { projectId: project, date: "2026-03-09", hours: "x" })).status).toBeGreaterThanOrEqual(400);
  expect(ids(await a.api.get("/timesheets", { projectId: project }))).toContain(id);
  expect((await a.api.put(`/timesheets/${id}`, { hours: "8" })).status).toBe(200);
  const weekly = await a.api.get("/timesheets/weekly-summary", { weekStartDate: "2026-03-09" });
  expect(weekly.status).toBe(200);
  expect(JSON.stringify(weekly.body)).toContain("8");
  expect((await a.api.get("/timesheets/report", { startDate: "2026-03-01", endDate: "2026-03-31" })).status).toBe(200);
  expect((await b.api.get(`/timesheets/${id}`)).status).toBe(404);
  expect((await b.api.put(`/timesheets/${id}`, { hours: "1" })).status).toBe(404);
  expect((await b.api.del(`/timesheets/${id}`)).status).toBe(404);

  // timer: only one running at a time
  const started = await a.api.post("/timesheets/timer/start", { projectId: project, description: "timer" });
  expect(started.status).toBe(201);
  expect((await a.api.post("/timesheets/timer/start", { projectId: project })).status).toBe(400);
  const running = await a.api.get("/timesheets/timer/running");
  expect(running.status).toBe(200);
  expect(JSON.stringify(running.body)).toContain(started.body.id);
  expect((await a.api.post(`/timesheets/timer/stop/${started.body.id}`)).status).toBe(201);
  expect((await a.api.del(`/timesheets/${id}`)).status).toBe(200);
});

test("[mz-bom.2] bill of materials API: create with components, one active BOM per item, material requirements, duplicate, delete rules, isolation", { tags: ["feat:mz-bom", "shard:people-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/manufacturing/bom")).status).toBe(401);
  const part = await stockedItem(a, "bom-part", 20, "10.00");
  const out = (await a.api.post("/items", { name: seeded("BOM output"), sku: seeded("SKU-OUT").toUpperCase(), type: "GOODS", sellingPrice: "99.00", costPrice: "0" })).body;
  const body = { name: seeded("BOM"), outputItemId: out.id, outputQuantity: 2, operationsCost: "5.00", components: [{ itemId: part.itemId, quantity: 3 }] };
  const created = await a.api.post("/manufacturing/bom", body);
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  expect((await a.api.post("/manufacturing/bom", body)).status).toBe(400); // an active BOM already exists for this item
  expect((await a.api.post("/manufacturing/bom", { ...body, outputItemId: "ghost" })).status).toBe(404);
  expect((await a.api.post("/manufacturing/bom", { ...body, name: "self", components: [{ itemId: out.id, quantity: 1 }], isActive: false })).status).toBe(400); // output cannot be its own component
  expect((await b.api.post("/manufacturing/bom", body)).status).toBe(404); // another tenant's item
  const req = await a.api.get(`/manufacturing/bom/${id}/requirements`, { quantity: 4 });
  expect(req.status).toBe(200);
  expect(JSON.stringify(req.body)).toContain(part.itemId);
  expect(JSON.stringify(req.body)).toContain("6"); // 4 outputs = 2 batches x 3 units
  const copy = await a.api.post(`/manufacturing/bom/${id}/duplicate`, { name: seeded("BOM copy") });
  expect(copy.status).toBe(201);
  expect(copy.body.id).not.toBe(id);
  expect((await a.api.patch(`/manufacturing/bom/${id}`, { name: seeded("BOM v2") })).body.name).toBe(seeded("BOM v2"));
  expect(ids(await a.api.get("/manufacturing/bom"))).toContain(id);
  expect((await b.api.get(`/manufacturing/bom/${id}`)).status).toBe(404);
  expect((await b.api.del(`/manufacturing/bom/${id}`)).status).toBe(404);
  expect(ids(await b.api.get("/manufacturing/bom"))).not.toContain(id);
  expect((await a.api.del(`/manufacturing/bom/${copy.body.id}`)).status).toBe(200);
});

test("[mz-work-orders.2] work order API: draft -> start (materials checked) -> complete moves stock and posts the production journal, guards", { tags: ["feat:mz-work-orders", "shard:people-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/manufacturing/work-orders")).status).toBe(401);
  // components in a default warehouse (production consumes from and delivers to the default warehouse)
  const inventoryAccount = await ensureAccount(a, "1490", "E2E Inventory", "ASSET");
  const wh = await a.api.post("/warehouses", { code: seeded("WH-DEF", 4), name: seeded("Default warehouse"), isDefault: true });
  const warehouseId = wh.status === 201 ? wh.body.id : rows(await a.api.get("/warehouses", { search: seeded("WH-DEF", 4) }))[0].id;
  const shrink = await ensureAccount(a, "6790", "E2E Inventory Shrinkage", "EXPENSE");
  const mk = async (tag: string, cost: string) => (await a.api.post("/items", { name: seeded(`WO ${tag}`), sku: seeded(`SKU-WO-${tag}`).toUpperCase(), type: "GOODS", sellingPrice: "50.00", costPrice: cost, inventoryAccountId: inventoryAccount })).body;
  const component = await mk("component", "10.00"), output = await mk("output", "0");
  expect((await a.api.post("/inventory-adjustments", { date: DATE.doc, warehouseId, itemId: component.id, type: "INCREASE", quantity: 10, reason: "STOCKTAKE", accountId: shrink })).status).toBe(201);
  const bom = (await a.api.post("/manufacturing/bom", { name: seeded("WO BOM"), outputItemId: output.id, outputQuantity: 1, operationsCost: "0", components: [{ itemId: component.id, quantity: 2 }] })).body;

  const wo = await a.api.post("/manufacturing/work-orders", { bomId: bom.id, quantity: 3, notes: "e2e" });
  expect(wo.status).toBe(201);
  expect(wo.body.status).toBe("DRAFT");
  expect(wo.body.workOrderNumber).toMatch(/^WO-\d+$/);
  const id = wo.body.id as string;
  expect((await a.api.post("/manufacturing/work-orders", { bomId: "ghost", quantity: 1 })).status).toBe(404);
  expect((await b.api.post("/manufacturing/work-orders", { bomId: bom.id, quantity: 1 })).status).toBe(404);
  expect((await b.api.get(`/manufacturing/work-orders/${id}`)).status).toBe(404);
  expect((await b.api.post(`/manufacturing/work-orders/${id}/start`)).status).toBe(404);
  const avail = await a.api.get(`/manufacturing/work-orders/${id}/availability`);
  expect(avail.body.isAvailable).toBe(true);
  expect(avail.body.materials[0]).toMatchObject({ required: 6, available: 10, shortfall: 0 });

  const big = (await a.api.post("/manufacturing/work-orders", { bomId: bom.id, quantity: 100 })).body.id;
  const refused = await a.api.post(`/manufacturing/work-orders/${big}/start`);
  expect(refused.status).toBe(400);
  expect(refused.body.message).toMatch(/Insufficient materials/);
  expect((await a.api.del(`/manufacturing/work-orders/${big}`)).status).toBe(200);

  expect((await a.api.post(`/manufacturing/work-orders/${id}/complete`, { quantityProduced: 3 })).status).toBe(400); // not started
  const started = await a.api.post(`/manufacturing/work-orders/${id}/start`);
  expect(started.status).toBe(201);
  expect(started.body.status).toBe("IN_PROCESS");
  expect((await a.api.del(`/manufacturing/work-orders/${id}`)).status).toBe(400); // only drafts are deletable
  const inv0 = await acct(a.api, inventoryAccount);
  const done = await a.api.post(`/manufacturing/work-orders/${id}/complete`, { quantityProduced: 3, notes: "done" });
  expect(done.status).toBe(201);
  expect(done.body.status).toBe("COMPLETED");
  const levels = await a.api.get("/inventory-levels", { warehouseId });
  const qty = (itemId: string) => Number(rows(levels).find((l: any) => l.itemId === itemId || l.item?.id === itemId)?.quantity ?? 0);
  expect(qty(component.id)).toBe(4); // 10 - 3 x 2
  expect(qty(output.id)).toBe(3);
  const inv1 = await acct(a.api, inventoryAccount);
  expect(subDec(inv1.debit, inv0.debit)).toBe(subDec(inv1.credit, inv0.credit)); // production moves value between inventory accounts, net zero
  const tb = (await a.api.get("/accounting-reports/trial-balance")).body;
  expect(tb.totals.totalDebits).toBe(tb.totals.totalCredits);
  expect((await a.api.get(`/manufacturing/work-orders/${id}/history`)).status).toBe(200);
  expect((await a.api.post(`/manufacturing/work-orders/${id}/cancel`, { reason: "late" })).status).toBe(400); // completed orders cannot be cancelled
  expect((await a.api.get("/manufacturing/work-orders/stats")).status).toBe(200);
});
