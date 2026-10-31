import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Credential-free by design (CTO decision on #535): the customer form sits behind login, so this
// request-level check only proves both locale routes stay guarded. The localized create/update
// action names are covered by customer-form-actions.spec.tsx and docs/evidence/491/verify-browser.cjs.
test(
  '@issue-491 AC1: the customer form routes stay behind login in English and Arabic',
  { tags: ['feat:mz-customers', 'lvl:api'] },
  async ({ app }) => {
    for (const locale of ['en', 'ar']) {
      for (const path of ['sales/customers/new', 'sales/customers/army-491/edit']) {
        const res = await fetch(new URL(`/${locale}/${path}`, app.baseUrl), { redirect: 'manual' });
        expect(res.status).toBeGreaterThanOrEqual(300);
        expect(res.status).toBeLessThan(400);
        expect(res.headers.get('location') ?? '').toMatch(
          new RegExp(`/${locale}/(login|onboarding)`),
        );
      }
    }
  },
);
