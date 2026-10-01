---
description: Run tests — unit, integration, e2e, coverage, or watch mode
---

// turbo-all

# Run Tests

## Steps

1. Determine which tests to run. If the user doesn't specify, ask or choose based on what files were recently changed.

2. Run the desired test command:

### All Tests (via Turborepo)

```bash
pnpm test
```

### API Unit Tests Only

```bash
pnpm test:api
```

### Web Tests Only

```bash
pnpm test:web
```

### Watch Mode (API — re-runs on file change)

```bash
pnpm test:watch
```

### Coverage Report

```bash
pnpm test:cov
```

### E2E Tests (API)

```bash
pnpm test:e2e
```

Browser E2E is not wired yet (no Playwright dependency or config); it is tracked by the seeded API/browser journey issue in `docs/planning/demo-plan.json`.

### Run Specific Test File

```bash
node apps/api/_run_tests.js --testPathPattern="<pattern>"
cd apps/web && npx jest --testPathPattern="<pattern>"
```

3. Review the test output. If tests fail:
   - Read the error messages
   - Identify the failing test file and line
   - Check if the failure is in test code or source code
   - Fix the issue and re-run
