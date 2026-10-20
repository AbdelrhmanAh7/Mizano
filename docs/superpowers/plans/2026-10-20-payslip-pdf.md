# Payslip PDF Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide deterministic, CPU-only Arabic and English payslip PDF generation from Mizano payroll data with multi-tenant isolation, precise decimal formatting, single-page enforcement, and web UI download capabilities.

**Architecture:** Pure CPU-only rendering using `pdfkit` (0.15.0) and `bidi-js` (1.1.0) with embedded `Amiri-Regular.ttf` font, exposed via NestJS endpoint `GET /payslips/:id/pdf` with `hr.view` permission, integrated into Next.js dashboard `/hr/payslips/[id]`.

**Tech Stack:** NestJS, Prisma, pdfkit, bidi-js, Next.js, React, Tailwind CSS, Jest.

**Spec:** GitHub issue #256 / #115, replacing PR #118.

## Global Constraints

- Authenticate every resource read/write; scope queries to the current authorized organization (no cross-tenant leakage).
- Use Decimal arithmetic and decimal string transport; preserve exact stored decimal strings (up to 4 places) without float conversion.
- Synchronous, CPU-only execution capped strictly at 1 page for arm64 / Raspberry Pi 5 without external API, GPU, or model dependencies.
- Deterministic PDF generation: identical input produces byte-identical PDF output.
- Support `lang=ar` (default) and `lang=en`; unsupported `lang` returns 400 Bad Request.
- Missing required fields returns 422 with sanitized reason containing no raw values.
- Thrown render errors log only exception type name, never raw messages or payslip payloads.

## Review Focus

- Multi-tenant boundary: cross-tenant payslip ID access must return 404, never 403 or data leakage.
- Number and currency formatting: decimal string precision must not degrade to JavaScript float rounding (e.g. `12345.60` not `12345.6`).
- Bidi & Arabic shaping: Arabic glyphs must be shaped and RTL runs ordered correctly; numeric amounts remain LTR.
- Single-page overflow: excessive line items must be capped and rolled into an "Other" line item so PDF is strictly 1 page.
- Safe error handling: exceptions must never log sensitive salary or employee details.

---

### Task 1: Natural-Language E2E-Army Test (E2E-First Gate)

**Files:**

- Create: `e2e-army/256-payslip-pdf.e2e.ts`

**Interfaces:**

- Consumes: `@e2e-dev/web`, `e2e`
- Produces: e2e-army test scenarios tagged `feat:mz-payroll` and `lvl:ui` covering AC1, AC2, AC5, AC6

- [ ] **Step 1: Write the e2e-army test file**
- [ ] **Step 2: Commit e2e-army test as the first commit on branch ai/256**

```bash
git add e2e-army/256-payslip-pdf.e2e.ts
git commit -m "test(e2e-army): add payslip pdf natural-language scenarios (@issue-256)"
```

---

### Task 2: Pinned Assets, Nest Build Config, and Dependencies

**Files:**

- Create: `apps/api/assets/fonts/Amiri-Regular.ttf`
- Create: `apps/api/assets/fonts/OFL.txt`
- Modify: `apps/api/nest-cli.json`
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces: Amiri font files in `apps/api/assets/fonts/`, `nest-cli.json` asset copy rule, dependencies `pdfkit`, `bidi-js`, `@types/pdfkit`

- [ ] **Step 1: Copy font assets and configure `nest-cli.json`**
- [ ] **Step 2: Add `pdfkit`, `bidi-js`, `@types/pdfkit` to `apps/api/package.json` and sync lockfile**
- [ ] **Step 3: Run type-check to verify dependencies resolve**
- [ ] **Step 4: Commit assets and dependencies**

---

### Task 3: PayslipPdfService Implementation (TDD)

**Files:**

- Create: `apps/api/src/modules/hr/services/payslip-pdf.service.spec.ts`
- Create: `apps/api/src/modules/hr/services/payslip-pdf.service.ts`

**Interfaces:**

- Consumes: `PrismaService`, `pdfkit`, `bidi-js`
- Produces: `PayslipPdfService.generatePayslipPdf(orgId: string, payslipId: string, lang?: string): Promise<Buffer>`
- Produces: `renderPayslipPdf(data: PayslipPdfData, lang: 'ar' | 'en'): Promise<Buffer>`

- [ ] **Step 1: Write unit tests in `payslip-pdf.service.spec.ts`**
- [ ] **Step 2: Run unit test to verify failure (red)**
- [ ] **Step 3: Implement `payslip-pdf.service.ts` with font lookup, bidi runs, formatting, and DB query**
- [ ] **Step 4: Run unit tests to verify pass (green)**
- [ ] **Step 5: Commit `PayslipPdfService` and tests**

---

### Task 4: PayslipsController and HR Module Integration

**Files:**

- Create: `apps/api/src/modules/hr/controllers/payslips.controller.spec.ts`
- Create: `apps/api/src/modules/hr/controllers/payslips.controller.ts`
- Modify: `apps/api/src/modules/hr/hr.module.ts`

**Interfaces:**

- Consumes: `PayslipPdfService`
- Produces: `GET /payslips/:id/pdf` with `hr.view` permission, `application/pdf` stream, `Cache-Control: private, no-store`

- [ ] **Step 1: Write controller unit tests in `payslips.controller.spec.ts`**
- [ ] **Step 2: Implement `payslips.controller.ts` and register in `hr.module.ts`**
- [ ] **Step 3: Run unit tests to verify pass (green)**
- [ ] **Step 4: Commit `PayslipsController` and module registration**

---

### Task 5: API E2E Acceptance Suite

**Files:**

- Create: `apps/api/test/payslip-pdf.e2e-spec.ts`

**Interfaces:**

- Consumes: Nest testing module, PrismaService, Supertest
- Produces: End-to-end HTTP tests covering AC1-AC7

- [ ] **Step 1: Add `apps/api/test/payslip-pdf.e2e-spec.ts`**
- [ ] **Step 2: Commit API e2e test suite**

---

### Task 6: Prisma Seed with Stable Payslip IDs

**Files:**

- Modify: `apps/api/prisma/seed.ts`

**Interfaces:**

- Produces: Stable payslips: `test-id`, `valid-payslip-id`, `zero-pay-id`, `decimal-test-payslip-id`

- [ ] **Step 1: Update `apps/api/prisma/seed.ts`**
- [ ] **Step 2: Verify lint and types for seed script**
- [ ] **Step 3: Commit seed enhancements**

---

### Task 7: Web UI Download Button and API Hook

**Files:**

- Modify: `apps/web/lib/hooks/use-documents.ts`
- Create: `apps/web/lib/hooks/use-documents.spec.ts`
- Modify: `apps/web/app/[locale]/(dashboard)/hr/payslips/[id]/page.tsx`

**Interfaces:**

- Produces: `documentsApi.getPayslipPdf`, `usePayslipPdf`, and interactive Download PDF button with `data-testid="download-pdf-button"`

- [ ] **Step 1: Update `use-documents.ts` and add unit test `use-documents.spec.ts`**
- [ ] **Step 2: Connect button in `apps/web/app/[locale]/(dashboard)/hr/payslips/[id]/page.tsx`**
- [ ] **Step 3: Run web unit tests, type-check, and lint**
- [ ] **Step 4: Commit web changes**

---

### Task 8: Verification Evidence & Final Audit

**Files:**

- Create: `docs/evidence/256/EVIDENCE.md`
- Modify: `EVIDENCE.md` (append section only, preserve existing file)

**Interfaces:**

- Produces: Complete verification report mapping AC1-AC9 with exact commands, exit codes, and test outputs

- [ ] **Step 1: Run all changed tests, linters, and type-checks**
- [ ] **Step 2: Verify `scripts/test_no_conflict_markers.py` passes**
- [ ] **Step 3: Document exact test runs and results in `docs/evidence/256/EVIDENCE.md` and append to `EVIDENCE.md`**
- [ ] **Step 4: Commit evidence**
