import { scanDuplicateDraft } from './scan-duplicate-draft';

const fields = {
  vendorName: 'شركة الأمل',
  total: 1140.5,
  date: '2026-10-06',
  currency: 'egp',
};

describe('scanDuplicateDraft', () => {
  it('uses the selected vendor, the extracted total as a decimal string, date and currency', () => {
    expect(scanDuplicateDraft(fields, 'vendor-1')).toEqual({
      vendorId: 'vendor-1',
      amount: '1140.5',
      date: '2026-10-06',
      currency: 'EGP',
    });
  });

  it('falls back to the extracted vendor name when no vendor is selected', () => {
    expect(scanDuplicateDraft(fields, '')).toMatchObject({ vendorName: 'شركة الأمل' });
    expect(scanDuplicateDraft(fields, '')).not.toHaveProperty('vendorId');
  });

  it('leaves out values the extraction did not read cleanly', () => {
    for (const bad of [
      { total: null, date: null, currency: null, vendorName: null },
      { total: -5, date: '06/10/2026', currency: 'EGPX', vendorName: '  ' },
      { total: 1e21, date: '2026-02-30', currency: 'E1', vendorName: null },
    ]) {
      expect(scanDuplicateDraft(bad, '')).toEqual({});
    }
  });
});
