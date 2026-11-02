# Design system

The web UI (`apps/web`) is built from shadcn/ui primitives on Radix, styled with Tailwind CSS through semantic CSS variables. This page is the reference for tokens, components and patterns; use it for every new screen and when touching an existing one. Accessibility, Arabic/RTL and mobile rules are requirements, not polish.

Sources of truth:

| What                         | File                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------ |
| Color, radius, chart tokens  | `apps/web/app/globals.css` (`:root` and `.dark`)                               |
| Tailwind mapping and plugins | `apps/web/tailwind.config.js`                                                  |
| Fonts                        | `apps/web/app/layout.tsx` (`next/font`)                                        |
| Primitives                   | `apps/web/components/ui/` (shadcn, `components.json`)                          |
| Cross-module building blocks | `apps/web/components/{shared,data-table,layout}/`                              |
| Brand assets                 | `apps/web/public/{svg,png,ico,pwa,social}/`                                    |
| Stories                      | `apps/web/components/ui/*.stories.tsx` (`pnpm --filter @mizano/web storybook`) |

## Tokens

### Thoth Labs foundation (shared with FlowLine)

Jarda and FlowLine share one foundation and differ only in their primary color.

| Part           | Value                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------- |
| Fonts          | Inter (Latin) + IBM Plex Sans Arabic (Arabic), both OFL, loaded with `next/font`            |
| Success        | `#15753A`: paid, posted, approved                                                           |
| Warning        | `#A1460A`: partially paid, needs review                                                     |
| Danger         | `#B91C1C`: overdue, failed, delete                                                          |
| Info           | `#1D4ED8`: sent, processing (never an action color)                                         |
| Muted text     | `#526075`: helper text, meta, placeholders                                                  |
| Focus          | 2px ring in the primary color, 2px offset (`focus-visible:ring-2 ring-ring ring-offset-2`)  |
| Radius         | `--radius: 0.5rem`: `rounded-md` controls, `rounded-lg` cards/dialogs, `rounded-full` pills |
| Spacing / type | Tailwind 4px scale; type scale below                                                        |

Every semantic color passes WCAG AA (4.5:1) as text on white **and** on its own soft badge (`bg-success/10`).

### Color

Colors are HSL triplets in CSS variables in `apps/web/app/globals.css`, exposed as Tailwind colors (`bg-primary`, `text-muted-foreground`, `bg-success/10` …). That file is the only place a color is defined: `pnpm --filter @mizano/web lint` runs `apps/web/scripts/check-design-tokens.mjs`, which fails on raw palette classes (`bg-blue-600`, `text-red-500`, `from-teal-50`) and hex literals anywhere in `app/`, `components/` and `lib/` (tests excepted). PDFs and emails, which cannot read CSS variables, use `BRAND_COLORS` from `@mizano/shared-types` (same values). `apps/web/lib/design-tokens.spec.ts` checks the contrast of every pair below in light and dark.

| Token                                             | Light value                                | Use                                                         |
| ------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| `primary` (+ `-foreground`)                       | `#0F766E` / white                          | Every primary action: buttons, links, active tab/nav, focus |
| `ring`                                            | `#0F766E`                                  | Focus ring                                                  |
| `accent` (+ `-foreground`)                        | `#E1F5EE` / `#085041`                      | Hover/selected rows and menu items                          |
| `background` / `foreground`                       | white / slate 950                          | Page background and body text                               |
| `card`, `popover` (+ `-foreground`)               | white                                      | Surfaces: cards, menus, dialogs                             |
| `secondary` (+ `-foreground`)                     | slate 100                                  | Secondary buttons, neutral chips                            |
| `muted` (+ `-foreground`)                         | slate 100 / `#526075`                      | Subtle backgrounds, helper text, drafts                     |
| `destructive` (+ `-foreground`)                   | `#B91C1C` / white                          | Delete/void actions, errors, overdue, failed                |
| `success` (+ `-foreground`)                       | `#15753A` / white                          | Paid, posted, approved, completed                           |
| `warning` (+ `-foreground`)                       | `#A1460A` / white                          | Partially paid, needs review, low confidence, expiring      |
| `info` (+ `-foreground`)                          | `#1D4ED8` / white                          | Sent, processing, informational notices                     |
| `brand`, `brand-dark`, `brand-deep`, `brand-gold` | `#0D9488`, `#085041`, `#063A33`, `#EF9F27` | Logo colors: hero panels and illustrations only, never text |
| `overlay`                                         | black at 80% opacity                       | Dialog/sheet scrim                                          |
| `border`, `input`                                 | slate 200                                  | Borders, form control borders                               |
| `chart-1` … `chart-5`                             | teal, blue, gold, violet, rose             | Categorical chart series, in order                          |

**Why `#0F766E` and not the logo's `#0D9488`:** white text on `#0D9488` is 3.7:1 (fails AA); one step darker on the same hue is 5.5:1. The logo keeps `#0D9488`.

Soft status styling is `border-{token}/30 bg-{token}/10 text-{token}`; solid styling is `bg-{token} text-{token}-foreground`.

**Accounting status mapping** (use the same meaning everywhere: invoices, bills, journals, extraction jobs):

| Meaning                    | Token         | Examples                                         |
| -------------------------- | ------------- | ------------------------------------------------ |
| Not yet effective          | `muted`       | Draft, void (add `line-through`), archived       |
| In flight                  | `info`        | Sent, queued, extracting                         |
| Needs accountant attention | `warning`     | Partially paid, low-confidence field, exception  |
| Done and reconciled        | `success`     | Paid, posted, approved                           |
| Blocking problem           | `destructive` | Overdue, failed extraction, unbalanced, rejected |

Color is never the only signal: badges carry a text label and icons have accessible names.

**Do / don't**

| Do                                                     | Don't                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| `<Button>` (primary) for the one main action of a view | A blue, green or custom-colored button                        |
| `text-primary hover:underline` for links               | `text-info` or `text-blue-*` links                            |
| `bg-success/10 text-success` status pills with a word  | `bg-green-100 text-green-800`, color without a label          |
| `fill="hsl(var(--chart-1))"` in charts                 | Hex colors in charts                                          |
| `bg-brand` gradients on hero panels                    | `text-brand` (fails contrast) or `[#0D9488]` arbitrary values |
| Token only; dark mode follows from `.dark`             | `dark:bg-*-900` palette overrides                             |

**Dark mode.** `.dark` token values exist (primary `#2DD4BF` on dark ink), but no theme toggle sets the `dark` class yet (`darkMode: ['class']`). Build with tokens so dark mode works when a toggle is added; do not add `prefers-color-scheme` CSS.

### Typography

- Fonts: Inter (`--font-inter`, Latin) and IBM Plex Sans Arabic (`--font-arabic`), loaded with `next/font` and combined in `font-sans`, so Arabic glyphs fall through to Plex Arabic automatically. The logo wordmarks are outlined paths and need no font.
- Scale in use: page title `text-2xl sm:text-3xl font-bold tracking-tight`; card title `text-2xl font-semibold` (CardTitle) or `text-lg font-semibold`; body `text-sm`; helper/meta `text-xs text-muted-foreground`.
- Numbers in tables, totals and inputs use `tabular-nums` so digits align.
- Do not use letter-spacing or uppercase transforms on Arabic text.

### Spacing, radius, elevation

- Tailwind 4px spacing scale. Page sections `space-y-6`, card padding `p-6` (`p-4` on mobile-dense lists), form fields `space-y-2` inside, `gap-4` between fields.
- Page gutter comes from the dashboard layout; container max width `2xl: 1400px`.
- Radius: `--radius: 0.5rem` → `rounded-lg` (cards, dialogs), `rounded-md` (buttons, inputs), `rounded-sm`; `rounded-full` for badges/avatars. `rounded-xl` only for large hero/summary panels.
- Elevation: cards `shadow-sm`, popovers/menus `shadow-md`, dialogs/sheets `shadow-lg`. Prefer borders over heavier shadows.
- Motion: `tailwindcss-animate` (Radix enter/exit, accordion). Keep transitions to color/opacity; respect reduced motion for anything larger.

## Components

### Primitives (`components/ui`)

| Component                                                                             | Use for                                                                                                                                                   |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `button`                                                                              | Actions. Variants `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`; sizes `sm`, `default`, `lg`, `icon` (icon buttons need `aria-label`) |
| `badge`                                                                               | Status/label chips. Variants `default`, `secondary`, `destructive`, `outline`, `success`, `warning`, `info`, `muted`                                      |
| `card`                                                                                | Grouped content, KPI tiles, form sections                                                                                                                 |
| `input`, `textarea`, `label`, `checkbox`, `radio-group`, `switch`, `slider`, `select` | Form controls; always paired with `Label`                                                                                                                 |
| `calendar`, `popover`                                                                 | Date pickers (calendar inside popover)                                                                                                                    |
| `phone-input`, `country-select`, `city-select`                                        | Contact/address fields with validation                                                                                                                    |
| `dialog`, `alert-dialog`, `sheet`                                                     | Modal edit, confirmation of irreversible actions, side panels/mobile nav                                                                                  |
| `dropdown-menu`, `command`                                                            | Row actions; command palette and searchable pickers                                                                                                       |
| `tabs`, `separator`, `scroll-area`, `tooltip`, `avatar`, `progress`                   | Layout and feedback helpers                                                                                                                               |
| `table`                                                                               | Static tables (use `DataTable` for lists)                                                                                                                 |
| `skeleton`, `component-skeletons`, `page-skeletons`                                   | Loading states: `CardSkeleton`, `ChartSkeleton`, `TableSkeleton`, `DetailPageSkeleton`, `FormPageSkeleton`, `ReportPageSkeleton`, `SettingsPageSkeleton`  |
| `toast`, `toaster`, `use-toast`                                                       | Notifications (see Feedback)                                                                                                                              |

Add primitives with `cd apps/web && npx shadcn@latest add <name>` ([workflow](../.agents/workflows/add-component.md)), then convert physical direction classes to logical ones (see RTL).

### Building blocks

| Component                                                                                        | Use for                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-table/DataTable`                                                                           | Every list page: sorting, pagination or virtual infinite scroll, selection + bulk actions, column visibility/resizing, export, built-in loading and empty state |
| `data-table/{DataTableSearch, DataTableFacetedFilter, DataTableDateRangeFilter, SortableHeader}` | Toolbar filters and sortable headers                                                                                                                            |
| `data-table/{BulkActionConfirm, BulkProgressDialog}`                                             | Confirm and show progress/failures of batch actions (batch approval)                                                                                            |
| `shared/EmptyState`                                                                              | No data yet: icon, title, description, primary action                                                                                                           |
| `shared/ErrorState`                                                                              | Failed query: message and retry                                                                                                                                 |
| `shared/DeleteConfirmDialog`                                                                     | Destructive confirmation                                                                                                                                        |
| `shared/MoneyInput`                                                                              | Monetary input that keeps the value as a decimal string                                                                                                         |
| `layout/{Sidebar, Header, Breadcrumbs, LanguageSwitcher, NotificationPanel}`                     | App shell (already mounted by the dashboard layout)                                                                                                             |
| `sales/StatusBadge` and typed variants                                                           | Status chip from a status → class/label map                                                                                                                     |
| `error-boundary`, `navigation-progress`, `command-palette`, `keyboard-shortcuts`                 | App-wide utilities                                                                                                                                              |

Module-specific components live in `components/{module}/`. Promote a component to `shared/` only when a second module needs it.

## Patterns

### Page anatomy

```
app/[locale]/(dashboard)/{module}/{page}/
  page.tsx      header (title, description, primary action) → filters → content
  loading.tsx   page-shaped skeleton (same layout as the loaded page)
  error.tsx     route error boundary using ErrorState with reset()
```

Every data view handles four states explicitly:

| State              | Pattern                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Loading            | Skeleton with the final layout (`TableSkeleton`, `DetailPageSkeleton` …), never a blank page or lone spinner       |
| Error              | `ErrorState` with the server message when safe and `onRetry={() => refetch()}`                                     |
| Empty              | `EmptyState` with a next step (upload invoice, create vendor); distinguish "no results for filters" from "no data" |
| Stale/reconnecting | Keep showing data; indicate refresh or reconnect (SSE/socket) without hiding content                               |

### Forms

React Hook Form + `zodResolver`, schemas from `@mizano/validators` or colocated Zod schemas.

```tsx
const schema = z.object({
  vendorId: z.string().min(1, t('validation.required')),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/, t('validation.amount')),
});
const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

<div className="space-y-2">
  <Label htmlFor="amount">{t('amount')}</Label>
  <Controller
    control={form.control}
    name="amount"
    render={({ field }) => (
      <MoneyInput
        id="amount"
        currency={currency}
        value={field.value ?? ''}
        onChange={field.onChange}
        aria-invalid={!!form.formState.errors.amount}
      />
    )}
  />
  {form.formState.errors.amount && (
    <p className="text-sm text-destructive">{form.formState.errors.amount.message}</p>
  )}
</div>;
```

- Labels for every control; errors in `text-destructive` below the field and announced via `aria-invalid`.
- Submit buttons show a spinner (`<Loader2 className="animate-spin" />`) and are disabled while pending; mutations are idempotent server-side, but the UI still prevents double submits.
- Validation messages come from the `validation` i18n namespace.
- Responsive grid: `grid gap-4 sm:grid-cols-2`; full-width actions on mobile.

### Tables and lists

- Use `DataTable` with typed `ColumnDef`s; put row actions in a `dropdown-menu`, bulk actions in `bulkActions`.
- Amount columns are end-aligned (`text-end tabular-nums`); dates use the locale formatter.
- At 375px, keep the key columns (number, party, amount, status) and hide the rest with column visibility, or render cards.

### Money and numbers

- Money arrives from the API as decimal **strings**. Keep it as a string in state and forms (`MoneyInput` stores strings) and send strings back.
- Never add, subtract or round money in the browser with `number`. Totals, taxes and balances come from the API, which computes them with Decimal. A client-side preview must be labelled as a preview and the server value wins.
- Formatting is display-only: `const formatMoney = useMoneyFormatter(); formatMoney(value, document.currencyCode)`. It shows the document's own currency, else the organization base currency (`GET /organization/money-format`, readable by every member), never USD or the counterparty's default; Arabic screens use the organization's digit setting. There is no other money formatter: no module hook or page defines its own.
- Show tax percentage and tax amount as separate values.
- Negative amounts use a leading minus (or the locale's accounting format); do not encode sign with color alone.

### Feedback (toasts)

- Canonical: `useToast()` / `toast({ title, description, variant })` from `components/ui/use-toast` (`variant: 'destructive'` for errors). `createCrudHooks` already toasts create/update/delete.
- Some hooks (banking, HR, projects) still call `toast.success/error` from `sonner`; both viewports are mounted in `components/providers.tsx`. Prefer `useToast` in new code.
- Toast for outcomes of user actions; inline `Alert` for persistent conditions (period locked, extraction exception) that must stay visible.

### Charts

- Recharts inside `ResponsiveContainer`; wrap in a `Card` with title and period; show `ChartSkeleton` while loading and `EmptyState` when there is no data.
- Series colors: `fill="hsl(var(--chart-1))"` … `chart-5` in order; status-coded series use `success`/`warning`/`destructive`/`info`/`muted-foreground`. No hex colors (the token guard fails on them).
- Axis and tooltip values use the locale formatters; charts must reconcile with the report tables they summarize ([acceptance](strategy/demo-acceptance.md)).
- In RTL, keep time flowing in the locale's reading direction (`reversed` X axis) and put the Y axis on the start side.

### RTL and Arabic

The locale layout sets `dir="rtl"` for `ar`; Tailwind 3.4 logical utilities (plus `tailwindcss-rtl`) mirror automatically.

| Use                                                  | Instead of                     |
| ---------------------------------------------------- | ------------------------------ |
| `ms-*`, `me-*`, `ps-*`, `pe-*`                       | `ml-*`, `mr-*`, `pl-*`, `pr-*` |
| `start-*`, `end-*`                                   | `left-*`, `right-*`            |
| `text-start`, `text-end`                             | `text-left`, `text-right`      |
| `border-s`, `border-e`, `rounded-s-*`, `rounded-e-*` | `border-l/r`, `rounded-l/r-*`  |
| `rtl:` / `ltr:` variants or `.icon-flip`             | hard-coded transforms          |

- Flip directional icons (chevrons, arrows, "back") with `rtl:rotate-180` or `.icon-flip`; never flip logos, checkmarks or media controls.
- Numbers, amounts, invoice numbers, IBANs, tax IDs and emails stay LTR inside RTL text: wrap them in `<bdi>` or `dir="ltr"` spans.
- All user-visible strings come from `messages/{en,ar}`; add both languages in the same change.
- Some stock shadcn primitives (dialog close button, select item indicator, sheet sides) still use physical classes; convert them when touched and verify in Arabic.

### Responsive and accessibility

- Design at **375px** first, then `sm` (640), `md`, `lg` (1024, sidebar visible), `xl`. No horizontal page scroll; wide tables scroll inside their container.
- Touch targets at least 40px high (`h-10` buttons/inputs).
- Visible focus (`focus-visible:ring-2 ring-ring`), full keyboard operation (Radix handles menus/dialogs), `aria-label` on icon-only buttons, text contrast of at least 4.5:1.
- Test each new page in English and Arabic, light theme, at 375px and desktop.

## Brand assets

| Asset                                                           | Use                                                       |
| --------------------------------------------------------------- | --------------------------------------------------------- |
| `svg/logo-full.svg`, `svg/logo-full-dark.svg`                   | Horizontal logo for light / dark surfaces (sidebar, auth) |
| `svg/logo-icon.svg`, `svg/logo-icon-circle.svg`                 | Square mark (collapsed sidebar), avatar                   |
| `svg/logo-wordmark(-dark).svg`, `svg/logo-stacked(-dark).svg`   | Text-only and stacked variants                            |
| `svg/safari-pinned-tab.svg`                                     | Monochrome pinned tab                                     |
| `ico/favicon.ico`, `png/icon-*.png`, `png/apple-touch-icon.png` | Favicons, referenced from `app/layout.tsx` metadata       |
| `pwa/icon-*-maskable.png`, `manifest.json`                      | Installable PWA icons (theme color `#0D9488`)             |
| `social/og-image.png` (1200×630), `social/avatar.png`           | Social sharing and profile images                         |

Render logos with `next/image` and a translated `alt` (`tCommon('appName')`).
