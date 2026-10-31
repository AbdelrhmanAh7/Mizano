/**
 * The CRM and composite-item forms must emit exactly the API DTO: its field names, its enum
 * values, money as a decimal string and whole-unit quantities (review lessons §11). The API
 * now validates these bodies, so a drifting payload is a 400 instead of a silent 500.
 */

// The address fields render translated pickers; their copy is not under test here.
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  itemsApi: { getAll: jest.fn() },
}));

import { toCompositeItemPayload } from '@/components/inventory/composite-item-form';
import { toDealPayload } from './deal-form';
import { toLeadPayload } from './lead-form';

describe('lead form payload', () => {
  const values = {
    leadName: ' Sara ',
    companyName: '',
    email: '',
    phone: '+201000000000',
    source: 'REFERRAL' as const,
    notes: '  ',
  };

  it('omits empty optional fields on create (an empty email failed @IsEmail)', () => {
    expect(toLeadPayload(values)).toEqual({
      leadName: 'Sara',
      companyName: undefined,
      email: undefined,
      phone: '+201000000000',
      source: 'REFERRAL',
      notes: undefined,
    });
  });

  it('sends null for an emptied field on edit so the API clears it', () => {
    expect(toLeadPayload(values, true)).toMatchObject({
      companyName: null,
      email: null,
      notes: null,
    });
  });
});

describe('deal form payload', () => {
  it('keeps the amount a decimal string and the stage an API enum value', () => {
    expect(
      toDealPayload({
        dealName: 'Website',
        leadId: '',
        expectedAmount: ' 5000.50 ',
        probability: 40,
        expectedCloseDate: '',
        stage: 'PROPOSAL_SENT',
        notes: '',
      }),
    ).toEqual({
      dealName: 'Website',
      leadId: undefined,
      expectedAmount: '5000.50',
      probability: 40,
      expectedCloseDate: undefined,
      stage: 'PROPOSAL_SENT',
      notes: undefined,
    });
  });
});

describe('composite item form payload', () => {
  it('sends whole-unit quantities as numbers and the price as a string', () => {
    expect(
      toCompositeItemPayload({
        name: ' Bundle ',
        sku: 'BNDL-1',
        sellingPrice: '1500.00',
        description: '',
        components: [
          { itemId: 'item-1', quantity: '1' },
          { itemId: 'item-2', quantity: '3' },
        ],
      }),
    ).toEqual({
      name: 'Bundle',
      sku: 'BNDL-1',
      sellingPrice: '1500.00',
      description: undefined,
      components: [
        { itemId: 'item-1', quantity: 1 },
        { itemId: 'item-2', quantity: 3 },
      ],
    });
  });
});
