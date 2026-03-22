---
description: Run tests — unit, integration, e2e, coverage, playwright, or watch mode
---

// turbo-all

# Run Tests

## Steps

1. Determine which tests to run. If the user doesn't specify, ask or choose based on what files were recently changed.

2. Run the desired test command:

### All Tests (via Turborepo)

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm test
```

### API Unit Tests Only

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm test:api
```

### Web Tests Only

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm test:web
```

### Watch Mode (API — re-runs on file change)

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm test:watch
```

### Coverage Report

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm test:cov
```

### E2E Tests (API)

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm test:e2e
```

### Playwright (Browser E2E)

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm test:playwright
```

### Regression Tests

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm test:regression
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm test:regression:web
```

### Run Specific Test File

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm --filter api exec jest --testPathPattern="<pattern>"
```

3. Review the test output. If tests fail:
   - Read the error messages
   - Identify the failing test file and line
   - Check if the failure is in test code or source code
   - Fix the issue and re-run
