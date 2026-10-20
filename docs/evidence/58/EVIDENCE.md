# EVIDENCE.md — PR #58: Telegram Long-Polling Ingestion & Settings UI

## Overview

- **PR**: #58 `feat(intake): telegram long-polling ingestion into intake jobs`
- **Related Issue**: #20 (Milestone P3: Ingest Telegram channel invoices into durable CPU queue)
- **Branch**: `demo/20-telegram-intake`
- **Tested Head**: `HEAD` (demo/20-telegram-intake merged with `origin/master`)
- **Originating Sentry Issue**: None. This is a feature implementation and review finding remediation; no user-reported production crash in Sentry.
- **E2E Status**: `E2E: not needed — Telegram long-polling is disabled by default and only processes documents after secure link code verification` (also covered by targeted e2e-army test `e2e-army/pr58-telegram-link.e2e.ts`).

---

## Acceptance Criteria (Explicit & Numbered)

| AC #    | Acceptance Criterion                                                                                                                                                                                                                                                                                                                                         | Verification Method / Covering Tests                                                                                                                                                                                                                                        | Exit Code | Status     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| **AC1** | **Schema & Cursor Durability**: `TelegramLink` (unique `chatId`), `TelegramLinkCode` (SHA-256, 15m expiry, single-use), `TelegramPollState` (durable BIGINT cursor across restarts), `TelegramDelivery` (status, attempts, durable deferral).                                                                                                                | Unit specs: `apps/api/src/modules/telegram/telegram-link.service.spec.ts` (14 tests), `apps/api/src/modules/telegram/telegram-intake.service.spec.ts` (48 tests); Migrations: `20261004000000_telegram_links`, `20261004010000_telegram_deliveries`.                        | 0         | **PASSED** |
| **AC2** | **Long-Polling & Token Gating**: Ingestion operates via plain HTTP fetch without inbound webhooks; disabled gracefully when `TELEGRAM_BOT_TOKEN` is unset/empty without crashing boot. Offset advances sequentially with BIGINT support.                                                                                                                     | Unit specs: `apps/api/src/modules/telegram/telegram.client.spec.ts` (13 tests: disabled when token unset, sequential polling, exponential backoff).                                                                                                                         | 0         | **PASSED** |
| **AC3** | **Tenant Isolation & Link Codes**: Admin generates one-time link code (`POST /telegram/link-code`, `settings.edit`). `/link <code>` accepted only in private chats; cross-org relinking rejected; unlinked messages refused without saving; audit logged on unlink.                                                                                          | Controller & link specs: `apps/api/src/modules/telegram/telegram.controller.ts`, `apps/api/src/modules/telegram/telegram-link.service.spec.ts` (tenant-scoped links, audit entry creation, private chat verification).                                                      | 0         | **PASSED** |
| **AC4** | **Intake Ingestion & Privacy**: Documents/photos (PDF, JPEG, PNG, DOCX up to 15 MB) routed via `IntakeJobsService` (source: `TELEGRAM`, deduplicated). No tokens, auth headers, captions, or document content leaked in logs.                                                                                                                                | Unit specs: `apps/api/src/modules/telegram/telegram-intake.service.spec.ts` (sanitization assertions, deduplication, oversized file rejection).                                                                                                                             | 0         | **PASSED** |
| **AC5** | **Rate Limiting & Durable Deferral**: Per-chat rate limit (10 docs/min) does NOT block bot cursor or stall other tenants. Excess documents recorded as durable deferred `TelegramDelivery` rows; `drainDeferred()` resumes them when window opens; attempt refunds on deferral/shutdown; defensive terminal update check prevents duplicate failure replies. | Unit specs: `apps/api/src/modules/telegram/telegram-intake.service.spec.ts` ("does not block another chat or the cursor behind a rate-limited chat", "refunds attempts on deferral", "sends no failure reply if another processor completed the exhausted delivery first"). | 0         | **PASSED** |
| **AC6** | **Bilingual Responses**: All user-facing bot messages (`MSG.rateLimited`, `MSG.notLinked`, `MSG.privateLink`, `MSG.hint`, `MSG.failed`, `MSG.retrying`, etc.) provide clear Arabic and English instructions.                                                                                                                                                 | Unit specs: `apps/api/src/modules/telegram/telegram-intake.service.spec.ts` (validates `MSG` dictionary contents).                                                                                                                                                          | 0         | **PASSED** |
| **AC7** | **Settings UI Components**: 'Generate Telegram Link Code' button is present on the settings page at `/en/settings` and on `/en/settings/telegram`; generates link code, displays command, allows copy, and shows active links with unlink action.                                                                                                            | Unit specs: `apps/web/components/settings/telegram-link-manager.spec.tsx` (6 tests), `apps/web/app/[locale]/(dashboard)/settings/settings-telegram.spec.tsx` (3 tests).                                                                                                     | 0         | **PASSED** |
| **AC8** | **Navigation Menu Integration**: 'Telegram Links' option is present in the settings navigation menu on `/en/settings` and in the expandable sidebar navigation.                                                                                                                                                                                              | Unit specs: `apps/web/components/layout/sidebar.spec.tsx` (16 tests), `apps/web/app/[locale]/(dashboard)/settings/settings-telegram.spec.tsx` (3 tests).                                                                                                                    | 0         | **PASSED** |

---

## Verification Report

### AC1, AC2, AC3, AC4, AC5, AC6 — Telegram Backend Suites

Command:

```bash
nice -n 10 pnpm --filter api test -- \
  apps/api/src/modules/telegram/telegram-intake.service.spec.ts \
  apps/api/src/modules/telegram/telegram-link.service.spec.ts \
  apps/api/src/modules/telegram/telegram.client.spec.ts --maxWorkers=2
```

Output:

```text
PASS src/modules/telegram/telegram-link.service.spec.ts
PASS src/modules/telegram/telegram.client.spec.ts
PASS src/modules/telegram/telegram-intake.service.spec.ts

Test Suites: 3 passed, 3 total
Tests:       75 passed, 75 total
Snapshots:   0 total
Time:        4.854 s
```

Exit code: `0`

### AC7 & AC8 — Settings UI and Navigation Suites

Command:

```bash
pnpm --filter web test sidebar.spec.tsx telegram-link-manager.spec.tsx settings-telegram.spec.tsx
```

Output:

```text
PASS app/[locale]/(dashboard)/settings/settings-telegram.spec.tsx
  Settings Telegram UI Integration
    ✓ renders Generate Telegram Link Code button directly on SettingsPage (/en/settings) (69 ms)
    ✓ renders Telegram Links in settings navigation on SettingsPage (14 ms)
    ✓ renders TelegramSettingsPage (/en/settings/telegram) with Telegram Link Manager (9 ms)

PASS components/settings/telegram-link-manager.spec.tsx
  TelegramLinkManager
    ✓ renders the Generate Telegram Link Code button (81 ms)
    ✓ loads and displays active Telegram links (7 ms)
    ✓ generates a one-time link code and displays the /link command (13 ms)
    ✓ copies command to clipboard when Copy Command button is clicked (17 ms)
    ✓ unlinks an active chat after confirmation (12 ms)
    ✓ displays empty state when no links exist (7 ms)

PASS components/layout/sidebar.spec.tsx
  Sidebar
    ✓ renders the app name (21 ms)
    ✓ renders the Dashboard navigation item (6 ms)
    ✓ renders Sales navigation group with correct translation key (5 ms)
    ✓ renders Purchases navigation group (4 ms)
    ✓ renders Accounting navigation group (3 ms)
    ✓ renders AI-related navigation items (3 ms)
    ✓ highlights the active route with primary styling (4 ms)
    ✓ expands a parent section when its child route is active (6 ms)
    ✓ toggles section expansion when clicking a parent item (8 ms)
    ✓ renders the collapse/expand button (4 ms)
    ✓ collapses the sidebar when collapse button is clicked (5 ms)
    ✓ renders a mobile menu trigger button (3 ms)
    ✓ renders Settings navigation item for users with settings permission (3 ms)
    ✓ renders Telegram Links navigation item when on /settings route (3 ms)
    ✓ toggles settings expansion to show Telegram Links when clicked (6 ms)
    ✓ renders Reports navigation item for users with reports permission (3 ms)

Test Suites: 3 passed, 3 total
Tests:       25 passed, 25 total
Snapshots:   0 total
Time:        1.155 s
```

Exit code: `0`

### Type Check & Linters

1. **TypeScript Web Type Check**:

   ```bash
   pnpm --filter web exec tsc --noEmit
   ```

   Exit code: `0`

2. **TypeScript API & E2E Type Check**:

   ```bash
   pnpm --filter api exec tsc --noEmit
   pnpm --filter api exec tsc --noEmit -p test/tsconfig.e2e.json
   ```

   Exit code: `0`

3. **Web ESLint**:
   ```bash
   pnpm --filter web lint
   ```
   Exit code: `0` (clean, zero errors or warnings in changed files)

---

## Bug Fix Regression Demonstrations (Fails on Base, Passes on Head)

### Regression Bug 1: Missing Telegram UI components in settings (Round 5 Finding)

- **Base Behavior**:
  Navigating to `/en/settings` showed the settings categories grid without any Telegram integration components. Neither the 'Generate Telegram Link Code' button nor the 'Telegram Links' navigation link was present in the UI.
- **Base Repro**:
  Running `settings-telegram.spec.tsx` against base failed:
  `TestingLibraryElementError: Unable to find an accessible element with the role "button" and name /Generate Telegram Link Code/i`.
- **Head Fix**:
  1. Added `TelegramLinkManager` component rendering the `'Generate Telegram Link Code'` button directly on `/en/settings` and `/en/settings/telegram`.
  2. Added `<nav aria-label="Settings navigation">` with `'Telegram Links'` link on `/en/settings`.
  3. Added `'Telegram Links'` child item to Settings in `navigationConfig` in `apps/web/components/layout/sidebar.tsx`.
- **Head Result**:
  All 3 tests in `settings-telegram.spec.tsx` and all 6 tests in `telegram-link-manager.spec.tsx` pass cleanly (exit code 0).

### Regression Bug 2: Race condition causing duplicate failure replies (Commit `e2e20835`)

- **Base Behavior**:
  When a delivery reached max attempts, `processDelivery` marked it completed and dispatched `MSG.failed` without verifying `updateMany` return count, potentially causing duplicate failure replies during race conditions.
- **Base Repro**:
  `telegram-intake.service.spec.ts` test `sends no failure reply if another processor completed the exhausted delivery first` failed on base.
- **Head Fix**:
  Added check for `ended.count === 0` after `updateMany`, returning early if another processor completed the delivery.
- **Head Result**:
  Test passes cleanly on head (75/75 passed, exit code 0).

### Regression Bug 3: Rate-limit exception stalling shared poll cursor (Commit `aafb50a4`)

- **Base Behavior**:
  When one linked chat exceeded rate limit, `TelegramRateLimitError` was thrown, halting the shared cursor in `pollOnce` and delaying all tenants by ≥ 60s.
- **Base Repro**:
  `telegram-intake.service.spec.ts` test `does not block another chat or the cursor behind a rate-limited chat` failed on base.
- **Head Fix**:
  Recorded update as durable deferred `TelegramDelivery`, replied with bilingual rate-limit warning once, advanced cursor immediately, and drained deferred updates asynchronously.
- **Head Result**:
  Test passes cleanly on head (exit code 0).

---

## Changed Files Summary

| File                                                                    | Purpose                                                                                                                           |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/components/settings/telegram-link-manager.tsx`                | Telegram link management component with 'Generate Telegram Link Code' button, command copy, active links table, and unlink action |
| `apps/web/components/settings/telegram-link-manager.spec.tsx`           | Unit test suite for TelegramLinkManager (button, generation, copy, unlink, empty states)                                          |
| `apps/web/app/[locale]/(dashboard)/settings/telegram/page.tsx`          | Dedicated `/settings/telegram` page with header and TelegramLinkManager                                                           |
| `apps/web/app/[locale]/(dashboard)/settings/page.tsx`                   | Added Telegram card to settings groups, settings navigation bar, and inline TelegramLinkManager                                   |
| `apps/web/app/[locale]/(dashboard)/settings/settings-telegram.spec.tsx` | Integration tests verifying presence of 'Generate Telegram Link Code' button and 'Telegram Links' navigation                      |
| `apps/web/components/layout/sidebar.tsx`                                | Added 'telegramLinks' child under settings in navigationConfig                                                                    |
| `apps/web/components/layout/sidebar.spec.tsx`                           | Added tests verifying Telegram Links in sidebar navigation                                                                        |
| `apps/web/components/layout/breadcrumbs.tsx`                            | Added 'telegram' breadcrumb label mapping                                                                                         |
| `apps/web/messages/en/navigation.json` & `ar/navigation.json`           | Bilingual navigation labels for Telegram Links                                                                                    |
| `apps/web/messages/en/settings.json` & `ar/settings.json`               | Bilingual settings translations for Telegram integration and link manager                                                         |
| `e2e-army/pr58-telegram-link.e2e.ts`                                    | E2E-army test verifying link code generation at API level                                                                         |
| `docs/evidence/58/EVIDENCE.md`                                          | PR #58 acceptance criteria, verification report, and regression demonstrations                                                    |
