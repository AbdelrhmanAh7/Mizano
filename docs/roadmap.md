# Mizano ERP - Product Roadmap

> **Vision**: Become the #1 AI-powered ERP platform for SMBs globally — delivering autonomous accounting, zero-touch operations, and intelligent decision-making that eliminates the need for accounting expertise.

---

## Table of Contents

1. [Strategic Vision](#strategic-vision)
2. [Competitive Advantages](#competitive-advantages)
3. [Phase 1: Foundation Hardening (Q2 2026)](#phase-1-foundation-hardening-q2-2026)
4. [Phase 2: Quality & Reliability (Q3 2026)](#phase-2-quality--reliability-q3-2026)
5. [Phase 3: Market Differentiation (Q4 2026)](#phase-3-market-differentiation-q4-2026)
6. [Phase 4: Scale & Growth (Q1-Q2 2027)](#phase-4-scale--growth-q1-q2-2027)
7. [Phase 5: Market Leadership (Q3-Q4 2027)](#phase-5-market-leadership-q3-q4-2027)
8. [Testing & Quality Strategy](#testing--quality-strategy)
9. [Technical Debt Paydown](#technical-debt-paydown)
10. [Success Metrics](#success-metrics)

---

## Strategic Vision

### The Problem

Traditional ERP systems require accounting expertise, manual data entry, and expensive consultants. SMBs spend 15-20 hours/week on bookkeeping and financial management. Existing solutions (QuickBooks, Xero, Zoho Books) automate workflows but still require human knowledge of accounting principles.

### Mizano's Answer

**Zero-Touch Accounting** — AI handles 95% of routine financial work:

- Transactions auto-categorize with >90% accuracy
- Bank reconciliation matches automatically
- Invoices and bills are extracted from documents via OCR
- Anomalies and fraud are detected in real-time
- Cash flow forecasts update continuously
- Financial reports generate and narrate themselves

### Target Market

| Segment               | Size       | Pain Point                                    | Mizano Solution                      |
| --------------------- | ---------- | --------------------------------------------- | ------------------------------------ |
| SMBs (1-50 employees) | Primary    | No dedicated accountant, manual processes     | Full automation, AI assistant        |
| Mid-market (50-500)   | Secondary  | Expensive ERP implementations, slow reporting | Affordable AI-native ERP             |
| Accounting Firms      | Channel    | Managing multiple client books                | Multi-tenant with AI insights        |
| MENA Region           | Geographic | Arabic-first, VAT compliance, dual-language   | Native Arabic + English, ZATCA-ready |

### Competitive Moat

| Differentiator           | Mizano    | QuickBooks         | Xero               | Zoho Books         | SAP B1  |
| ------------------------ | --------- | ------------------ | ------------------ | ------------------ | ------- |
| AI Models (local)        | 33 models | Cloud AI (limited) | Cloud AI (limited) | Cloud AI (limited) | None    |
| Zero External API Deps   | Yes       | No                 | No                 | No                 | No      |
| Arabic-First             | Yes       | Partial            | Partial            | Partial            | Partial |
| Open Source              | Planned   | No                 | No                 | No                 | No      |
| Manufacturing + Projects | Yes       | No                 | No                 | Limited            | Yes     |
| OCR + VLM Pipeline       | Yes       | Basic              | Basic              | Basic              | No      |
| Per-Org AI Training      | Yes       | No                 | No                 | No                 | No      |
| Human-in-the-Loop AI     | Yes       | No                 | No                 | No                 | No      |

---

## Competitive Advantages

### 1. AI-Native Architecture

Unlike competitors who bolt AI onto existing systems, Mizano was built AI-first. Every module feeds data into the AI engine, and every AI prediction flows back to users with confidence scores and dismissible suggestions.

### 2. Privacy-First AI

All 33 AI models run 100% locally — no data leaves the server. No OpenAI, no cloud ML APIs. This is a major selling point for regulated industries, government contracts, and privacy-conscious businesses.

### 3. Full-Stack ERP

Single platform covering Accounting, Sales, Purchases, Inventory, Banking, HR, Manufacturing, Projects, Tax, CRM, and Assets. Competitors typically require add-ons or third-party integrations.

### 4. MENA-Ready

Native Arabic support with RTL layouts, ZATCA e-invoicing readiness, VAT compliance, and region-specific financial reporting.

### 5. Developer-Friendly

Modern tech stack (Next.js, NestJS, PostgreSQL, TypeScript), monorepo architecture, comprehensive API documentation, and clean code patterns.

---

## Phase 1: Foundation Hardening (Q2 2026)

**Goal**: Production-grade stability and comprehensive test coverage.

### 1.1 Automation Testing Infrastructure

- [ ] Set up CI/CD pipeline with GitHub Actions
  - Lint + type-check on every PR
  - Unit tests with coverage gates (minimum 70%)
  - E2E tests against test database
  - Build verification for all environments
- [ ] Configure test database provisioning for CI
- [ ] Add Playwright for frontend E2E testing
- [ ] Set up visual regression testing with Chromatic or Percy
- [ ] Implement API contract testing with Pact or similar

### 1.2 Backend Test Coverage Expansion

- [ ] Increase unit test coverage from ~25 suites to 60+ suites
  - Add tests for all remaining services (inventory, banking, HR, tax, CRM, manufacturing, projects, assets)
  - Add controller tests for input validation
  - Add DTO validation tests
- [ ] Add integration tests for critical flows:
  - Invoice lifecycle (create -> send -> pay -> close)
  - Payroll run (calculate -> approve -> journal entries)
  - Bank reconciliation (import -> match -> confirm)
  - Work order completion (material consumption -> finished goods)
- [ ] Add regression test suite for fixed bugs

### 1.3 Frontend Test Coverage

- [ ] Set up Jest + React Testing Library for component tests
- [ ] Add tests for critical form components (invoice, bill, journal entry)
- [ ] Add hook tests for TanStack Query hooks
- [ ] Set up Playwright E2E tests for critical user flows:
  - Login -> Dashboard -> Create Invoice -> Send
  - Bank Import -> Review -> Reconcile
  - AI Insights -> View Detail -> Accept/Dismiss
- [ ] Visual regression tests for key pages (dashboard, reports, forms)

### 1.4 Performance & Security

- [ ] Load testing with k6 or Artillery (target: 100 concurrent users)
- [ ] Security audit: OWASP Top 10 verification
- [ ] Dependency vulnerability scanning (Snyk or Dependabot)
- [ ] Rate limiting hardening on all endpoints

---

## Phase 2: Quality & Reliability (Q3 2026)

**Goal**: Enterprise-grade reliability with automated regression prevention.

### 2.1 Regression Testing Framework

- [ ] Automated regression suite covering all 150+ pages
- [ ] API regression tests for all 206+ AI endpoints
- [ ] Database migration regression tests
- [ ] Cross-browser testing (Chrome, Firefox, Safari, Edge)
- [ ] Mobile responsiveness regression (375px, 768px, 1024px, 1440px)
- [ ] RTL layout regression for Arabic locale
- [ ] Performance regression (track response times across releases)

### 2.2 Monitoring & Observability

- [ ] Integrate Sentry for error tracking (API + Web)
- [ ] Structured logging with correlation IDs
- [ ] APM (Application Performance Monitoring) with Datadog or Grafana
- [ ] Real-time alerting for error rate spikes
- [ ] AI model accuracy monitoring dashboard
- [ ] Uptime monitoring with 99.9% SLA target

### 2.3 Data Integrity

- [ ] Add database constraints for business rules (CHECK constraints)
- [ ] Implement idempotency keys for payment endpoints
- [ ] Add optimistic locking for concurrent edits
- [ ] Automated data consistency checks (scheduled job)
- [ ] Backup verification automation (monthly restore tests)

### 2.4 Developer Experience

- [ ] API documentation with Swagger UI (auto-generated)
- [ ] Storybook for UI component library
- [ ] Development environment setup automation (single command)
- [ ] Contributing guide and PR templates
- [ ] Architecture Decision Records (ADRs)

---

## Phase 3: Market Differentiation (Q4 2026)

**Goal**: Features that set Mizano apart from every competitor.

### 3.1 AI Copilot

- [ ] Natural language interface for all operations
  - "Create an invoice for TechCorp for $5,000 due in 30 days"
  - "Show me expenses over $1,000 last quarter"
  - "What's my cash position going to look like in 3 months?"
- [ ] AI-powered onboarding wizard
  - Auto-detect business type from uploaded documents
  - Auto-configure chart of accounts
  - Import and categorize historical data
- [ ] Proactive AI suggestions
  - "You have 3 overdue invoices totaling $12,000 — send reminders?"
  - "Unusual expense detected: $5,000 office supplies (3x normal)"
  - "Cash flow dips below $10,000 in 2 weeks — delay vendor payments?"

### 3.2 E-Invoicing & Compliance

- [ ] ZATCA Phase 2 compliance (Saudi Arabia)
- [ ] Egypt e-invoicing (ETA) integration
- [ ] UAE FTA VAT compliance
- [ ] EU e-invoicing (Peppol) support
- [ ] Multi-country tax engine
- [ ] Automated regulatory reporting

### 3.3 Advanced Integrations

- [ ] Banking API integrations (Plaid, Lean, Tamatem)
- [ ] Payment gateway integrations (Stripe, PayTabs, Fawry)
- [ ] E-commerce connectors (Shopify, WooCommerce, Salla)
- [ ] Shipping integrations (Aramex, SMSA, DHL)
- [ ] WhatsApp Business API for invoice delivery
- [ ] Zapier/Make.com integration for workflow automation

### 3.4 Mobile Application

- [ ] React Native mobile app (iOS + Android)
- [ ] Core features: dashboard, invoicing, expense capture
- [ ] Camera-based receipt/invoice scanning with on-device OCR
- [ ] Push notifications for approvals and alerts
- [ ] Offline mode with sync

---

## Phase 4: Scale & Growth (Q1-Q2 2027)

**Goal**: Scale to 10,000+ organizations with enterprise features.

### 4.1 Multi-Entity & Consolidation

- [ ] Multi-company support (parent/subsidiary relationships)
- [ ] Consolidated financial reporting across entities
- [ ] Inter-company transactions and eliminations
- [ ] Multi-currency consolidation with translation adjustments

### 4.2 Advanced Manufacturing

- [ ] MRP (Material Requirements Planning)
- [ ] Production scheduling with Gantt charts
- [ ] Quality control checkpoints
- [ ] Shop floor data collection
- [ ] Batch/lot tracking with traceability

### 4.3 Advanced HR

- [ ] Employee self-service portal
- [ ] Leave management with approval workflows
- [ ] Performance review system with 360-degree feedback
- [ ] Training and certification tracking
- [ ] Recruitment pipeline

### 4.4 Marketplace & Extensibility

- [ ] Plugin/extension marketplace
- [ ] Custom field builder (no-code)
- [ ] Custom report builder (drag-and-drop)
- [ ] Workflow automation builder (visual)
- [ ] Third-party app ecosystem

### 4.5 Infrastructure Scale

- [ ] Kubernetes deployment manifests
- [ ] Horizontal auto-scaling
- [ ] Multi-region deployment
- [ ] Database sharding strategy for large tenants
- [ ] CDN for static assets and document storage
- [ ] Object storage (S3/GCS) for documents and attachments

---

## Phase 5: Market Leadership (Q3-Q4 2027)

**Goal**: Establish Mizano as the undisputed #1 AI-powered ERP for SMBs.

### 5.1 AI Leadership

- [ ] LLM integration for advanced NLP (self-hosted Llama/Mistral)
- [ ] AI-powered financial advisory ("Your profit margin dropped 5% — here's why and what to do")
- [ ] Predictive business planning with scenario modeling
- [ ] Automated financial statement preparation (audit-ready)
- [ ] AI-generated board reports and investor updates
- [ ] Cross-tenant anonymized benchmarking ("Your AR days are 15% above industry average")

### 5.2 Open Source & Community

- [ ] Open-source community edition (core modules)
- [ ] Commercial enterprise edition (AI features, advanced modules)
- [ ] Developer documentation portal
- [ ] Community forum and knowledge base
- [ ] Contribution guidelines and governance

### 5.3 Enterprise Features

- [ ] SSO (SAML 2.0, OIDC)
- [ ] Advanced audit compliance (SOC 2, ISO 27001)
- [ ] Custom approval workflows (n-level)
- [ ] Role hierarchy with field-level permissions
- [ ] Data retention policies and GDPR compliance
- [ ] SLA-backed uptime guarantees

### 5.4 Global Expansion

- [ ] Additional languages: French, Spanish, Turkish, Urdu, Hindi
- [ ] Country-specific localizations (tax, compliance, chart of accounts)
- [ ] Regional data residency options
- [ ] Local payment method integrations per market
- [ ] Partner/reseller program

---

## Testing & Quality Strategy

### Testing Pyramid

```
                    /  Visual Regression  \         <- Chromatic/Percy snapshots
                   /  Frontend E2E (Playwright) \    <- 20+ critical user journeys
                  /  API E2E (supertest)          \   <- 8+ suites, full request lifecycle
                 /  Integration Tests              \  <- Service + database interaction
                /  Unit Tests (Jest)                 \ <- 100+ suites, pure logic + mocks
               /____________________________________\
```

### Automation Testing

| Test Type          | Tool                  | Scope                          | Trigger               | Target Coverage      |
| ------------------ | --------------------- | ------------------------------ | --------------------- | -------------------- |
| Unit Tests         | Jest + ts-jest        | Services, guards, utils, pipes | Every PR              | 80%+                 |
| API E2E            | Jest + supertest      | Full API endpoint flows        | Every PR              | All critical paths   |
| Frontend Component | Jest + RTL            | React components + hooks       | Every PR              | 70%+                 |
| Frontend E2E       | Playwright            | User journeys across pages     | Nightly + pre-release | 20+ journeys         |
| Visual Regression  | Chromatic/Percy       | UI snapshots for key pages     | Every PR              | 50+ snapshots        |
| Performance        | k6 / Artillery        | Load + stress testing          | Weekly + pre-release  | 100 concurrent users |
| Security           | OWASP ZAP + Snyk      | Vulnerability scanning         | Weekly                | Zero critical/high   |
| API Contract       | Pact                  | API compatibility              | Every PR              | All public endpoints |
| Accessibility      | axe-core + Playwright | WCAG 2.1 AA compliance         | Every PR              | All pages            |

### Regression Testing

Regression tests prevent previously fixed bugs from reappearing. Every bug fix MUST include a regression test.

#### API Regression Suite

```
apps/api/test/regression/
  auth/
    duplicate-email-case-insensitive.e2e-spec.ts     # Bug #001
    refresh-token-reuse.e2e-spec.ts                   # Bug #002
  accounting/
    unbalanced-journal-decimal-rounding.e2e-spec.ts   # Bug #003
    lock-date-timezone-edge-case.e2e-spec.ts          # Bug #004
  sales/
    invoice-overpayment-status.e2e-spec.ts            # Bug #005
    credit-note-exceeds-invoice.e2e-spec.ts           # Bug #006
  multi-tenancy/
    cross-org-data-leak.e2e-spec.ts                   # Bug #007
  ai/
    low-confidence-auto-categorization.e2e-spec.ts    # Bug #008
```

#### Frontend Regression Suite

```
apps/web/__tests__/regression/
  forms/
    invoice-decimal-input.test.tsx       # Decimal precision in money fields
    journal-line-add-remove.test.tsx     # Dynamic form rows
  navigation/
    sidebar-collapse-state.test.tsx      # Sidebar state persistence
    locale-switch-data-loss.test.tsx     # No data loss on language switch
  dashboard/
    empty-state-rendering.test.tsx       # Graceful empty states
    loading-skeleton-layout.test.tsx     # No layout shift during load
```

#### Regression Test Policy

1. **Every bug fix includes a test**: Before fixing a bug, write a failing test that reproduces it. The fix makes the test pass.
2. **Regression suite runs on every PR**: CI blocks merge if any regression test fails.
3. **Monthly regression review**: Team reviews the regression suite, removes obsolete tests, adds tests for new risk areas.
4. **Priority tagging**: `@critical`, `@high`, `@medium` — critical regressions block deployment.

### CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  pull_request:
    branches: [master, develop]
  push:
    branches: [master]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm type-check

  unit-tests:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:generate
      - run: pnpm test:api -- --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: apps/api/coverage/

  e2e-tests:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: mizano_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/mizano_test
      REDIS_URL: redis://localhost:6379
      JWT_SECRET: test-jwt-secret
      JWT_REFRESH_SECRET: test-refresh-secret
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:generate
      - run: pnpm --filter api exec prisma migrate deploy
      - run: pnpm test:e2e

  frontend-tests:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:web

  playwright-e2e:
    runs-on: ubuntu-latest
    needs: [unit-tests, e2e-tests, frontend-tests]
    if: github.ref == 'refs/heads/master'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: npx playwright install --with-deps
      - run: pnpm test:playwright

  security-scan:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    steps:
      - uses: actions/checkout@v4
      - name: Run Snyk security scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

### Test Commands

```bash
# Unit tests
pnpm test                    # Run all unit tests
pnpm test:api                # API unit tests only
pnpm test:web                # Frontend tests only
pnpm test:watch              # Watch mode
pnpm test:cov                # Coverage report

# E2E tests
pnpm test:e2e                # API E2E (requires database)
pnpm test:playwright         # Frontend E2E (requires running app)

# Regression tests
pnpm test:regression         # Run regression suite only
pnpm test:regression:api     # API regression tests
pnpm test:regression:web     # Frontend regression tests

# Full CI suite
pnpm ci                      # lint + type-check + test
pnpm ci:full                 # lint + type-check + test + e2e + playwright
```

---

## Technical Debt Paydown

### Short-Term (Q2 2026)

| Item                                                  | Priority | Status      |
| ----------------------------------------------------- | -------- | ----------- |
| Eliminate remaining ~62 `any` types in API services   | High     | In Progress |
| Create typed DTOs for remaining services              | High     | In Progress |
| Generic resource-list-page component                  | Medium   | Not Started |
| Fix pre-existing TypeScript errors in form components | Medium   | Not Started |
| Standardize error handling across all services        | Medium   | Not Started |

### Medium-Term (Q3-Q4 2026)

| Item                                                   | Priority | Status      |
| ------------------------------------------------------ | -------- | ----------- |
| Migrate from class-validator to Zod for API validation | Medium   | Not Started |
| Add request/response serialization interceptors        | Medium   | Not Started |
| Implement API versioning (v1/v2)                       | Low      | Not Started |
| Database query optimization audit                      | Medium   | Not Started |
| Reduce bundle size (tree-shaking audit)                | Medium   | Not Started |

### Long-Term (2027)

| Item                                                   | Priority | Status      |
| ------------------------------------------------------ | -------- | ----------- |
| Event-driven architecture (CQRS for reporting)         | Low      | Not Started |
| GraphQL API layer (alongside REST)                     | Low      | Not Started |
| WebSocket real-time updates                            | Medium   | Not Started |
| Database migration to TimescaleDB for time-series data | Low      | Not Started |

---

## Success Metrics

### Product Metrics

| Metric                  | Current | Q4 2026 Target | Q4 2027 Target |
| ----------------------- | ------- | -------------- | -------------- |
| Active Organizations    | -       | 100            | 5,000          |
| Monthly Active Users    | -       | 500            | 25,000         |
| AI Prediction Accuracy  | ~75%    | 90%            | 95%            |
| User Satisfaction (NPS) | -       | 40+            | 60+            |
| Feature Completeness    | 70%     | 90%            | 100%           |

### Engineering Metrics

| Metric                   | Current  | Q4 2026 Target | Q4 2027 Target |
| ------------------------ | -------- | -------------- | -------------- |
| Unit Test Coverage       | ~30%     | 80%            | 90%            |
| E2E Test Coverage (API)  | 8 suites | 20 suites      | 30 suites      |
| E2E Test Coverage (UI)   | 0        | 20 journeys    | 50 journeys    |
| CI Pipeline Duration     | -        | < 10 min       | < 8 min        |
| Deployment Frequency     | Manual   | Weekly         | Daily          |
| Mean Time to Recovery    | -        | < 1 hour       | < 30 min       |
| Zero-Day Vulnerabilities | -        | 0              | 0              |
| API Response Time (P95)  | -        | < 500ms        | < 200ms        |
| Uptime SLA               | -        | 99.5%          | 99.9%          |

### Business Metrics

| Metric                     | Q4 2026 Target | Q4 2027 Target |
| -------------------------- | -------------- | -------------- |
| Monthly Recurring Revenue  | $10K           | $200K          |
| Customer Acquisition Cost  | -              | < $100         |
| Customer Lifetime Value    | -              | > $2,000       |
| Churn Rate (Monthly)       | -              | < 3%           |
| Time to Value (onboarding) | < 1 hour       | < 15 min       |

---

## Contributing to the Roadmap

This roadmap is a living document. To propose changes:

1. Open an issue with the `roadmap` label
2. Describe the feature/change and its business impact
3. Reference any related technical requirements
4. The team reviews proposals in monthly planning sessions
