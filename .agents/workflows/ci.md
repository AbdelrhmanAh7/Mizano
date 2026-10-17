---
description: Run the full CI pipeline locally (lint + type-check + test; format and e2e separate)
---

// turbo-all

# Full CI Pipeline

## Steps

This runs the core package checks before pushing. ALL must pass with **zero warnings and zero errors**.

1. Run the CI pipeline script:

```bash
pnpm ci:full
```

This runs: `lint` + `type-check` + `test` (unit tests). Format check and E2E tests are run separately.

2. If you want to run steps individually to debug failures:

### Step 1: Lint

```bash
pnpm lint
```

### Step 2: Type-Check

```bash
pnpm type-check
```

### Step 3: Unit Tests

```bash
pnpm test
```

### Step 4: Format Check

```bash
pnpm format:check
```

### Step 5: E2E Tests

```bash
pnpm test:e2e
```

3. Fix any issues found and re-run until all pass.

## Pre-Push Hook

The project has a `pre-push` git hook that runs `pnpm ci:full` automatically. All checks MUST pass before code can be pushed.
