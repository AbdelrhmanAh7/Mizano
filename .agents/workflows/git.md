---
description: Git operations — add, commit (conventional commits), push, branch management
---

// turbo-all

# Git Operations

## Steps

### Check Status

```bash
git status
```

### View Recent Commits

```bash
git log --oneline -10
```

### Stage Changes

```bash
git add .
```

### Stage Specific Files

```bash
git add <file-path>
```

### Commit (Conventional Commits — enforced by commitlint)

Format: `type(scope): description`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

```bash
git commit -m "feat(sales): add invoice PDF export"
```

Examples:

- `feat(accounting): add recurring journal profiles`
- `fix(banking): correct reconciliation confidence calculation`
- `docs(api): update endpoint documentation`
- `refactor(inventory): extract FIFO costing logic`
- `test(hr): add payroll calculation tests`

### Push

```bash
git push
```

**Note:** Pre-push hook runs `pnpm ci:full`. All checks must pass.

### Create Branch

```bash
git checkout -b feature/<branch-name>
```

### View Diff

```bash
git diff --stat
```

## Git Hooks (Husky)

- **pre-commit**: lint-staged (ESLint --fix + Prettier on staged files)
- **pre-push**: `pnpm ci:full` — all checks must pass
