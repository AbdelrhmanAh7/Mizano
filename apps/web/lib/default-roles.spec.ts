import { isMissingDefaultRoles } from './default-roles';

const all = ['Admin', 'Manager', 'Accountant', 'SalesRep', 'StoreKeeper'].map((n) => ({
  name: n,
  nameEn: n,
}));

describe('isMissingDefaultRoles (#630)', () => {
  it('offers the standard roles to an organization that only has Admin', () => {
    expect(isMissingDefaultRoles([{ name: 'مدير النظام', nameEn: 'Admin' }])).toBe(true);
    expect(isMissingDefaultRoles([])).toBe(true);
  });

  it('does not offer them once all five exist, in either language', () => {
    expect(isMissingDefaultRoles(all)).toBe(false);
    expect(isMissingDefaultRoles(all.map((r) => ({ name: 'محاسب', nameEn: r.nameEn })))).toBe(
      false,
    );
  });
});
