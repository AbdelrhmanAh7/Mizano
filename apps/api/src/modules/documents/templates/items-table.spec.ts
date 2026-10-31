import { generateItemsTableHtml } from './base.template';

/** Manual QA: an invoice line with a 10% discount printed "3 × 49.99 = 134.97" with no discount. */
describe('generateItemsTableHtml line discounts', () => {
  const plain = { description: 'Consulting', quantity: 2, rate: 100, taxRate: 14, amount: 200 };
  const discounted = {
    description: 'Widget',
    quantity: 3,
    rate: 49.99,
    discount: 10,
    taxRate: 14,
    amount: 134.97,
  };

  it('prints a discount column with the line percentage when a line is discounted', () => {
    const html = generateItemsTableHtml([plain, discounted], 'EGP', true, undefined, 'en');
    expect(html).toContain('Disc. %');
    expect(html).toContain('>10%</td>');
    expect(html).toContain('>0%</td>');
  });

  it('labels the discount column in Arabic', () => {
    const html = generateItemsTableHtml([discounted], 'EGP', true, undefined, 'ar');
    expect(html).toContain('الخصم %');
  });

  it('keeps the table compact when no line has a discount', () => {
    const html = generateItemsTableHtml([plain], 'EGP', true, undefined, 'en');
    expect(html).not.toContain('Disc. %');
  });
});
