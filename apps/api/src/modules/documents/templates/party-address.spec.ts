import { partyAddress, renderAddressHtml } from './base.template';

const STYLE = 'color: #6B7280;';

describe('partyAddress', () => {
  it('prefers the billing address the web forms write', () => {
    expect(
      partyAddress({
        address: 'Old St',
        city: 'Alexandria',
        country: 'EG',
        billingStreet: '1 Tahrir St',
        billingCity: 'Cairo',
        billingCountry: null,
      }),
    ).toEqual({ address: '1 Tahrir St', city: 'Cairo', country: undefined });
  });

  it('falls back to the import/export columns when no billing address is set', () => {
    expect(
      partyAddress({ address: '9 Corniche', city: 'Giza', billingStreet: '', billingCity: ' ' }),
    ).toEqual({ address: '9 Corniche', city: 'Giza', country: undefined });
    expect(partyAddress({})).toEqual({});
  });
});

describe('renderAddressHtml', () => {
  it('prints a city without a country, a country without a city, and escapes both', () => {
    expect(renderAddressHtml({ city: 'Cairo' }, STYLE)).toBe(`<p style="${STYLE}">Cairo</p>`);
    expect(renderAddressHtml({ country: 'Egypt' }, STYLE)).toBe(`<p style="${STYLE}">Egypt</p>`);
    expect(renderAddressHtml({ address: '<b>1</b>', city: 'Giza', country: 'EG' }, STYLE)).toBe(
      `<p style="${STYLE}">&lt;b&gt;1&lt;/b&gt;</p><p style="${STYLE}">Giza, EG</p>`,
    );
    expect(renderAddressHtml({}, STYLE)).toBe('');
  });
});
