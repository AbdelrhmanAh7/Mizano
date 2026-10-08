// Mizano smoke shard (<= 90 s): sign-in, health, dashboard, landing page and Arabic/RTL. Ported from the critical-flow suite (tests/Mizano.e2e.ts)
// and tagged per feature; this shard also runs for files no feature claims (the "feature map gap" case).
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { needsModel } from "../lib.ts";
import { ADMIN, Api, anon, formSignIn, h1, signIn, tenant } from "./_mz.e2e.ts";

const WEB = () => String(process.env.E2E_ARMY_URL ?? "").replace(/\/+$/, "");

test("[mz-auth.1] the demo accountant signs in through the form and lands on the dashboard", { tags: ["feat:mz-auth", "shard:smoke", "lvl:ui"] }, async (fx) => {
  needsModel();
  const { agent, browser, screen } = fx;
  await formSignIn(fx);
  await expect(browser).toHaveURL(/\/en\/dashboard/);
  await expect(h1(screen, "Dashboard")).toBeVisible({ timeout: 90_000 });
  await agent.assert("the Mizano dashboard is shown for the signed-in user, with a navigation menu that lists Sales, Purchases, Accounting and Reports");
});

test("[mz-auth.2] a wrong password does not sign the user in", { tags: ["feat:mz-auth", "shard:smoke", "lvl:ui"] }, async ({ app, agent, screen, browser }) => {
  needsModel();
  await app.open("/en/login");
  await expect(screen.getByRole("button", "Sign In")).toBeVisible({ timeout: 60_000 });
  await agent.act("fill the sign-in form with the email {email} and the password {pw}, press Sign In once and stop: the step is complete as soon as the form was submitted, whatever the page then shows", { params: { email: ADMIN.email, pw: "not-the-password-1" } });
  await agent.waitFor("the sign-in button reads 'Sign In' again, so the attempt has finished");
  await expect(browser).toHaveURL(/\/en\/login/);
  await expect(screen.getByRole("button", "Sign In")).toBeVisible();
  await agent.assert("the user is not signed in: the sign-in form (Email, Password, Sign In) is still shown and no dashboard or app menu is visible");
});

test("[mz-auth.3] the auth API issues tokens, refuses bad credentials and rotates / revokes refresh tokens", { tags: ["feat:mz-auth", "shard:smoke", "lvl:api"] }, async () => {
  const ok = await anon.post("/auth/login", ADMIN);
  expect(ok.status).toBe(200);
  expect(ok.body.tokens.accessToken).toMatch(/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/);
  expect(ok.body.tokens.refreshToken).toMatch(/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/);
  expect(ok.body.user).toMatchObject({ email: ADMIN.email, status: "ACTIVE" });
  expect(ok.body.organization.name).toBe("Mizano Demo Company");
  expect(ok.text).not.toMatch(/passwordHash/i);

  const bad = await anon.post("/auth/login", { email: ADMIN.email, password: "not-the-password-1" });
  expect(bad.status).toBe(401);
  expect(bad.body.message).toBe("Invalid email or password");
  expect(bad.text).not.toMatch(/passwordHash/i);

  // Registration validation (DTO) and conflict
  const t = await tenant("auth");
  const weak = await anon.post("/auth/register", { email: "weak@army-e2e.test", password: "alllowercase1", firstName: "A", lastName: "B", organizationName: "Weak Org" });
  expect(weak.status).toBe(400);
  expect(JSON.stringify(weak.body.message)).toMatch(/uppercase/i);
  const badMail = await anon.post("/auth/register", { email: "not-an-email", password: "ArmyE2e2026x", firstName: "A", lastName: "B", organizationName: "Bad Mail" });
  expect(badMail.status).toBe(400);
  const dup = await anon.post("/auth/register", { email: t.email, password: "ArmyE2e2026x", firstName: "A", lastName: "B", organizationName: "Duplicate" });
  expect(dup.status).toBe(409);

  // Refresh rotation: the old refresh token is dead after use; logout revokes the current one.
  const refreshed = await anon.as(t.refreshToken).post("/auth/refresh", { refreshToken: t.refreshToken });
  expect(refreshed.status).toBe(200);
  const next = refreshed.body.tokens;
  expect(next.refreshToken).not.toBe(t.refreshToken);
  expect((await anon.as(t.refreshToken).post("/auth/refresh", { refreshToken: t.refreshToken })).status).toBe(401);
  expect((await new Api(next.accessToken).post("/auth/logout")).status).toBe(200);
  expect((await anon.as(next.refreshToken).post("/auth/refresh", { refreshToken: next.refreshToken })).status).toBe(401);
  expect((await anon.post("/auth/logout")).status).toBe(401);
});

test("[mz-health.1] the health endpoints report a live API with a connected database", { tags: ["feat:mz-health", "shard:smoke", "lvl:api"] }, async () => {
  const health = await anon.get("/health");
  expect(health.status).toBe(200);
  expect(health.body).toMatchObject({ status: "healthy", services: { database: { status: "connected" } } });
  expect(health.body.uptime).toBeGreaterThan(0);
  const live = await anon.get("/health/live");
  expect(live.status).toBe(200);
  expect(live.body.alive).toBe(true);
  const ready = await anon.get("/health/ready");
  expect(ready.status).toBe(200);
  expect(ready.body).toMatchObject({ ready: true });
  // the web server answers its own login page (the verify job's health probe)
  const page = await fetch(`${WEB()}/en/login`);
  expect(page.status).toBe(200);
});

test("[mz-dashboard.1] the signed-in dashboard shows the key figures without an error state", { tags: ["feat:mz-dashboard", "shard:smoke", "lvl:ui"] }, async (fx) => {
  needsModel();
  const { agent, screen, browser } = fx;
  await signIn(fx, "/en/dashboard");
  await expect(browser).toHaveURL(/\/en\/dashboard/);
  await expect(h1(screen, "Dashboard")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the dashboard shows statistic cards such as Revenue, Expenses, Net Profit and Bank Balance with money amounts (no skeleton placeholders left) and no error banner such as 'Failed to load dashboard data'", { timeout: 60_000 });
  await expect(screen.getByText("Failed to load dashboard data")).toBeHidden();
});

test("[mz-landing.1] the public landing page opens for visitors, offers sign-in and registration, and has an Arabic version", { tags: ["feat:mz-landing", "shard:smoke", "lvl:ui"] }, async ({ app, screen, browser }) => {
  await app.open("/");
  // an anonymous visitor of the root path is sent to the landing page of the default locale
  await expect(browser).toHaveURL(/\/en\/onboarding/, { timeout: 60_000 });
  await expect(h1(screen, "AI-Powered Autonomous Accounting")).toBeVisible();
  await expect(screen.getByRole("link", "Get Started").first()).toBeVisible();
  await expect(screen.getByRole("link", "Login").first()).toBeVisible();
  await app.open("/ar/onboarding");
  await expect(h1(screen, "محاسبة ذاتية مدعومة بالذكاء الاصطناعي")).toBeVisible();
  await expect.poll(() => browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
});

test("[mz-i18n-rtl.1] Arabic pages render right-to-left with Arabic text and English pages left-to-right", { tags: ["feat:mz-i18n-rtl", "shard:smoke", "lvl:ui"] }, async (fx) => {
  const { app, screen, browser } = fx;
  await app.open("/ar/login");
  await expect(screen.getByRole("heading", "تسجيل الدخول")).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
  await expect.poll(() => browser.evaluate(() => document.documentElement.lang)).toBe("ar");
  await app.open("/en/login");
  await expect(screen.getByRole("heading", "Sign In")).toBeVisible();
  await expect.poll(() => browser.evaluate(() => document.documentElement.dir)).toBe("ltr");
  // the signed-in area follows the locale of the URL
  await signIn(fx, "/ar/dashboard");
  await expect(h1(screen, "لوحة التحكم")).toBeVisible({ timeout: 90_000 });
  await expect.poll(() => browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
  expect(await browser.evaluate(() => /[؀-ۿ]/.test(document.body.innerText))).toBe(true);
});

test("[mz-i18n-rtl.2] the language switcher moves the sign-in page to Arabic and keeps the route", { tags: ["feat:mz-i18n-rtl", "shard:smoke", "lvl:ui"] }, async ({ app, agent, browser, screen }) => {
  needsModel();
  await app.open("/en/login");
  await expect(screen.getByRole("heading", "Sign In")).toBeVisible({ timeout: 60_000 });
  await agent.act("open the language menu and choose the Arabic entry (العربية)");
  await expect(browser).toHaveURL(/\/ar\/login/, { timeout: 30_000 });
  await expect(screen.getByRole("heading", "تسجيل الدخول")).toBeVisible();
  await agent.assert("the sign-in page is now shown in Arabic (right-to-left layout) with an email and a password field");
});
