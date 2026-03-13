---
description: Add shadcn/ui components to the project
---

// turbo-all

# Add shadcn/ui Component

## Steps

1. Ask the user which component(s) to add if not specified.

2. Add the component using the shadcn CLI:

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano/apps/web && npx shadcn@latest add <component-name>
```

For multiple components at once:

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano/apps/web && npx shadcn@latest add button card dialog table form input select
```

3. Components are installed to `apps/web/components/ui/`

4. Verify the component was added:

```bash
ls -la /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano/apps/web/components/ui/
```

## Available Components

Common shadcn/ui components: `accordion`, `alert`, `alert-dialog`, `avatar`, `badge`, `button`, `calendar`, `card`, `checkbox`, `collapsible`, `combobox`, `command`, `context-menu`, `data-table`, `date-picker`, `dialog`, `drawer`, `dropdown-menu`, `form`, `hover-card`, `input`, `label`, `menubar`, `navigation-menu`, `popover`, `progress`, `radio-group`, `scroll-area`, `select`, `separator`, `sheet`, `skeleton`, `slider`, `sonner`, `switch`, `table`, `tabs`, `textarea`, `toast`, `toggle`, `tooltip`

## Usage

Import from the `@/components/ui/` path:

```typescript
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
```
