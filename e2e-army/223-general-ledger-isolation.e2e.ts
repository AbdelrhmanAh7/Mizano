import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const SEED = 'army-223';

for (const token of ['', 'invalid.jwt.token']) {
  test(
    `@issue-223 AC3: general ledger by id rejects ${token ? 'a malformed' : 'a missing'} token with 401`,
    { tags: ['feat:mz-general-ledger', 'feat:mz-financial-reports', 'lvl:api'] },
    async ({ app }) => {
      const res = await fetch(new URL(`/api/reports/general-ledger/${SEED}-account`, app.baseUrl), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      expect(res.status).toBe(401);
    },
  );
}
