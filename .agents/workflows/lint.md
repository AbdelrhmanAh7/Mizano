---
description: Run linting, type-checking, and formatting with optional auto-fix
---

// turbo-all

# Lint & Type-Check

## Steps

1. Run ESLint across all workspaces:

```bash
pnpm lint
```

2. To auto-fix lint issues:

```bash
pnpm lint:fix
```

3. Run TypeScript type-checking:

```bash
pnpm type-check
```

4. Check formatting (Prettier):

```bash
pnpm format:check
```

5. Auto-fix formatting:

```bash
pnpm format
```

6. Run lint + type-check together (validate):

```bash
pnpm validate
```

### Lint Specific Workspace

```bash
pnpm --filter api lint
pnpm --filter @mizano/web lint
```

## Zero-Tolerance Rules

- No `any` types
- No `console.log` (use NestJS Logger in backend)
- No unused imports/variables (prefix unused params with `_`)
- All promises must be awaited, `.catch()`ed, or `void`ed
- Always `const`; only `let` when reassignment needed
- Explicit return types on all exported functions
- ES module imports only
