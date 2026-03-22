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

3. **API Client** — `apps/web/lib/api/{module}.ts`:

```typescript
import { fetchApi } from '../fetch';
export const {module}Api = {
  list: (params?: ListParams) => fetchApi<PaginatedResponse<{Entity}>>('/{resource}', { params }),
  getById: (id: string) => fetchApi<{Entity}>(`/{resource}/${id}`),
  create: (data: Create{Entity}Dto) => fetchApi<{Entity}>('/{resource}', { method: 'POST', body: data }),
  update: (id: string, data: Update{Entity}Dto) => fetchApi<{Entity}>(`/{resource}/${id}`, { method: 'PATCH', body: data }),
  delete: (id: string) => fetchApi<void>(`/{resource}/${id}`, { method: 'DELETE' }),
};
```

4. **React Query Hooks** — `apps/web/lib/hooks/use-{resource}.ts`:

```typescript
export function use{Resource}(params?: ListParams) {
  return useQuery({ queryKey: ['{resource}', params], queryFn: () => {resource}Api.list(params) });
}
export function useCreate{Resource}() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: {resource}Api.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['{resource}'] }),
  });
}
```

5. **Module Components** — `apps/web/components/{module}/`:
   - `{entity}-table.tsx` — Data table columns + component
   - `{entity}-form.tsx` — Create/edit form with react-hook-form + zod
   - `{entity}-details.tsx` — Detail view component

6. **i18n Translations** — Add keys to:
   - `apps/web/messages/en/{module}.json`
   - `apps/web/messages/ar/{module}.json`

7. **Every page MUST handle**:
   - Loading skeleton
   - Error state
   - Empty state

8. Verify with lint:

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm --filter @mizano/web lint && pnpm type-check
```
