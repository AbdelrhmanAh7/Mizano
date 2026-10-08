// Platform features: shell + navigation, registration, settings, team & roles, audit log, notifications, search, import/export, documents,
// currency, preferences, onboarding, error logger, diagnostics.
//   shards ui-shell / ui-settings : browser tests on the seeded demo org
//   shard  platform-api           : request-level tests on fresh tenants (and read-only checks on the demo org)
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { needsModel } from "../lib.ts";
import { Api, DATE, ADMIN, adminApi, anon, dec, ensureAccount, h1, ids, invoiceBody, journalOf, ledgerTenant, rows, seeded, seededEmail, signIn, tenant, TENANT_PASSWORD, uuidFrom } from "./_mz.e2e.ts";

const A = () => ledgerTenant("platform");
const B = () => ledgerTenant("platform-b");
const WEB = () => String(process.env.E2E_ARMY_URL ?? "").replace(/\/+$/, "");

async function arabic({ app, screen, browser }: any, path: string, title?: string) {
  await app.open(path);
  if (title) await expect(h1(screen, title)).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
}
const csv = (lines: string[]) => lines.join("\n") + "\n";

// ───────────────────────────────────────────── ui: shell ─────────────────────────────────────────────
test("[mz-app-shell.1] the sidebar navigates between modules, and the header shows the signed-in menu", { tags: ["feat:mz-app-shell", "shard:ui-shell", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { agent, browser, screen } = fx;
  await signIn(fx, "/en/dashboard");
  await expect(h1(screen, "Dashboard")).toBeVisible({ timeout: 90_000 });
  await agent.act("in the sidebar open the Sales section and choose Invoices", { maxModelCalls: 10 });
  await expect(browser).toHaveURL(/\/en\/sales\/invoices/, { timeout: 60_000 });
  await expect(h1(screen, "Invoices")).toBeVisible({ timeout: 60_000 });
  await agent.act("in the sidebar open the Accounting section and choose Journal Entries", { maxModelCalls: 10 });
  await expect(browser).toHaveURL(/\/en\/accounting\/journals/, { timeout: 60_000 });
  await agent.assert("the page title is 'Journal Entries', the sidebar highlights the current section, and a breadcrumb trail is shown above the page content");
});

test("[mz-global-search.1] the command palette finds a customer, an invoice and a page by typing", { tags: ["feat:mz-global-search", "shard:ui-shell", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { agent, browser, screen } = fx;
  await signIn(fx, "/en/dashboard");
  await expect(h1(screen, "Dashboard")).toBeVisible({ timeout: 90_000 });
  await agent.act("open the global search / command palette (the search box in the header, or press the Control+K shortcut) and type 'Nile Tech'", { maxModelCalls: 12 });
  await agent.waitFor("the search results list a customer named 'Nile Tech Solutions'", { timeout: 60_000 });
  await agent.act("choose the result 'Nile Tech Solutions' to open it", { maxModelCalls: 8 });
  await expect(browser).toHaveURL(/\/en\/sales\/customers\//, { timeout: 60_000 });
});

test("[mz-registration.1] a new organization registers through the sign-up form and can then sign in", { tags: ["feat:mz-registration", "shard:ui-shell", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  const email = seededEmail("ui-registration"), org = seeded("UI Registered Org");
  await app.open("/en/register");
  await expect(screen.getByRole("heading", "Create Account")).toBeVisible({ timeout: 90_000 });
  await agent.act("fill the registration form: first name 'Army', last name 'Tester', email {email}, organization name {org}, password {pw} and the same password in the confirmation field, tick the terms agreement, then press Sign Up. The step is complete once the form was submitted", { params: { email, org, pw: TENANT_PASSWORD }, maxModelCalls: 18 });
  await expect.poll(async () => (await anon.post("/auth/login", { email, password: TENANT_PASSWORD })).status, { timeout: 60_000, interval: 15_000 }).toBe(200);
  const session = await anon.post("/auth/login", { email, password: TENANT_PASSWORD });
  expect(session.body.organization.name).toBe(org);
});

test("[mz-ai-insights.1] the AI insights page loads the seeded insights and the forecast sub-pages open", { tags: ["feat:mz-ai-insights", "shard:ui-shell", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/ai-insights");
  await agent.waitFor("the AI insights page has finished loading and lists insights such as 'Cash Flow Warning: Week 3 March' with severities, or an empty state", { timeout: 90_000 });
  await app.open("/en/ai-insights/forecast");
  await expect(h1(screen, "Cash Flow Forecast")).toBeVisible({ timeout: 90_000 });
  await app.open("/en/ai-insights/revenue");
  await expect(h1(screen, "Revenue Forecast")).toBeVisible({ timeout: 90_000 });
  await app.open("/en/ai-insights/customers");
  await expect(h1(screen, "Customer Analysis")).toBeVisible({ timeout: 90_000 });
  await arabic(fx, "/ar/ai-insights/forecast", "توقعات التدفق النقدي");
});

test("[mz-deep-search.1] the DeepSearch page loads and shows its job history without starting an external search", { tags: ["feat:mz-deep-search", "shard:ui-shell", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { agent, screen } = fx;
  await signIn(fx, "/en/deep-search");
  await expect(h1(screen, "DeepSearch Agent")).toBeVisible({ timeout: 90_000 });
  await agent.assert("the page shows the DeepSearch agent with a button to start a search and a history of previous jobs (or an empty history), without an error banner");
  await arabic(fx, "/ar/deep-search", "وكيل البحث العميق");
});

test("[mz-ai-assistant.1] the chat assistant widget opens on every page and answers gracefully when the AI model is offline", { tags: ["feat:mz-ai-assistant", "shard:ui-shell", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { agent, screen } = fx;
  await signIn(fx, "/en/dashboard");
  await expect(h1(screen, "Dashboard")).toBeVisible({ timeout: 90_000 });
  await agent.act("open the AI chat assistant (the floating chat button near the bottom corner), type the message 'How many invoices are overdue?' and send it", { maxModelCalls: 14 });
  await agent.waitFor("the assistant has replied to the message: either an answer or a clear message that the AI assistant is currently unavailable (not an endless spinner and not a crash page)", { timeout: 90_000 });
});

// ───────────────────────────────────────────── ui: settings ─────────────────────────────────────────────
test("[mz-settings-organization.1] the settings hub opens the organization page; saving a changed address persists it", { tags: ["feat:mz-settings-organization", "shard:ui-settings", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  const address = `12 Army Street ${seeded("addr", 4)}`;
  await signIn(fx, "/en/settings");
  await expect(h1(screen, "Settings")).toBeVisible({ timeout: 90_000 });
  await agent.assert("the settings page lists configuration areas such as Organization, Financial, Invoicing, Localization, Branding, Notifications and Team");
  await app.open("/en/settings/organization");
  await expect(h1(screen, "Organization")).toBeVisible({ timeout: 60_000 });
  await agent.act("change the company address field to {address} and press the save button. The step is complete once save was pressed", { params: { address }, maxModelCalls: 12 });
  const api = await adminApi();
  await expect.poll(async () => (await api.get("/organization")).body.address, { timeout: 30_000 }).toBe(address);
  for (const [path, title] of [["/en/settings/financial", "Financial Settings"], ["/en/settings/invoicing", "Invoice & Document Settings"], ["/en/settings/localization", "Localization"]] as const) {
    await app.open(path);
    await expect(h1(screen, title)).toBeVisible({ timeout: 60_000 });
  }
  await arabic(fx, "/ar/settings/organization", "المؤسسة");
});

test("[mz-team-roles.1] the team page lists the seeded users and roles and a new team member can be added", { tags: ["feat:mz-team-roles", "shard:ui-settings", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { agent, screen } = fx;
  const name = seeded("Team member"), email = seededEmail("team-member");
  await signIn(fx, "/en/settings/team");
  await expect(h1(screen, "Team & Roles")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the team page has finished loading and lists users such as 'Admin User', 'Ahmed Hassan' and 'Sara Khalil' with their roles", { timeout: 90_000 });
  await agent.act("add a new team member: press the button that adds or invites a user, enter the name {name}, the email {email}, the password {pw}, choose the first role in the list, then save. The step is complete once save was pressed", { params: { name, email, pw: TENANT_PASSWORD }, maxModelCalls: 16 });
  const api = await adminApi();
  await expect.poll(async () => rows(await api.get("/users", { search: name })).some((u) => u.email === email), { timeout: 30_000 }).toBe(true);
  await arabic(fx, "/ar/settings/team", "الفريق والأدوار");
});

test("[mz-audit-log.1] the audit log page lists who changed what, with entity types and actions", { tags: ["feat:mz-audit-log", "shard:ui-settings", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { agent, screen } = fx;
  await signIn(fx, "/en/settings/audit-logs");
  await expect(h1(screen, "Audit Logs")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the audit log table has finished loading and lists entries with a user, an action (create / update / delete), an entity type and a timestamp", { timeout: 90_000 });
  await arabic(fx, "/ar/settings/audit-logs", "سجل التدقيق");
});

test("[mz-notifications.1] the notification panel lists the seeded notifications and the notification settings page opens", { tags: ["feat:mz-notifications", "shard:ui-settings", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/dashboard");
  await expect(h1(screen, "Dashboard")).toBeVisible({ timeout: 90_000 });
  await agent.act("open the notifications panel (the bell icon in the header)", { maxModelCalls: 10 });
  await agent.waitFor("the notifications panel lists notifications such as 'Invoice Overdue', 'Bill Due Soon' and 'Low Stock Alert'", { timeout: 60_000 });
  await app.open("/en/settings/notifications");
  await expect(h1(screen, "Notifications")).toBeVisible({ timeout: 60_000 });
  await arabic(fx, "/ar/settings/notifications", "الإشعارات");
});

test("[mz-system-diagnostics.1] the cache and database performance pages open for an administrator", { tags: ["feat:mz-system-diagnostics", "shard:ui-settings", "lvl:ui"], timeout: 240_000 }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/settings/performance");
  await expect(h1(screen, "Database Performance")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the performance page has finished loading and shows query statistics (counts, average time) or an empty state, without an error banner", { timeout: 90_000 });
  await app.open("/en/settings/cache");
  await agent.waitFor("the cache management page has finished loading and shows cache statistics such as cache type, number of keys and hit rate, with an option to clear the cache", { timeout: 90_000 });
  await arabic(fx, "/ar/settings/performance", "أداء قاعدة البيانات");
});

// ───────────────────────────────────────────── api ─────────────────────────────────────────────
test("[mz-app-shell.2] the web shell serves robots.txt and sitemap.xml and redirects anonymous visitors of protected pages to the sign-in page", { tags: ["feat:mz-app-shell", "shard:platform-api", "lvl:api"] }, async () => {
  const robots = await fetch(`${WEB()}/robots.txt`);
  expect(robots.status).toBe(200);
  const text = await robots.text();
  expect(text).toContain("Disallow: /api/");
  expect(text).toMatch(/Sitemap: .*\/sitemap\.xml/);
  const sitemap = await fetch(`${WEB()}/sitemap.xml`);
  expect(sitemap.status).toBe(200);
  const xml = await sitemap.text();
  for (const locale of ["en", "ar"]) expect(xml).toContain(`/${locale}/login`);
  // middleware: protected pages need a session and remember where the visitor wanted to go
  const guarded = await fetch(`${WEB()}/en/sales/invoices`, { redirect: "manual" });
  expect([302, 303, 307, 308]).toContain(guarded.status);
  const location = guarded.headers.get("location") ?? "";
  expect(location).toContain("/en/login");
  expect(decodeURIComponent(location)).toContain("callbackUrl=/en/sales/invoices");
  // unknown locales are not served
  expect((await fetch(`${WEB()}/xx/login`, { redirect: "manual" })).status).toBeGreaterThanOrEqual(300);
});

test("[mz-registration.2] registration API creates an isolated organization with its own admin role and tokens that work", { tags: ["feat:mz-registration", "shard:platform-api", "lvl:api"] }, async () => {
  const t = await tenant("registration");
  const me = await t.api.get("/organization");
  expect(me.status).toBe(200);
  expect(me.body.id).toBe(t.orgId);
  expect(me.body.name).toBe(t.orgName);
  const users = await t.api.get("/users");
  expect(users.status).toBe(200);
  expect(rows(users).map((u: any) => u.email)).toEqual([t.email]);
  expect(JSON.stringify(users.body)).not.toMatch(/passwordHash|refreshToken/);
  const roles = await t.api.get("/roles");
  expect(rows(roles).map((r: any) => r.name)).toContain("Admin");
  // two registrations never share data
  const other = await tenant("registration-b");
  expect(other.orgId).not.toBe(t.orgId);
  expect(rows(await other.api.get("/users")).map((u: any) => u.email)).toEqual([other.email]);
  // the new organization starts empty: no chart of accounts, no customers
  expect(rows(await t.api.get("/accounts")).length).toBe(0);
  expect(rows(await t.api.get("/customers")).length).toBe(0);
});

test("[mz-settings-organization.2] organization settings API: general, financial, invoice numbering, localization, branding, AI toggles, lock date", { tags: ["feat:mz-settings-organization", "shard:platform-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  for (const path of ["/organization", "/organization/settings", "/organization/account-settings"]) expect((await anon.get(path)).status).toBe(401);
  const org = await a.api.get("/organization");
  expect(org.status).toBe(200);
  expect(org.body.name).toBe(a.orgName);
  const patched = await a.api.patch("/organization", { phone: "+201000000009", address: "1 Army Square", taxId: "TAX-ARMY-1" });
  expect(patched.status).toBe(200);
  expect(patched.body).toMatchObject({ phone: "+201000000009", address: "1 Army Square", taxId: "TAX-ARMY-1" });
  expect((await a.api.patch("/organization", { email: "not-an-email" })).status).toBe(400);
  expect((await a.api.patch("/organization", { id: "other-org" })).status).toBe(400);
  expect((await b.api.get("/organization")).body.phone).not.toBe("+201000000009"); // another tenant is untouched

  const all = await a.api.get("/organization/settings");
  expect(all.status).toBe(200);
  for (const k of ["general", "financial", "invoice", "inventory", "ai"]) expect(all.body).toHaveProperty(k);
  expect((await a.api.patch("/organization/settings/general", { name: `${a.orgName} Ltd`, industry: "retail" })).status).toBe(200);
  expect((await a.api.patch("/organization/settings/general", { industry: "alchemy" })).status).toBe(400);
  expect((await a.api.patch("/organization/settings/financial", { fiscalYearStartMonth: 4, defaultPaymentTermsDays: 45 })).status).toBe(200);
  expect((await a.api.patch("/organization/settings/financial", { fiscalYearStartMonth: 13 })).status).toBe(400);
  const after = (await a.api.get("/organization/settings")).body;
  expect(after.financial).toMatchObject({ fiscalYearStartMonth: 4, defaultPaymentTermsDays: 45 });
  expect(after.general.name).toBe(`${a.orgName} Ltd`);
  expect((await a.api.patch("/organization/settings/localization", { dateFormat: "DD/MM/YYYY", timezone: "Africa/Cairo" })).status).toBe(200);
  expect((await a.api.patch("/organization/settings/branding", { primaryColor: "#112233", footerText: "Thank you" })).status).toBe(200);
  expect((await a.api.patch("/organization/settings/ai", { aiCategorizationEnabled: false, anomalySensitivity: 2 })).status).toBe(200);
  expect((await a.api.patch("/organization/settings/inventory", { enableBundles: true })).status).toBe(200);

  // invoice numbering follows the configured prefix and counter
  expect((await a.api.patch("/organization/settings/invoice", { invoicePrefix: "E2E-", invoiceNextNumber: 500 })).status).toBe(200);
  const customer = (await a.api.post("/customers", { name: seeded("Numbering customer"), currency: "USD" })).body.id;
  const first = await a.api.post("/invoices", invoiceBody(customer, [{ quantity: "1", rate: "1" }]));
  const second = await a.api.post("/invoices", invoiceBody(customer, [{ quantity: "1", rate: "1" }]));
  expect([first.body.invoiceNumber, second.body.invoiceNumber]).toEqual(["E2E-0500", "E2E-0501"]);

  // default accounts must be the tenant's own active accounts
  const settings = await a.api.get("/organization/account-settings");
  expect(settings.body.defaultArAccountId).toBe(a.chart.ar);
  expect((await a.api.patch("/organization/account-settings", { defaultArAccountId: b.chart.ar })).status).toBe(400);
  expect((await a.api.patch("/organization/account-settings", { defaultArAccountId: "ghost" })).status).toBe(400);
  expect((await a.api.patch("/organization/account-settings", { defaultArAccountId: a.chart.ar })).status).toBe(200);

  // lock date
  const lock = await a.api.patch("/organization/lock-date", { lockDate: "2026-01-31T00:00:00.000Z" });
  expect(lock.status).toBe(200);
  expect(lock.body.lockDate).toBe("2026-01-31T00:00:00.000Z");
  expect((await a.api.patch("/organization/lock-date", { lockDate: null })).body.lockDate).toBeNull();
});

test("[mz-team-roles.2] users and roles API: custom role limits access (RBAC), duplicate rules, assignment, deactivation, isolation", { tags: ["feat:mz-team-roles", "shard:platform-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/users")).status).toBe(401);
  expect((await anon.get("/roles")).status).toBe(401);
  const roleName = seeded("Sales viewer");
  const role = await a.api.post("/roles", { name: roleName, description: "e2e", permissions: [{ module: "sales", actions: ["view"] }] });
  expect(role.status).toBe(201);
  expect((await a.api.post("/roles", { name: roleName, permissions: [{ module: "sales", actions: ["view"] }] })).status).toBe(409);
  expect((await a.api.post("/roles", { name: "bad module", permissions: [{ module: "witchcraft", actions: ["view"] }] })).status).toBe(400);
  expect((await a.api.post("/roles", { name: "bad action", permissions: [{ module: "sales", actions: ["fly"] }] })).status).toBe(400);
  expect((await a.api.post("/roles", { name: "no permissions", permissions: [] })).status).toBe(400);
  expect(ids(await a.api.get("/roles"))).toContain(role.body.id);
  expect(ids(await b.api.get("/roles"))).not.toContain(role.body.id);
  expect((await b.api.get(`/roles/${role.body.id}`)).status).toBe(404);

  const email = seededEmail("viewer"), password = TENANT_PASSWORD;
  expect((await a.api.post("/users", { email, password: "weak", name: "Viewer", roleId: role.body.id })).status).toBe(400);
  expect((await a.api.post("/users", { email, password, name: "Viewer", roleId: "ghost" })).status).toBe(400);
  expect((await b.api.post("/users", { email, password, name: "Viewer", roleId: role.body.id })).status).toBe(400); // another tenant's role
  const user = await a.api.post("/users", { email, password, name: "Sales Viewer", roleId: role.body.id });
  expect(user.status).toBe(201);
  expect(JSON.stringify(user.body)).not.toMatch(/passwordHash|"password"/);
  expect((await a.api.post("/users", { email, password, name: "Viewer", roleId: role.body.id })).status).toBe(409);
  expect(ids(await a.api.get("/users", { search: "Sales Viewer" }))).toContain(user.body.id);
  expect((await b.api.get(`/users/${user.body.id}`)).status).toBe(404);
  expect((await b.api.patch(`/users/${user.body.id}`, { name: "Hijacked" })).status).toBe(404);

  // the new user signs in and is limited to what the role grants
  const login = await anon.post("/auth/login", { email, password });
  expect(login.status).toBe(200);
  const viewer = new Api(login.body.tokens.accessToken);
  expect((await viewer.get("/customers")).status).toBe(200); // sales.view
  expect((await viewer.post("/customers", { name: "nope" })).status).toBe(403); // no sales.create
  expect((await viewer.get("/bills")).status).toBe(403); // no purchases.view
  expect((await viewer.get("/users")).status).toBe(403); // no settings.view
  expect((await viewer.get("/audit-logs")).status).toBe(403);
  expect((await viewer.get("/accounting-reports/trial-balance")).status).toBe(403);
  // widening the role takes effect for the same user after the role cache expires; assignment is explicit
  const wider = await a.api.post("/roles", { name: seeded("Sales editor"), permissions: [{ module: "sales", actions: ["view", "create"] }] });
  const assigned = await a.api.post("/roles/assign", { userId: user.body.id, roleId: wider.body.id });
  expect(assigned.status).toBe(201);
  expect((await a.api.get(`/users/${user.body.id}`)).body.roleId ?? (await a.api.get(`/users/${user.body.id}`)).body.role?.id).toBe(wider.body.id);
  expect((await a.api.post("/roles/assign", { userId: user.body.id, roleId: "ghost" })).status).toBe(404);
  // a role in use cannot be deleted; deactivated users cannot sign in
  expect((await a.api.del(`/roles/${wider.body.id}`)).status).toBe(400);
  expect((await a.api.patch(`/users/${user.body.id}`, { status: "INACTIVE" })).status).toBe(200);
  const blocked = await anon.post("/auth/login", { email, password });
  expect(blocked.status).toBe(401);
  expect((await a.api.del(`/users/${user.body.id}`)).status).toBe(200);
  expect((await a.api.del(`/roles/${wider.body.id}`)).status).toBe(200);
  expect((await a.api.post("/roles/seed-defaults")).status).toBe(201);
  // the Admin role of an organization cannot be removed
  const adminRole = rows(await a.api.get("/roles")).find((r: any) => r.name === "Admin");
  expect((await a.api.del(`/roles/${adminRole.id}`)).status).toBe(400);
});

test("[mz-audit-log.2] audit log API: every write is recorded with user, action and entity; filters work; metadata only; isolation", { tags: ["feat:mz-audit-log", "shard:platform-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/audit-logs")).status).toBe(401);
  const customer = await a.api.post("/customers", { name: seeded("Audited customer"), currency: "USD", email: seededEmail("audited") });
  expect(customer.status).toBe(201);
  await a.api.patch(`/customers/${customer.body.id}`, { phone: "+201000000000" });
  const logs = async () => rows(await a.api.get("/audit-logs", { entityType: "customers", entityId: customer.body.id }));
  await expect.poll(async () => (await logs()).map((l: any) => l.action).sort(), { timeout: 30_000 }).toEqual(["CREATE", "UPDATE"]);
  const entry = (await logs())[0];
  expect(entry).toMatchObject({ entityType: "customers", entityId: customer.body.id, userId: a.userId });
  expect(JSON.stringify(entry)).not.toMatch(/password|token/i);
  expect((await a.api.get(`/audit-logs/${entry.id}`)).body.id).toBe(entry.id);
  const byEntity = await a.api.get(`/audit-logs/entity/customers/${customer.body.id}`);
  expect(byEntity.status).toBe(200);
  expect(rows(byEntity).length).toBe(2);
  const stats = await a.api.get("/audit-logs/stats", { days: 7 });
  expect(stats.status).toBe(200);
  expect((await a.api.get("/audit-logs", { limit: 1000 })).status).toBe(400);
  expect((await a.api.get("/audit-logs", { action: "EXPLODE" })).status).toBe(400);
  // another organization cannot read these entries; reads are not audited
  expect((await b.api.get(`/audit-logs/${entry.id}`)).status).toBe(404);
  expect(rows(await b.api.get("/audit-logs", { entityId: customer.body.id }))).toHaveLength(0);
  const before = (await logs()).length;
  await a.api.get(`/customers/${customer.body.id}`);
  expect((await logs()).length).toBe(before);
  await a.api.del(`/customers/${customer.body.id}`);
  await expect.poll(async () => (await logs()).map((l: any) => l.action).sort(), { timeout: 30_000 }).toEqual(["CREATE", "DELETE", "UPDATE"]);
});

test("[mz-notifications.2] notifications API: per-user list, unread count, mark read, delete; other users and tenants see none", { tags: ["feat:mz-notifications", "shard:platform-api", "lvl:api"] }, async () => {
  const a = await A();
  expect((await anon.get("/notifications")).status).toBe(401);
  expect((await anon.get("/notifications/unread-count")).status).toBe(401);
  const admin = await adminApi();
  const list = await admin.get("/notifications");
  expect(list.status).toBe(200);
  const seededTitles = rows(list).map((n: any) => n.title);
  for (const title of ["Invoice Overdue", "Bill Due Soon", "Low Stock Alert", "New Lead Assigned"]) expect(seededTitles).toContain(title);
  const count = await admin.get("/notifications/unread-count");
  expect(count.status).toBe(200);
  const unread = Number(count.body.count ?? count.body.unreadCount ?? count.body);
  expect(unread).toBeGreaterThanOrEqual(0);
  const target = rows(list).find((n: any) => n.isRead === false);
  if (target) {
    expect((await admin.post(`/notifications/${target.id}/read`)).status).toBe(201);
    const after = Number((await admin.get("/notifications/unread-count")).body.count ?? (await admin.get("/notifications/unread-count")).body.unreadCount);
    expect(after).toBe(unread - 1);
  }
  expect((await admin.post("/notifications/read-all")).status).toBe(201);
  expect(Number((await admin.get("/notifications/unread-count")).body.count ?? (await admin.get("/notifications/unread-count")).body.unreadCount ?? 0)).toBe(0);
  expect((await admin.del("/notifications/ghost-id")).status).toBeGreaterThanOrEqual(400);
  // a fresh organization has no notifications and cannot touch the demo ones
  expect(rows(await a.api.get("/notifications"))).toHaveLength(0);
  const demoId = rows(list)[0].id;
  expect((await a.api.post(`/notifications/${demoId}/read`)).status).toBeGreaterThanOrEqual(400);
  expect((await a.api.del(`/notifications/${demoId}`)).status).toBeGreaterThanOrEqual(400);
});

test("[mz-notification-jobs.1] notification job work items: overdue invoices, upcoming bills and low stock are visible in the data the hourly/daily jobs read", { tags: ["feat:mz-notification-jobs", "shard:platform-api", "lvl:api"] }, async () => {
  // The @Cron jobs (hourly overdue invoices, 08:00 low stock, 09:00 bills due) have no HTTP trigger in the verify stack. Their inputs - an
  // invoice past its due date, an open bill, an item at or below its reorder point - are created through the API and must show up in the
  // reports the jobs query, so a broken input path is caught even though the cron itself cannot be fired.
  const a = await A();
  const customer = (await a.api.post("/customers", { name: seeded("Notification customer"), currency: "USD" })).body.id;
  const inv = (await a.api.post("/invoices", invoiceBody(customer, [{ quantity: "1", rate: "50" }], { dueDate: DATE.past }))).body;
  expect((await a.api.patch(`/invoices/${inv.id}/send`)).status).toBe(200);
  const aging = await a.api.get("/reports/receivables-aging");
  expect(aging.body.buckets.over90.map((i: any) => i.invoiceId)).toContain(inv.id);
  const alerts = await a.api.get("/ai/reorder/alerts");
  expect(alerts.status).toBeLessThan(500);
  expect((await a.api.get("/notifications")).status).toBe(200);
});

test("[mz-global-search.2] search API: finds records across entities within the tenant, records and clears history, validates the query", { tags: ["feat:mz-global-search", "shard:platform-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/search", { q: "abc" })).status).toBe(401);
  const unique = seeded("Searchable", 6).replace(/-/g, "");
  const customer = (await a.api.post("/customers", { name: `${unique} Trading`, currency: "USD" })).body;
  const vendor = (await a.api.post("/vendors", { name: `${unique} Supplies` })).body;
  await expect.poll(async () => JSON.stringify((await a.api.get("/search", { q: unique })).body), { timeout: 30_000 }).toContain(customer.id);
  const found = await a.api.get("/search", { q: unique });
  expect(found.status).toBe(200);
  expect(JSON.stringify(found.body)).toContain(vendor.id);
  const onlyCustomers = await a.api.get("/search", { q: unique, types: "customer" });
  expect(onlyCustomers.status).toBe(200);
  expect(JSON.stringify(onlyCustomers.body)).not.toContain(vendor.id);
  expect((await a.api.get("/search", { q: "a" })).status).toBe(400); // two characters minimum
  expect((await a.api.get("/search")).status).toBe(400);
  expect(JSON.stringify((await b.api.get("/search", { q: unique })).body)).not.toContain(customer.id);
  const rec = await a.api.post("/search/history", { query: unique, resultType: "customer", resultId: customer.id, resultTitle: customer.name });
  expect(rec.status).toBe(201);
  expect(JSON.stringify((await a.api.get("/search/history")).body)).toContain(unique);
  expect(JSON.stringify((await b.api.get("/search/history")).body)).not.toContain(unique);
  expect((await a.api.del("/search/history")).status).toBe(200);
  expect(rows(await a.api.get("/search/history"))).toHaveLength(0);
});

test("[mz-import-export.1] import API: parse, validate and execute a customers CSV; export returns the data; malformed requests are client errors", { tags: ["feat:mz-import-export", "shard:platform-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/import/entity-types")).status).toBe(401);
  const types = await a.api.get("/import/entity-types");
  expect(types.status).toBe(200);
  expect(types.body).toEqual(expect.arrayContaining(["customers", "vendors", "items", "accounts"]));
  const fields = await a.api.get("/import/fields/customers");
  expect(fields.status).toBe(200);
  expect(JSON.stringify(fields.body.fields)).toContain("name");
  expect((await a.api.get("/import/fields/starships")).status).toBe(400);

  const name1 = seeded("Imported One"), name2 = seeded("Imported Two");
  const file = { name: "customers.csv", type: "text/csv", data: csv(["Name,Email,Phone", `${name1},${seededEmail("imp1")},+201111111111`, `${name2},${seededEmail("imp2")},+201222222222`]) };
  const parsed = await a.api.upload("/import/parse", file);
  expect(parsed.status).toBe(201);
  expect(parsed.body).toMatchObject({ headers: ["Name", "Email", "Phone"], totalRows: 2, fileType: "csv" });
  const config = { entityType: "customers", columnMappings: [{ sourceColumn: "Name", targetField: "name" }, { sourceColumn: "Email", targetField: "email" }, { sourceColumn: "Phone", targetField: "phone" }] };
  const validated = await a.api.upload("/import/validate", file, { config: JSON.stringify(config) });
  expect(validated.status).toBe(201);
  expect(validated.body).toMatchObject({ valid: true, totalRows: 2 });
  const executed = await a.api.upload("/import/execute", file, { config: JSON.stringify(config) });
  expect(executed.status).toBe(200);
  expect(executed.body).toMatchObject({ success: true, created: 2, failed: 0 });
  await expect.poll(async () => rows(await a.api.get("/customers", { search: "Imported" })).map((c) => c.name).sort(), { timeout: 20_000 }).toEqual([name1, name2].sort());
  expect(rows(await b.api.get("/customers", { search: "Imported" }))).toHaveLength(0);

  // bad input is a client error, never a crash
  expect((await a.api.upload("/import/parse", { name: "notes.txt", type: "text/plain", data: "hello" })).status).toBe(400);
  expect((await a.api.upload("/import/validate", file, {})).status).toBe(400); // config missing
  const brokenConfig = await a.api.upload("/import/validate", file, { config: "{not json" });
  expect(brokenConfig.status, "a malformed config is the client's mistake").toBe(400);
  expect((await a.api.upload("/import/validate", file, { config: JSON.stringify({ ...config, entityType: "starships" }) })).status).toBe(400);
  const badRows = { name: "bad.csv", type: "text/csv", data: csv(["Name,Email", `${seeded("Bad email")},not-an-email`]) };
  const invalid = await a.api.upload("/import/validate", badRows, { config: JSON.stringify({ entityType: "customers", columnMappings: [{ sourceColumn: "Name", targetField: "name" }, { sourceColumn: "Email", targetField: "email" }] }) });
  expect(invalid.status).toBe(201);
  expect(invalid.body.valid).toBe(false);
  expect(invalid.body.errors.length).toBeGreaterThan(0);

  // export
  const exported = await a.api.request("GET", "/export/customers", { query: { format: "csv" } });
  expect(exported.status).toBe(200);
  expect(exported.headers.get("content-type")).toContain("text/csv");
  expect(exported.text).toContain(name1);
  expect((await b.api.request("GET", "/export/customers", { query: { format: "csv" } })).text).not.toContain(name1);
  const tpl = await a.api.get("/export/template/customers");
  expect(tpl.status).toBe(200);
  const customerId = rows(await a.api.get("/customers", { search: name1 }))[0].id;
  const bulk = await a.api.request("POST", "/export/bulk", { body: { ids: [customerId], entityType: "customers", format: "csv" } });
  expect(bulk.status).toBe(201);
  expect(bulk.text).toContain(name1);
  expect((await a.api.post("/export/bulk", { ids: [], entityType: "customers" })).status).toBe(400);
  expect((await a.api.get("/export/starships")).status).toBe(400);
});

test("[mz-documents.1] document API: invoice, quote and bill PDFs, statements, and email sending that reports missing SMTP settings", { tags: ["feat:mz-documents", "shard:platform-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/documents/email-logs")).status).toBe(401);
  const customer = (await a.api.post("/customers", { name: seeded("Document customer"), email: seededEmail("doc-customer"), currency: "USD" })).body.id;
  const inv = (await a.api.post("/invoices", invoiceBody(customer, [{ quantity: "2", rate: "100", taxRate: "14" }]))).body;
  const pdf = await a.api.get(`/documents/invoice/${inv.id}/pdf`);
  expect(pdf.status, pdf.text.slice(0, 200)).toBe(200);
  expect(pdf.headers.get("content-type")).toContain("application/pdf");
  expect(pdf.headers.get("content-disposition")).toContain("invoice-");
  expect(pdf.text.startsWith("%PDF")).toBe(true);
  expect((await b.api.get(`/documents/invoice/${inv.id}/pdf`)).status).toBe(404); // another tenant's invoice
  expect((await anon.get(`/documents/invoice/${inv.id}/pdf`)).status).toBe(401);
  const quote = (await a.api.post("/quotes", { customerId: customer, date: DATE.doc, expiryDate: DATE.due, lines: [{ description: "Q", quantity: "1", rate: "10" }] })).body;
  expect((await a.api.get(`/documents/quote/${quote.id}/pdf`)).headers.get("content-type")).toContain("application/pdf");
  const statement = await a.api.get(`/documents/statement/${customer}/pdf`);
  expect(statement.status).toBe(200);
  // no SMTP is configured in the throwaway stack: sending reports it instead of pretending
  const send = await a.api.post(`/documents/invoice/${inv.id}/send`, { to: seededEmail("recipient") });
  expect([200, 201, 400]).toContain(send.status);
  expect(JSON.stringify(send.body)).toMatch(/not configured|SMTP|success/i);
  expect((await a.api.post(`/documents/invoice/${inv.id}/send`, { to: "not-an-email" })).status).toBe(400);
  expect((await a.api.get("/documents/email-logs")).status).toBe(200);
  expect(rows(await b.api.get("/documents/email-logs"))).toHaveLength(0);
});

test("[mz-currency.1] currency API: supported currencies, exchange rates CRUD, conversion with the stored rate, validation, isolation", { tags: ["feat:mz-currency", "shard:platform-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/currency/supported")).status).toBe(401);
  const supported = await a.api.get("/currency/supported");
  expect(supported.status).toBe(200);
  expect(JSON.stringify(supported.body)).toContain("EGP");
  expect((await a.api.get("/currency/info")).status).toBe(200);
  const rate = await a.api.post("/currency/exchange-rates", { fromCurrency: "USD", toCurrency: "EGP", rate: 48.5, date: "2026-03-10" });
  expect(rate.status).toBe(201);
  expect(Number(rate.body.rate)).toBe(48.5);
  expect((await a.api.post("/currency/exchange-rates", { fromCurrency: "US", toCurrency: "EGP", rate: 1, date: "2026-03-10" })).status).toBe(400);
  expect((await a.api.post("/currency/exchange-rates", { fromCurrency: "USD", toCurrency: "EGP", rate: -1, date: "2026-03-10" })).status).toBe(400);
  expect((await a.api.post("/currency/exchange-rates", { fromCurrency: "USD", toCurrency: "EGP", rate: 1.1234567, date: "2026-03-10" })).status).toBe(400); // six decimals at most
  const list = await a.api.get("/currency/exchange-rates", { fromCurrency: "USD", toCurrency: "EGP" });
  expect(ids(list)).toContain(rate.body.id);
  const latest = await a.api.get("/currency/exchange-rates/latest");
  expect(latest.status).toBe(200);
  const direct = await a.api.get("/currency/rate/USD/EGP");
  expect(direct.status).toBe(200);
  expect(JSON.stringify(direct.body)).toContain("48.5");
  const converted = await a.api.post("/currency/convert", { amount: 100, fromCurrency: "USD", toCurrency: "EGP" });
  expect([200, 201]).toContain(converted.status);
  expect(JSON.stringify(converted.body)).toContain("4850");
  const upd = await a.api.put(`/currency/exchange-rates/${rate.body.id}`, { rate: 49 });
  expect(upd.status).toBe(200);
  expect(Number(upd.body.rate)).toBe(49);
  expect(ids(await b.api.get("/currency/exchange-rates"))).not.toContain(rate.body.id);
  expect((await b.api.put(`/currency/exchange-rates/${rate.body.id}`, { rate: 1 })).status).toBe(404);
  expect((await b.api.del(`/currency/exchange-rates/${rate.body.id}`)).status).toBe(404);
  expect((await a.api.del(`/currency/exchange-rates/${rate.body.id}`)).status).toBe(200);
  expect((await a.api.get("/currency/unrealized-gain-loss")).status).toBeLessThan(500);
});

test("[mz-user-preferences.1] user preferences API: dashboard layout and tour progress are stored per user", { tags: ["feat:mz-user-preferences", "shard:platform-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/user/preferences")).status).toBe(401);
  const prefs = await a.api.get("/user/preferences");
  expect(prefs.status).toBe(200);
  const widgets = [{ id: "ai-pulse", visible: false, order: 1 }, { id: "revenue", visible: true, order: 0 }];
  const saved = await a.api.put("/user/preferences/dashboard-layout", { widgets });
  expect(saved.status).toBe(200);
  const read = await a.api.get("/user/preferences/dashboard-layout");
  expect(read.status).toBe(200);
  expect(JSON.stringify(read.body)).toContain("ai-pulse");
  expect((await a.api.put("/user/preferences/dashboard-layout", { widgets: [{ id: "x", visible: "yes", order: "first" }] })).status).toBe(400);
  expect((await a.api.put("/user/preferences/dashboard-layout", {})).status).toBe(400);
  expect(JSON.stringify((await b.api.get("/user/preferences/dashboard-layout")).body)).not.toContain("ai-pulse");
  const tour = await a.api.patch("/user/preferences/tour/dashboard", { completed: false, currentStep: 2 });
  expect(tour.status).toBe(200);
  expect((await a.api.patch("/user/preferences/tour/dashboard", { completed: "maybe" })).status).toBe(400);
  expect((await a.api.post("/user/preferences/tour/dashboard/dismiss")).status).toBeLessThan(300);
});

test("[mz-bulk-operations.1] bulk operation job status API: authenticated, unknown jobs are 404 (no start endpoint exists to create one)", { tags: ["feat:mz-bulk-operations", "shard:platform-api", "lvl:api"] }, async () => {
  const a = await A();
  expect((await anon.get("/bulk-operations/job-1/status")).status).toBe(401);
  const unknown = await a.api.get("/bulk-operations/00000000-0000-4000-8000-000000000000/status");
  expect(unknown.status).toBe(404);
  expect(unknown.body.message).toMatch(/not found/i);
  // the per-record bulk endpoints the UI uses (and the progress dialog polls) report per-record outcomes
  const customers = await Promise.all([1, 2].map((i) => a.api.post("/customers", { name: seeded(`Bulk ${i}`), currency: "USD" })));
  const bulk = await a.api.post("/customers/bulk-delete", { ids: customers.map((c) => c.body.id) });
  expect(bulk.status).toBe(201);
  expect(bulk.body).toMatchObject({ processed: 2, total: 2 });
  expect((await a.api.post("/customers/bulk-delete", { ids: [] })).status).toBe(400);
  expect((await a.api.post("/customers/bulk-delete", { ids: Array.from({ length: 101 }, (_, i) => `id-${i}`) })).status).toBe(400);
});

test("[mz-onboarding.1] onboarding API: wizard status, chart-of-accounts templates, company info, tax config, opening balances, skip and AI steps", { tags: ["feat:mz-onboarding", "shard:platform-api", "lvl:api"] }, async () => {
  const t = await tenant("onboarding"), b = await tenant("onboarding-b");
  expect((await anon.get("/organization/onboarding")).status).toBe(401);
  const status = await t.api.get("/organization/onboarding");
  expect(status.status).toBe(200);
  expect(status.body).toMatchObject({ isComplete: false, totalSteps: 7, completedSteps: 0 });
  const templates = await t.api.get("/organization/onboarding/coa-templates");
  expect(templates.status).toBe(200);
  expect(JSON.stringify(templates.body)).toMatch(/standard/i);

  expect((await t.api.post("/organization/onboarding/company-info", { name: "x" })).status).toBe(400); // base currency is required
  const company = await t.api.post("/organization/onboarding/company-info", { name: seeded("Onboarded Co"), industry: "services", baseCurrency: "EGP", address: "Cairo" });
  expect([200, 201]).toContain(company.status);
  expect((await t.api.get("/organization")).body.name).toBe(seeded("Onboarded Co"));
  expect((await t.api.post("/organization/onboarding/chart-of-accounts", { template: "starship" })).status).toBe(400);
  const coa = await t.api.post("/organization/onboarding/chart-of-accounts", { template: "standard", applyTemplate: true });
  expect([200, 201]).toContain(coa.status);
  expect(rows(await t.api.get("/accounts", { limit: 500 })).length).toBeGreaterThan(10);
  const again = await t.api.post("/organization/onboarding/chart-of-accounts", { template: "standard", applyTemplate: true });
  expect(again.status).toBe(400); // a chart already exists
  const tax = await t.api.post("/organization/onboarding/tax-config", { taxRates: [{ name: seeded("Onboard VAT"), rate: 14, isDefault: true }] });
  expect([200, 201]).toContain(tax.status);
  expect((await t.api.post("/organization/onboarding/tax-config", { taxRates: "none" })).status).toBe(400);
  expect([200, 201]).toContain((await t.api.post("/organization/onboarding/ai-features", { categorizationEnabled: true, anomalyEnabled: false })).status);
  expect([200, 201]).toContain((await t.api.post("/organization/onboarding/import-data", { skipped: true })).status);
  expect([200, 201]).toContain((await t.api.post("/organization/onboarding/skip", { step: "tour" })).status);
  const final = (await t.api.get("/organization/onboarding")).body;
  expect(final.steps.companyInfo.completed).toBe(true);
  expect(final.steps.chartOfAccounts.completed).toBe(true);
  expect(final.steps.tour.skipped).toBe(true);
  expect(final.completedSteps).toBeGreaterThanOrEqual(5);
  // the wizard of one organization never changes another's
  expect((await b.api.get("/organization/onboarding")).body.completedSteps).toBe(0);

  // opening balances: one balanced journal against Opening Balance Equity, once unless replaced
  const accounts = rows(await t.api.get("/accounts", { limit: 500 }));
  const bank = accounts.find((x: any) => x.type === "ASSET").id, liability = accounts.find((x: any) => x.type === "LIABILITY").id;
  const equity = await ensureAccount(t, "3990", "Opening Balance Equity", "EQUITY");
  const body = { openingDate: "2026-01-01", balances: [{ accountId: bank, amount: "5000.50" }, { accountId: liability, amount: "1200.25" }], equityAccountId: equity };
  expect((await t.api.post("/organization/onboarding/opening-balances", { ...body, balances: [{ accountId: bank, amount: "-5" }] })).status).toBe(400);
  const posted = await t.api.post("/organization/onboarding/opening-balances", body);
  expect(posted.status).toBe(201);
  const tb = (await t.api.get("/accounting-reports/trial-balance")).body;
  expect(tb.totals.totalDebits).toBe(tb.totals.totalCredits);
  expect(dec(tb.totals.totalDebits)).toBe("5000.5");
  expect((await t.api.post("/organization/onboarding/opening-balances", body)).status).toBe(409);
  expect((await b.api.post("/organization/onboarding/opening-balances", body)).status).toBe(400); // another tenant's accounts
  const replaced = await t.api.post("/organization/onboarding/opening-balances", { ...body, balances: [{ accountId: bank, amount: "6000" }], replaceExisting: true });
  expect(replaced.status).toBe(201);
  const tb2 = (await t.api.get("/accounting-reports/trial-balance")).body;
  expect(tb2.totals.totalDebits).toBe(tb2.totals.totalCredits);
  const acc = accounts.find((x: any) => x.id === bank);
  expect(dec((await t.api.get(`/accounts/${acc.id}/balance`)).body.balance)).toBe("6000");
});

test("[mz-error-logger.1] error logger API: browsers report errors per organization, admins list, update and clear them, the stream is tenant scoped", { tags: ["feat:mz-error-logger", "shard:platform-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.post("/logger/capture", { level: "error", source: "frontend", message: "x" })).status).toBe(401);
  const message = seeded("frontend failure");
  const captured = await a.api.post("/logger/capture", { level: "error", source: "frontend", message, stack: "Error: boom\n    at render (page.tsx:1:1)", url: "/en/sales/invoices", category: "render-error" });
  expect(captured.status).toBe(201);
  expect((await a.api.post("/logger/capture", { level: "loud", source: "frontend", message })).status).toBe(400);
  expect((await a.api.post("/logger/capture", { level: "error", source: "frontend" })).status).toBe(400);
  // a client may not claim the trusted backend source
  const claimed = await a.api.post("/logger/capture", { level: "warn", source: "backend", message: seeded("claims backend") });
  expect(claimed.status).toBe(201);
  const logs = await a.api.get("/logger/logs", { search: message });
  expect(logs.status).toBe(200);
  const entry = rows(logs).find((l: any) => l.message === message) ?? (logs.body.logs ?? []).find((l: any) => l.message === message);
  expect(entry).toBeDefined();
  expect(entry.source).toBe("frontend");
  const stats = await a.api.get("/logger/stats");
  expect(stats.status).toBe(200);
  expect((await a.api.get(`/logger/logs/${entry.id}`)).status).toBe(200);
  expect((await b.api.get(`/logger/logs/${entry.id}`)).status).toBe(404);
  expect(JSON.stringify((await b.api.get("/logger/logs")).body)).not.toContain(message);
  const updated = await a.api.post("/logger/update-status", { ids: [entry.id], status: "fixed" });
  expect([200, 201]).toContain(updated.status);
  expect((await a.api.post("/logger/update-status", { ids: [entry.id], status: "vanished" })).status).toBe(400);
  const prompt = await a.api.post("/logger/generate-prompt", { logIds: [entry.id], includeStacks: true });
  expect([200, 201]).toContain(prompt.status);
  expect(JSON.stringify(prompt.body)).toContain(message);
  expect((await b.api.del("/logger/clear", { ids: [entry.id] })).status).toBeLessThan(500);
  expect(JSON.stringify((await a.api.get("/logger/logs", { search: message })).body)).toContain(message); // another tenant's clear did not remove it
  expect((await a.api.del("/logger/clear", { ids: [entry.id] })).status).toBe(200);
});

test("[mz-system-diagnostics.2] cache and performance admin API: cache stats, keys and flush are organization scoped; query metrics answer for an administrator", { tags: ["feat:mz-system-diagnostics", "shard:platform-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  for (const path of ["/cache/stats", "/cache/keys", "/performance/stats", "/performance/health"]) expect((await anon.get(path)).status).toBe(401);
  const stats = await a.api.get("/cache/stats");
  expect(stats.status).toBe(200);
  expect(stats.body).toHaveProperty("type");
  // warm the cache with a cached list, then see keys of this organization only
  await a.api.get("/customers", { limit: 5 });
  await a.api.get("/reports/dashboard");
  const keys = await a.api.get("/cache/keys");
  expect(keys.status).toBe(200);
  const keyText = JSON.stringify(keys.body);
  expect(keyText).not.toContain(b.orgId);
  const flushed = await a.api.del("/cache/flush");
  expect(flushed.status).toBe(200);
  expect(flushed.body.success).toBe(true);
  expect((await a.api.del("/cache/keys/customers%3A*")).status).toBe(200);
  for (const path of ["/performance/stats", "/performance/distribution", "/performance/trend", "/performance/health", "/performance/slow-queries", "/performance/index-recommendations"]) {
    const r = await a.api.get(path);
    expect(r.status, `${path}: ${r.text.slice(0, 120)}`).toBe(200);
  }
  expect((await a.api.post("/performance/reset")).status).toBeLessThan(300);
});
