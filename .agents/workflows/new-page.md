---
description: Scaffold a new Next.js frontend page with hooks, API client, and i18n
---

# Create New Frontend Page

## Steps

1. Ask the user for:
   - **Page name/route** (e.g., `subscriptions`, `reports/cash-flow`)
   - **Module it belongs to** (e.g., `sales`, `accounting`)
   - **Page type**: list page, detail page, form page, or dashboard widget
   - **API endpoints** it needs to connect to

2. Create the page structure:

### For a List Page

```
apps/web/app/[locale]/(dashboard)/{module}/
├── page.tsx              # List page (RSC by default)
├── loading.tsx           # Loading skeleton
├── error.tsx             # Error boundary
├── [id]/
│   ├── page.tsx          # Detail page
│   └── loading.tsx
└── new/
    └── page.tsx          # Create form
```

### For each page, create supporting files:

3. **API Client** — add an entry to `apps/web/lib/api.ts` (axios instance with the session bearer token; NestJS is called directly, there is no BFF proxy). Reuse the CRUD factory:

```typescript
export const {resource}Api = {
  ...crud('/{resource}'), // getAll, getAllCursor, getOne, create, update (PATCH), delete
  approve: (id: string) => api.post(`/{resource}/${id}/approve`),
};
```

Larger self-contained clients may live in `apps/web/lib/api/{module}.ts` and import `api` from `@/lib/api`.

4. **React Query Hooks** — `apps/web/lib/hooks/use-{resource}.ts`, preferably via the factory (toasts and cache invalidation included):

```typescript
export const {
  useList: use{Resource}List,
  useOne: use{Resource},
  useCreate: useCreate{Resource},
  useUpdate: useUpdate{Resource},
  useDelete: useDelete{Resource},
} = createCrudHooks<{Entity}, Create{Entity}Data, Update{Entity}Data>({
  queryKey: ['{resource}'],
  api: {resource}Api,
  entityName: '{Entity}',
});
```

5. **Module Components** — `apps/web/components/{module}/`:
   - `{entity}-table.tsx` — Data table columns + component
   - `{entity}-form.tsx` — Create/edit form with react-hook-form + zod
   - `{entity}-details.tsx` — Detail view component

6. **i18n Translations** — Add keys to:
   - `apps/web/messages/en/{module}.json`
   - `apps/web/messages/ar/{module}.json`
   - Register a new namespace in `apps/web/messages/{en,ar}/index.ts`

7. **Every page MUST handle** (see `docs/DESIGN-SYSTEM.md`):
   - Loading skeleton (`components/ui/page-skeletons.tsx`)
   - Error state (`components/shared/error-state.tsx`)
   - Empty state (`components/shared/empty-state.tsx`)
   - RTL (logical `ms-/me-/ps-/pe-/start-/end-` utilities) and 375px width

8. Verify with lint:

```bash
pnpm --filter @mizano/web lint && pnpm type-check
```
