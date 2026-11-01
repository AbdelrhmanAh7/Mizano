import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Decimal } from '@prisma/client/runtime/library';
import { localize, localizeDeep, renameFields, systemName } from './localize';
import { SYSTEM_DESCRIPTIONS_AR, SYSTEM_NAMES_AR } from './system-names';
import { DEFAULT_ROLES } from '../../modules/roles/constants/default-roles.constant';

const seeded = {
  name: 'Accounts Receivable',
  nameEn: 'Accounts Receivable',
  nameAr: 'الذمم المدينة (العملاء)',
};

describe('localize', () => {
  it('answers in the asked language, then the other one, then the stored name', () => {
    expect(localize(seeded, 'ar').name).toBe('الذمم المدينة (العملاء)');
    expect(localize(seeded, 'en').name).toBe('Accounts Receivable');
    expect(localize({ name: 'Cash', nameEn: 'Cash', nameAr: null }, 'ar').name).toBe('Cash');
    const typed = { name: 'صندوق الفرع', nameAr: null, nameEn: null };
    expect(localize(typed, 'en')).toBe(typed);
  });

  it('localizes nested rows and leaves Decimals, Dates and plain fields alone', () => {
    const amount = new Decimal('10.5000');
    const date = new Date(0);
    const body = {
      data: [{ ...seeded, parent: { ...seeded, name: 'Cash', nameEn: 'Cash', nameAr: 'النقدية' } }],
      meta: { total: 1 },
      amount,
      date,
    };
    const out = localizeDeep(body, 'ar');
    expect(out.data[0].name).toBe('الذمم المدينة (العملاء)');
    expect(out.data[0].parent.name).toBe('النقدية');
    expect(out.amount).toBe(amount);
    expect(out.date).toBe(date);
    expect(out.meta).toBe(body.meta);
    expect(body.data[0].name).toBe('Accounts Receivable');
    const noNames = { data: [{ id: 'a', name: 'typed' }] };
    expect(localizeDeep(noNames, 'ar')).toBe(noNames);
  });
});

describe('renameFields', () => {
  it('keeps the stored name when the localized name is saved back unchanged', () => {
    expect(renameFields(seeded, 'الذمم المدينة (العملاء)')).toEqual({});
    expect(renameFields(seeded, 'Accounts Receivable')).toEqual({});
    expect(renameFields(seeded, undefined)).toEqual({});
  });

  it("makes a new name the person's own, in every language", () => {
    expect(renameFields(seeded, 'Customers')).toEqual({
      name: 'Customers',
      nameAr: null,
      nameEn: null,
    });
  });
});

describe('system names catalog', () => {
  const api = join(__dirname, '..', '..', '..');
  // Every file that seeds system rows (charts of accounts, tax rates, roles).
  const SEED_FILES = [
    'src/modules/accounting/services/accounts.service.ts',
    'src/modules/organizations/organizations.service.ts',
    'src/modules/tax/services/tax-rates.service.ts',
    'src/modules/roles/constants/default-roles.constant.ts',
    'src/modules/auth/auth.service.ts',
  ];
  // Onboarding template titles, not rows: the screen shows its own copy for them.
  const NOT_ROWS = new Set([
    'Standard Chart of Accounts',
    'Retail Business',
    'Professional Services',
    'Manufacturing',
    'Construction',
  ]);
  const SORT_ORDERS = new Set(['asc', 'desc']); // `orderBy: { name: 'asc' }`

  it('has Arabic for every English name a seed writes', () => {
    const missing: string[] = [];
    for (const file of SEED_FILES) {
      const source = readFileSync(join(api, file), 'utf8');
      // Account/tax/role names: `name: '…'` entries and systemName('…') calls.
      const names = [...source.matchAll(/(?:\bname: |systemName\()(['"])((?:(?!\1).)+)\1/g)].map(
        (m) => m[2],
      );
      for (const name of names) {
        if (SYSTEM_NAMES_AR[name] || NOT_ROWS.has(name) || SORT_ORDERS.has(name)) continue;
        missing.push(`${file}: ${name}`);
      }
    }
    // The dev seed also writes customers and items: check only its chart, tax rates and roles.
    const seed = readFileSync(join(api, 'prisma/seed.ts'), 'utf8');
    const chart = /const accountsData[^=]*= \[([\s\S]*?)\n {2}\];/.exec(seed)?.[1] ?? '';
    expect(chart).toContain("'Cash'");
    for (const m of [
      ...chart.matchAll(/name: '([^']+)'/g),
      ...seed.matchAll(/systemName\('([^']+)'\)/g),
    ]) {
      if (!SYSTEM_NAMES_AR[m[1]]) missing.push(`prisma/seed.ts: ${m[1]}`);
    }
    // Role names in the dev seed are a plain list.
    const roleList = /const roleNames = \[([^\]]+)\]/.exec(seed)?.[1] ?? '';
    for (const m of roleList.matchAll(/'([^']+)'/g)) {
      if (!SYSTEM_NAMES_AR[m[1]]) missing.push(`prisma/seed.ts role: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });

  it('is fully backfilled by the migration, with the same Arabic', () => {
    const dir = join(api, 'prisma/migrations');
    const migration = readdirSync(dir).find((d) => d.endsWith('_bilingual_system_names'));
    const sql = readFileSync(join(dir, migration ?? '', 'migration.sql'), 'utf8');
    const quote = (text: string): string => `'${text.replace(/'/g, "''")}'`;
    const absent = Object.entries(SYSTEM_NAMES_AR).filter(
      ([en, ar]) => !sql.includes(`(${quote(en)}, ${quote(ar)})`),
    );
    expect(absent).toEqual([]);
  });

  it('writes both languages for a seeded name', () => {
    expect(systemName('Cash')).toEqual({ name: 'Cash', nameEn: 'Cash', nameAr: 'النقدية' });
  });

  it('answers the text written on system roles in Arabic, and leaves typed text alone (#630)', () => {
    for (const role of DEFAULT_ROLES) expect(SYSTEM_DESCRIPTIONS_AR[role.description]).toBeTruthy();
    expect(SYSTEM_DESCRIPTIONS_AR['Full system access']).toBeTruthy();
    const admin = { ...systemName('Admin'), description: 'Full system access' };
    expect(localize(admin, 'ar').description).toBe(SYSTEM_DESCRIPTIONS_AR['Full system access']);
    expect(localize(admin, 'en').description).toBe('Full system access');
    const typed = { ...systemName('Admin'), description: 'My own words' };
    expect(localize(typed, 'ar').description).toBe('My own words');
  });
});
