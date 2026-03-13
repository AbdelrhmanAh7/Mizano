---
description: Run the full CI pipeline locally (lint + type-check + test + format + e2e)
---

// turbo-all

# Full CI Pipeline

## Steps

This runs the same checks as the GitHub CI workflow. ALL must pass with **zero warnings and zero errors**.

1. Run the full CI pipeline:

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm ci:full
```

This runs sequentially: `lint` → `type-check` → `test` → `format` → `test:e2e`

2. If you want to run steps individually to debug failures:

### Step 1: Lint

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm lint
```

### Step 2: Type-Check

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm type-check
```

### Step 3: Unit Tests

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm test
```

### Step 4: Format Check

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm format:check
```

### Step 5: E2E Tests

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm test:e2e
```

3. Fix any issues found and re-run until all pass.

## Pre-Push Hook

The project has a `pre-push` git hook that runs `pnpm ci:full` automatically. All checks MUST pass before code can be pushed.
