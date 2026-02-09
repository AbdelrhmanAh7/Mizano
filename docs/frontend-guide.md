# Mizano ERP - Frontend Guide

This guide documents the conventions, patterns, and architecture used in the Mizano Next.js frontend (`apps/web/`).

---

## Table of Contents

1. [App Router Structure](#app-router-structure)
2. [Route Groups and Layouts](#route-groups-and-layouts)
3. [Internationalization (i18n)](#internationalization-i18n)
4. [Server Components vs Client Components](#server-components-vs-client-components)
5. [TanStack Query Hooks](#tanstack-query-hooks)
6. [API Client Pattern](#api-client-pattern)
7. [Form Pattern](#form-pattern)
8. [Component Structure](#component-structure)
9. [State Management](#state-management)
10. [Page States](#page-states)
11. [Navigation](#navigation)
12. [Toast Notifications](#toast-notifications)
13. [Responsive Design](#responsive-design)
14. [Icons](#icons)

---

## App Router Structure

The frontend uses Next.js 14 App Router with a `[locale]` dynamic segment for i18n and route groups for layout separation:

```
apps/web/app/
  layout.tsx                              # Root layout (html, body tags)
  [locale]/
    layout.tsx                            # Locale layout (NextIntlClientProvider, Providers)
    (auth)/
      layout.tsx                          # Auth layout (minimal wrapper)
      login/page.tsx
      register/page.tsx
    (dashboard)/
      layout.tsx                          # Dashboard layout (Sidebar + Header)
      dashboard/page.tsx                  # Home dashboard
      sales/
        page.tsx                          # Sales overview
        customers/
          page.tsx                        # List
          new/page.tsx                    # Create
          [id]/page.tsx                   # Detail
          [id]/edit/page.tsx              # Edit
        invoices/
          page.tsx                        # List
          new/page.tsx                    # Create
          [id]/page.tsx                   # Detail
          [id]/edit/page.tsx              # Edit
        quotes/...
        credit-notes/...
        payments/...
      purchases/
        vendors/...
        expenses/...
        bills/...
        payments/...
        credits/...
      accounting/
        accounts/page.tsx
        journals/...
        recurring/...
      inventory/
        items/...
        warehouses/...
        adjustments/...
        transfers/...
      banking/
        accounts/...
        reconcile/...
        rules/...
      projects/...
      manufacturing/...
      hr/...
      tax/...
      crm/...
      reports/...
      ai-insights/...
      settings/...
```

Each domain resource follows a consistent URL pattern:
- `/{module}/{resource}` -- list page
- `/{module}/{resource}/new` -- create page
- `/{module}/{resource}/[id]` -- detail page
- `/{module}/{resource}/[id]/edit` -- edit page

---

## Route Groups and Layouts

### (auth) Group

Used for unauthenticated pages (login, register). The layout is a minimal passthrough:

```typescript
// app/[locale]/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

### (dashboard) Group

Used for all authenticated pages. The layout provides the sidebar, header, and session protection:

```typescript
// app/[locale]/(dashboard)/layout.tsx
'use client';

import { useSession } from 'next-auth/react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { TourProvider } from '@/components/tour/tour-provider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession({
    required: true,
    onUnauthenticated() {
      // Middleware handles the actual redirect
    },
  });

  // Loading state while checking authentication
  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <TourProvider>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden lg:ml-0 ml-0">
          <Header />
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </TourProvider>
  );
}
```

### [locale] Layout

Wraps the entire app with i18n providers and the global providers (session, React Query, toaster):

```typescript
// app/[locale]/layout.tsx
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales, localeDirections, type Locale } from '@/i18n/config';
import { Providers } from '@/components/providers';

export default async function LocaleLayout({
  children,
  params,
}: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  const messages = await getMessages();
  const direction = localeDirections[locale as Locale];

  return (
    <div lang={locale} dir={direction} className="font-sans antialiased">
      <NextIntlClientProvider messages={messages}>
        <Providers>{children}</Providers>
      </NextIntlClientProvider>
    </div>
  );
}
```

---

## Internationalization (i18n)

Mizano uses `next-intl` for internationalization with two supported locales:

```typescript
// i18n/config.ts
export const locales = ['en', 'ar'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
};

export const localeDirections: Record<Locale, 'ltr' | 'rtl'> = {
  en: 'ltr',
  ar: 'rtl',
};
```

### Using translations in components

```typescript
'use client';

import { useTranslations, useLocale } from 'next-intl';
import { localeDirections, type Locale } from '@/i18n/config';

export function MyComponent() {
  const t = useTranslations('navigation');
  const locale = useLocale();
  const direction = localeDirections[locale as Locale];
  const isRtl = direction === 'rtl';

  return (
    <div dir={direction}>
      <h1>{t('dashboard')}</h1>
      <p>{t('sales.title')}</p>
    </div>
  );
}
```

### Translation files

Translation messages are stored in JSON files under `messages/`:

```
messages/
  en.json
  ar.json
```

Structure example:
```json
{
  "common": {
    "appName": "Mizano"
  },
  "navigation": {
    "dashboard": "Dashboard",
    "sales": {
      "title": "Sales",
      "customers": "Customers",
      "invoices": "Invoices",
      "quotes": "Quotes"
    }
  }
}
```

### RTL Support

Arabic (`ar`) uses right-to-left layout. Use CSS logical properties and Tailwind's logical utilities:

```typescript
// Use logical properties (works for both LTR and RTL)
<div className="ms-4">  {/* margin-inline-start: 1rem */}
<div className="me-3">  {/* margin-inline-end: 0.75rem */}
<div className="ps-6">  {/* padding-inline-start: 1.5rem */}
<div className="pe-2">  {/* padding-inline-end: 0.5rem */}

// Conditional RTL handling when needed
const isRtl = direction === 'rtl';
<SheetContent side={isRtl ? 'right' : 'left'} />
```

### Building locale-aware links

All internal navigation links must include the locale prefix:

```typescript
const locale = useLocale();
const localizedHref = `/${locale}${item.href}`;  // e.g., "/en/sales/invoices"

<Link href={localizedHref}>Invoices</Link>
```

---

## Server Components vs Client Components

### Server Components (default)

Pages and layouts are Server Components by default. Use them for:
- Data fetching on the server
- Layout wrappers
- Static content

The `[locale]/layout.tsx` is a Server Component that loads translations server-side.

### Client Components

Add `'use client'` directive when the component needs:
- React hooks (`useState`, `useEffect`, `useSession`, etc.)
- Event handlers (`onClick`, `onChange`, etc.)
- TanStack Query hooks
- Browser APIs

Most pages in Mizano are client components because they use interactive hooks:

```typescript
'use client';

import { useState } from 'react';
import { useInvoices } from '@/lib/hooks/use-invoices';

export default function InvoicesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const { data, isLoading } = useInvoices({ search: searchQuery });
  // ...
}
```

---

## TanStack Query Hooks

All data fetching uses TanStack Query (React Query) hooks, located in `apps/web/lib/hooks/`.

### Hook file naming

```
lib/hooks/
  use-invoices.ts       # CRUD hooks for invoices
  use-customers.ts      # CRUD hooks for customers
  use-bills.ts          # CRUD hooks for bills
  use-accounts.ts       # CRUD hooks for accounts
  use-journals.ts       # CRUD hooks for journals
  use-dashboard.ts      # Dashboard-specific queries
  use-reports.ts        # Report queries
  use-permissions.ts    # Permission checking
  use-ai.ts             # AI feature hooks
  index.ts              # Barrel exports
```

### Query hooks (reading data)

```typescript
// lib/hooks/use-invoices.ts
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoicesApi } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

export interface InvoiceParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: InvoiceStatus;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// List query - queryKey includes params for proper caching
export function useInvoices(params?: InvoiceParams) {
  return useQuery({
    queryKey: ['invoices', params],
    queryFn: async () => {
      const response = await invoicesApi.getAll(params);
      return response.data;
    },
  });
}

// Detail query - enabled only when id exists
export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ['invoices', id],
    queryFn: async () => {
      if (!id) throw new Error('Invoice ID is required');
      const response = await invoicesApi.getOne(id);
      return response.data as Invoice;
    },
    enabled: !!id,
  });
}
```

### Mutation hooks (writing data)

```typescript
export function useCreateInvoice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateInvoiceData) => {
      const response = await invoicesApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate related queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({
        title: 'Invoice created',
        description: 'The invoice has been created successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error creating invoice',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateInvoiceData }) => {
      const response = await invoicesApi.update(id, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices', variables.id] });
      toast({
        title: 'Invoice updated',
        description: 'The invoice has been updated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error updating invoice',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await invoicesApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({
        title: 'Invoice deleted',
        description: 'The invoice has been deleted successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error deleting invoice',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}
```

### Query key conventions

Query keys follow a hierarchical pattern:

```typescript
['invoices']              // All invoices (list invalidation)
['invoices', params]      // Filtered invoices (specific query)
['invoices', id]          // Single invoice
['customers']             // All customers
['dashboard']             // Dashboard data
['reports', 'profit-loss', { startDate, endDate }]  // Report with params
```

### Using hooks in pages

```typescript
'use client';

export default function InvoicesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const { data: invoicesData, isLoading, refetch } = useInvoices({
    search: searchQuery || undefined,
    status: selectedStatus !== 'all' ? (selectedStatus as InvoiceStatus) : undefined,
  });
  const deleteInvoice = useDeleteInvoice();
  const sendInvoice = useSendInvoice();

  const invoices = invoicesData?.data || [];

  // Use mutation
  const confirmDelete = async () => {
    if (selectedInvoice) {
      try {
        await deleteInvoice.mutateAsync(selectedInvoice.id);
      } catch (error: any) {
        // Error already handled in hook's onError
      }
    }
  };
}
```

---

## API Client Pattern

The API client is built with Axios and lives in `apps/web/lib/api.ts`. There are two client instances:

### Client setup

```typescript
// lib/api.ts
import axios from 'axios';
import { getSession } from 'next-auth/react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

// Public client (no auth) - used for login/register
const publicApi = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Authenticated client - automatically attaches JWT
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach access token from NextAuth session
api.interceptors.request.use(async (config) => {
  if (typeof window !== 'undefined') {
    const session = await getSession();
    if (session?.accessToken) {
      config.headers.Authorization = `Bearer ${session.accessToken}`;
    }
  }
  return config;
});

// Response interceptor: redirect to login on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (typeof window !== 'undefined' && error.response?.status === 401) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

### API module objects

Each domain has a typed API object that groups related endpoints:

```typescript
// Auth (uses publicApi)
export const authApi = {
  login: (email: string, password: string) =>
    publicApi.post('/auth/login', { email, password }),
  register: (data: RegisterData) =>
    publicApi.post('/auth/register', data),
  refreshToken: (refreshToken: string) =>
    publicApi.post('/auth/refresh', { refreshToken }),
};

// Invoices (uses authenticated api)
export const invoicesApi = {
  getAll: (params?: Record<string, any>) => api.get('/invoices', { params }),
  getOne: (id: string) => api.get(`/invoices/${id}`),
  create: (data: any) => api.post('/invoices', data),
  update: (id: string, data: any) => api.patch(`/invoices/${id}`, data),
  delete: (id: string) => api.delete(`/invoices/${id}`),
  send: (id: string) => api.patch(`/invoices/${id}/send`),
  void: (id: string) => api.patch(`/invoices/${id}/void`),
};

// Customers
export const customersApi = {
  getAll: (params?: Record<string, any>) => api.get('/customers', { params }),
  getOne: (id: string) => api.get(`/customers/${id}`),
  getStatement: (id: string, params?: Record<string, any>) =>
    api.get(`/customers/${id}/statement`, { params }),
  create: (data: any) => api.post('/customers', data),
  update: (id: string, data: any) => api.patch(`/customers/${id}`, data),
  delete: (id: string) => api.delete(`/customers/${id}`),
};

// Reports
export const reportsApi = {
  getProfitAndLoss: (startDate: string, endDate: string) =>
    api.get(`/reports/profit-and-loss?startDate=${startDate}&endDate=${endDate}`),
  getBalanceSheet: (asOfDate: string) =>
    api.get(`/reports/balance-sheet?asOfDate=${asOfDate}`),
  getTrialBalance: (asOfDate: string) =>
    api.get(`/reports/trial-balance?asOfDate=${asOfDate}`),
  getReceivablesAging: (asOfDate?: string) =>
    api.get(`/reports/receivables-aging${asOfDate ? `?asOfDate=${asOfDate}` : ''}`),
  getPayablesAging: (asOfDate?: string) =>
    api.get(`/reports/payables-aging${asOfDate ? `?asOfDate=${asOfDate}` : ''}`),
};

// AI
export const aiApi = {
  getInsights: () => api.get('/ai/insights'),
  forecastRevenue: (months?: number) =>
    api.get(`/ai/forecast/revenue${months ? `?months=${months}` : ''}`),
  forecastCashFlow: (weeks?: number) =>
    api.get(`/ai/forecast/cash-flow${weeks ? `?weeks=${weeks}` : ''}`),
  categorize: (data: { description: string; amount: number; type: string }) =>
    api.post('/ai/categorize', data),
};
```

### CRUD method conventions

| Operation | HTTP Method | API Method |
|-----------|-------------|------------|
| List | `GET /resource` | `getAll(params?)` |
| Detail | `GET /resource/:id` | `getOne(id)` |
| Create | `POST /resource` | `create(data)` |
| Update | `PATCH /resource/:id` | `update(id, data)` |
| Delete | `DELETE /resource/:id` | `delete(id)` |
| Action | `PATCH /resource/:id/action` | `send(id)`, `void(id)`, etc. |

---

## Form Pattern

Forms use React Hook Form with Zod validation schemas.

### Create form page

```typescript
// app/[locale]/(dashboard)/sales/invoices/new/page.tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InvoiceForm } from '@/components/sales/invoice-form';
import { useCreateInvoice } from '@/lib/hooks/use-invoices';

export default function NewInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId') || undefined;
  const createInvoice = useCreateInvoice();

  const handleSubmit = async (data: any) => {
    try {
      const invoiceData = {
        customerId: data.customerId,
        date: data.invoiceDate,
        dueDate: data.dueDate,
        shippingAmount: data.shippingCharge || '0',
        notes: data.notes,
        terms: data.terms,
        lines: data.lines.map((line: any) => ({
          itemId: line.itemId || undefined,
          description: line.description,
          quantity: line.quantity,
          rate: line.rate,
          discount: line.discountPercent || '0',
        })),
      };
      const result = await createInvoice.mutateAsync(invoiceData);
      router.push(`/sales/invoices/${result.id}`);
    } catch (error) {
      // Error handled by mutation's onError
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/sales/invoices">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Invoice</h1>
          <p className="text-muted-foreground">Create a new invoice for a customer</p>
        </div>
      </div>

      <InvoiceForm
        customerId={customerId}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/sales/invoices')}
        isSubmitting={createInvoice.isPending}
      />
    </div>
  );
}
```

### Form component pattern (React Hook Form + Zod)

```typescript
// components/sales/invoice-form.tsx
'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';

// Zod schema (may come from @mizano/validators for shared schemas)
const invoiceLineSchema = z.object({
  itemId: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  quantity: z.string().min(1, 'Quantity is required'),
  rate: z.string().min(1, 'Rate is required'),
  discountPercent: z.string().optional(),
  taxRateId: z.string().optional(),
});

const invoiceFormSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  invoiceDate: z.string().min(1, 'Date is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  lines: z.array(invoiceLineSchema).min(1, 'At least one line is required'),
  notes: z.string().optional(),
  terms: z.string().optional(),
  shippingCharge: z.string().optional(),
});

type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

interface InvoiceFormProps {
  defaultValues?: Partial<InvoiceFormValues>;
  customerId?: string;
  onSubmit: (data: InvoiceFormValues) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function InvoiceForm({
  defaultValues,
  customerId,
  onSubmit,
  onCancel,
  isSubmitting,
}: InvoiceFormProps) {
  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      customerId: customerId || '',
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: '',
      lines: [{ description: '', quantity: '1', rate: '' }],
      notes: '',
      terms: '',
      shippingCharge: '0',
      ...defaultValues,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="customerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer</FormLabel>
                  <FormControl>
                    {/* Customer select component */}
                    <Input {...field} placeholder="Select customer" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="invoiceDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Line items section */}
        <Card>
          <CardHeader>
            <CardTitle>Line Items</CardTitle>
          </CardHeader>
          <CardContent>
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 mb-2">
                {/* Line item fields */}
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => append({ description: '', quantity: '1', rate: '' })}>
              Add Line
            </Button>
          </CardContent>
        </Card>

        {/* Form actions */}
        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Invoice'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
```

Key patterns:
- `zodResolver(schema)` connects Zod validation to React Hook Form.
- `useFieldArray` manages dynamic line items (invoice lines, journal lines, etc.).
- `isSubmitting` is passed from the parent page (from `mutation.isPending`).
- Forms are extracted into reusable components shared between "new" and "edit" pages.
- Shared Zod schemas may be imported from `@mizano/validators` for use in both frontend and backend.

---

## Component Structure

```
apps/web/components/
  ui/                    # shadcn/ui primitives (auto-generated)
    button.tsx
    card.tsx
    input.tsx
    table.tsx
    dialog.tsx
    dropdown-menu.tsx
    skeleton.tsx
    badge.tsx
    select.tsx
    form.tsx
    toaster.tsx
    ...
  layout/                # App-wide layout components
    sidebar.tsx
    header.tsx
  tour/                  # Onboarding tour
    tour-provider.tsx
  sales/                 # Domain-specific components
    invoice-form.tsx
    customer-form.tsx
    quote-form.tsx
  purchases/
    bill-form.tsx
    vendor-form.tsx
  accounting/
    journal-form.tsx
    account-form.tsx
  providers.tsx           # Global providers wrapper
```

### UI primitives (shadcn/ui)

Never modify `ui/` components directly unless customizing a design system token. These are generated by `npx shadcn-ui@latest add <component>`.

### Domain components

Extracted when a piece of UI is:
- Used in multiple pages (e.g., `InvoiceForm` in both `/new` and `/[id]/edit`)
- Complex enough to warrant its own file (100+ lines)

---

## State Management

### Server state: TanStack Query

All data from the API is managed through TanStack Query. Configuration in `providers.tsx`:

```typescript
// components/providers.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { useState } from 'react';
import { Toaster } from '@/components/ui/toaster';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,       // Data is "fresh" for 1 minute
            refetchOnWindowFocus: false, // Don't refetch on tab focus
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </SessionProvider>
  );
}
```

### Client state: Zustand

For UI-only state that does not come from the API, use Zustand stores:

```typescript
// lib/stores/use-tour-store.ts
'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TourState {
  currentTour: string | null;
  isActive: boolean;
  startTour: (tourId: string) => void;
  endTour: () => void;
  skipTour: (tourId: string) => void;
}

export const useTourStore = create<TourState>()(
  persist(
    (set) => ({
      currentTour: null,
      isActive: false,
      startTour: (tourId: string) =>
        set({ currentTour: tourId, isActive: true }),
      endTour: () => set({ currentTour: null, isActive: false }),
      skipTour: () => set({ currentTour: null, isActive: false }),
    }),
    {
      name: 'tour-storage', // persists to localStorage
    }
  )
);
```

When to use which:
- **TanStack Query** -- any data that comes from or goes to the API
- **Zustand** -- UI preferences, sidebar collapsed state, onboarding tour progress, theme settings
- **React `useState`** -- ephemeral component state (search input, dialog open/closed, selected item)

---

## Page States

Every page must handle three states: **loading**, **error**, and **empty**.

### Loading state (Skeleton)

```typescript
{isLoading ? (
  <div className="space-y-3">
    {[...Array(5)].map((_, i) => (
      <Skeleton key={i} className="h-12 w-full" />
    ))}
  </div>
) : (
  // ... data content
)}
```

### Empty state

```typescript
{invoices.length === 0 ? (
  <div className="text-center py-12">
    <p className="text-muted-foreground mb-4">No invoices found</p>
    {canCreate && (
      <Button asChild>
        <Link href="/sales/invoices/new">
          <Plus className="mr-2 h-4 w-4" />
          Create Your First Invoice
        </Link>
      </Button>
    )}
  </div>
) : (
  // ... table/list content
)}
```

### Error state

```typescript
{error ? (
  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
    <p className="text-destructive font-medium">Failed to load invoices</p>
    <p className="text-sm text-muted-foreground mt-1">
      {error.message || 'An unexpected error occurred'}
    </p>
    <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">
      <RefreshCw className="mr-2 h-4 w-4" />
      Retry
    </Button>
  </div>
) : (
  // ... normal content
)}
```

### Complete pattern

```typescript
export default function InvoicesPage() {
  const { data, isLoading, error, refetch } = useInvoices(params);
  const invoices = data?.data || [];

  return (
    <Card>
      <CardContent>
        {isLoading ? (
          // Skeleton loading
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          // Error state
          <div className="text-center py-12">
            <p className="text-destructive">Failed to load data</p>
            <Button variant="outline" onClick={() => refetch()} className="mt-2">
              Retry
            </Button>
          </div>
        ) : invoices.length === 0 ? (
          // Empty state
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No invoices found</p>
            <Button asChild>
              <Link href="/sales/invoices/new">
                <Plus className="mr-2 h-4 w-4" /> Create Your First Invoice
              </Link>
            </Button>
          </div>
        ) : (
          // Data table
          <Table>...</Table>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## Navigation

The sidebar in `components/layout/sidebar.tsx` provides hierarchical navigation organized by business domain.

### Navigation configuration

```typescript
const navigationConfig: NavItem[] = [
  { nameKey: 'dashboard', href: '/dashboard', icon: LayoutDashboard },
  {
    nameKey: 'sales.title',
    href: '/sales',
    icon: ShoppingCart,
    permission: 'sales.view',
    children: [
      { nameKey: 'sales.customers', href: '/sales/customers', icon: Users },
      { nameKey: 'sales.quotes', href: '/sales/quotes', icon: FileText },
      { nameKey: 'sales.invoices', href: '/sales/invoices', icon: Receipt },
      { nameKey: 'sales.creditNotes', href: '/sales/credit-notes', icon: CreditCard },
      { nameKey: 'sales.payments', href: '/sales/payments', icon: Banknote },
    ],
  },
  {
    nameKey: 'purchases.title',
    href: '/purchases',
    icon: Building2,
    permission: 'purchases.view',
    children: [
      { nameKey: 'purchases.vendors', href: '/purchases/vendors', icon: Users },
      { nameKey: 'purchases.expenses', href: '/purchases/expenses', icon: Receipt },
      { nameKey: 'purchases.bills', href: '/purchases/bills', icon: FileText },
      { nameKey: 'purchases.payments', href: '/purchases/payments', icon: Banknote },
      { nameKey: 'purchases.credits', href: '/purchases/credits', icon: CreditCard },
    ],
  },
  // ...accounting, inventory, banking, projects, manufacturing, hr, tax, crm
  { nameKey: 'reports', href: '/reports', icon: BarChart3, permission: 'reports.view' },
  { nameKey: 'aiInsights', href: '/ai-insights', icon: Brain },
  { nameKey: 'settings', href: '/settings', icon: Settings, permission: 'settings.view' },
];
```

### Permission-based filtering

Navigation items with a `permission` field are only shown if the user has that permission:

```typescript
const filteredNavigation = navigationConfig.filter((item) => {
  if (!item.permission) return true;
  if (isLoading) return false;
  return hasPermission(item.permission);
});
```

### Responsive behavior

- **Desktop (lg+)**: Collapsible sidebar pinned to the left (or right for RTL)
- **Mobile (<lg)**: Sidebar hidden; accessible via hamburger menu that opens a Sheet/Drawer

```typescript
// Mobile: Sheet sidebar
<Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
  <SheetTrigger asChild>
    <Button variant="ghost" size="icon" className="fixed top-4 z-40 start-4">
      <Menu className="h-6 w-6" />
    </Button>
  </SheetTrigger>
  <SheetContent side={isRtl ? 'right' : 'left'} className="w-64 p-0">
    <SidebarNav onItemClick={() => setMobileOpen(false)} />
  </SheetContent>
</Sheet>

// Desktop: Collapsible sidebar
<div className={cn(
  'flex flex-col transition-all duration-300',
  collapsed ? 'w-16' : 'w-64'
)}>
  <SidebarNav collapsed={collapsed} />
</div>
```

---

## Toast Notifications

Mizano uses the shadcn/ui `Toaster` component (built on Radix Toast). Toast calls happen inside TanStack Query mutation hooks:

### Success toast

```typescript
toast({
  title: 'Invoice created',
  description: 'The invoice has been created successfully.',
});
```

### Error toast

```typescript
toast({
  variant: 'destructive',
  title: 'Error creating invoice',
  description: error.response?.data?.message || 'An error occurred',
});
```

### Setup

The `Toaster` is rendered once in `providers.tsx`:

```typescript
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </SessionProvider>
  );
}
```

Access via the `useToast` hook:

```typescript
import { useToast } from '@/components/ui/use-toast';

const { toast } = useToast();
```

---

## Responsive Design

All pages must be tested at three breakpoints:

| Breakpoint | Width | Target |
|------------|-------|--------|
| Desktop | 1920px | Full layout with sidebar |
| Tablet | 768px | Collapsed sidebar or overlay |
| Mobile | 375px | Sheet sidebar, stacked layouts |

### Responsive patterns used

```typescript
// Grid that collapses on mobile
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">

// Flex that stacks on mobile
<div className="flex flex-col sm:flex-row gap-4">

// Hidden on mobile, visible on desktop
<div className="hidden lg:flex">

// Responsive padding
<main className="flex-1 overflow-y-auto p-4 lg:p-6">

// Responsive table (overflow-x-auto for small screens)
<div className="overflow-x-auto">
  <Table>...</Table>
</div>

// Filter bar stacking
<div className="flex flex-col sm:flex-row gap-4">
  <div className="relative flex-1">
    <Input placeholder="Search..." />
  </div>
  <Select className="w-full sm:w-[180px]">...</Select>
</div>
```

### RTL responsive adjustments

For Arabic locale, use logical CSS properties and conditional side values:

```typescript
// Logical properties (LTR/RTL agnostic)
<div className="ms-4 me-3 ps-6 pe-2">

// Conditional rendering for RTL
<SheetContent side={isRtl ? 'right' : 'left'}>

// Chevron direction
{collapsed ? (
  isRtl ? <ChevronLeft /> : <ChevronRight />
) : (
  isRtl ? <ChevronRight /> : <ChevronLeft />
)}
```

---

## Icons

All icons come from **Lucide React** (`lucide-react`). Import individual icons, never the entire library:

```typescript
import {
  Plus,
  Search,
  RefreshCw,
  Eye,
  Edit,
  Trash2,
  Send,
  Ban,
  Filter,
  ArrowLeft,
  LayoutDashboard,
  Users,
  FileText,
  Receipt,
  CreditCard,
  Banknote,
  ShoppingCart,
  Building2,
  Calculator,
  Package,
  Landmark,
  Briefcase,
  Factory,
  UserCircle,
  Target,
  BarChart3,
  Settings,
  Brain,
  DollarSign,
  Clock,
  Menu,
  ChevronLeft,
  ChevronRight,
  Warehouse,
  Layers,
  Wrench,
  Percent,
} from 'lucide-react';
```

### Icon sizing convention

```typescript
// In buttons and inline elements
<Plus className="mr-2 h-4 w-4" />

// In sidebar navigation
<item.icon className="h-5 w-5 flex-shrink-0 me-3" />

// Standalone icons (e.g., mobile menu)
<Menu className="h-6 w-6" />
```

### Icon + text pattern

Always place the icon before the text in buttons with `mr-2` (or `me-2` for RTL-safe spacing):

```typescript
<Button>
  <Plus className="mr-2 h-4 w-4" />
  New Invoice
</Button>

<DropdownMenuItem>
  <Eye className="mr-2 h-4 w-4" />
  View
</DropdownMenuItem>
```
