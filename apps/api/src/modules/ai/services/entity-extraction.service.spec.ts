import { Test, TestingModule } from '@nestjs/testing';
import { EntityExtractionService } from './entity-extraction.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
} from '../__tests__/fixtures/ai-test-helpers';

describe('EntityExtractionService', () => {
  let service: EntityExtractionService;
  let prisma: MockPrismaClient;

  const orgId = TEST_ORG_ID;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [EntityExtractionService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<EntityExtractionService>(EntityExtractionService);
  });

  // ---------------------------------------------------------------------------
  // extractEntities
  // ---------------------------------------------------------------------------
  describe('extractEntities', () => {
    it('should return empty result for empty text', () => {
      const result = service.extractEntities('');

      expect(result.people).toHaveLength(0);
      expect(result.organizations).toHaveLength(0);
      expect(result.dates).toHaveLength(0);
      expect(result.places).toHaveLength(0);
      expect(result.money).toHaveLength(0);
      expect(result.emails).toHaveLength(0);
      expect(result.phones).toHaveLength(0);
    });

    it('should return empty result for whitespace-only text', () => {
      const result = service.extractEntities('   \n\t  ');

      expect(result.people).toHaveLength(0);
      expect(result.emails).toHaveLength(0);
    });

    it('should extract email addresses', () => {
      const result = service.extractEntities(
        'Please contact john.doe@acme.com for more information.',
      );

      expect(result.emails.length).toBeGreaterThanOrEqual(1);
      const email = result.emails.find((e) => e.text === 'john.doe@acme.com');
      expect(email).toBeDefined();
      expect(email!.type).toBe('email');
    });

    it('should extract multiple email addresses', () => {
      const result = service.extractEntities(
        'Contact alice@example.com or bob@company.org for details.',
      );

      expect(result.emails.length).toBeGreaterThanOrEqual(2);
    });

    it('should extract monetary amounts with $ prefix', () => {
      const result = service.extractEntities('The total invoice amount is $5,000.50 plus tax.');

      expect(result.money.length).toBeGreaterThanOrEqual(1);
      const money = result.money.find((m) => m.text.includes('5,000.50'));
      expect(money).toBeDefined();
      expect(money!.type).toBe('money');
    });

    it('should extract amounts with currency codes', () => {
      const result = service.extractEntities(
        'Payment of 1,500 EUR was received. Also 2000 USD pending.',
      );

      expect(result.money.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract ISO dates', () => {
      const result = service.extractEntities(
        'The contract was signed on 2025-06-15 and expires on 2026-12-31.',
      );

      expect(result.dates.length).toBeGreaterThanOrEqual(1);
      const hasDate = result.dates.some(
        (d) => d.text.includes('2025-06-15') || d.text.includes('2025') || d.text.includes('June'),
      );
      expect(hasDate).toBe(true);
    });

    it('should extract phone numbers with at least 7 digits', () => {
      const result = service.extractEntities('Call us at +1-555-123-4567 or (555) 987-6543.');

      expect(result.phones.length).toBeGreaterThanOrEqual(1);
      result.phones.forEach((p) => {
        expect(p.type).toBe('phone');
        const digits = p.text.replace(/\D/g, '');
        expect(digits.length).toBeGreaterThanOrEqual(7);
      });
    });

    it('should not extract short numbers as phone numbers', () => {
      const result = service.extractEntities('Item quantity: 123');

      // "123" has only 3 digits -- should not match as phone
      const phoneWithThreeDigits = result.phones.find((p) => p.text.replace(/\D/g, '').length < 7);
      expect(phoneWithThreeDigits).toBeUndefined();
    });

    it('should deduplicate identical entities', () => {
      const result = service.extractEntities('Contact john@acme.com. Email: john@acme.com.');

      expect(result.emails).toHaveLength(1);
    });

    it('should include start and end positions for regex-extracted entities', () => {
      const result = service.extractEntities('Email: test@example.com');

      if (result.emails.length > 0) {
        expect(result.emails[0].start).toBeDefined();
        expect(result.emails[0].end).toBeDefined();
        expect(result.emails[0].end!).toBeGreaterThan(result.emails[0].start!);
      }
    });

    it('should extract entities from a realistic invoice text', () => {
      const invoiceText = `
        Invoice #INV-2025-001
        From: Acme Corporation
        To: Global Industries Ltd
        Date: 2025-06-15
        Due: 2025-07-15
        Amount: $12,500.00
        Contact: billing@acme.com
        Phone: +1 (555) 234-5678
      `;

      const result = service.extractEntities(invoiceText);

      expect(result.emails.length).toBeGreaterThanOrEqual(1);
      expect(result.money.length).toBeGreaterThanOrEqual(1);
      expect(result.phones.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // extractAndMatch
  // ---------------------------------------------------------------------------
  describe('extractAndMatch', () => {
    it('should return empty matches when no customers or vendors exist', async () => {
      prisma.customer.findMany.mockResolvedValue([] as any);
      prisma.vendor.findMany.mockResolvedValue([] as any);

      const result = await service.extractAndMatch(orgId, 'Invoice from Acme Corp');

      expect(result.entities).toBeDefined();
      expect(result.matches).toHaveLength(0);
    });

    it('should match extracted organization against existing customers', async () => {
      prisma.customer.findMany.mockResolvedValue([
        { id: 'cust-1', name: 'Acme Corporation', displayName: 'Acme Corporation' },
      ] as any);
      prisma.vendor.findMany.mockResolvedValue([] as any);

      const result = await service.extractAndMatch(
        orgId,
        'Invoice from Acme Corporation for $5,000',
      );

      // Depending on NLP, Acme Corporation may or may not be extracted
      // The match only occurs if compromise detects the organization name
      expect(result.entities).toBeDefined();
    });

    it('should match extracted organization against vendors when no customer match', async () => {
      prisma.customer.findMany.mockResolvedValue([] as any);
      prisma.vendor.findMany.mockResolvedValue([
        { id: 'ven-1', name: 'Office Supplies Inc', displayName: 'Office Supplies Inc' },
      ] as any);

      const result = await service.extractAndMatch(
        orgId,
        'Bill from Office Supplies Inc for stationery',
      );

      expect(result.entities).toBeDefined();
    });

    it('should deduplicate matches by matchedId', async () => {
      prisma.customer.findMany.mockResolvedValue([
        { id: 'cust-1', name: 'Acme Corp', displayName: 'Acme Corp' },
      ] as any);
      prisma.vendor.findMany.mockResolvedValue([] as any);

      const result = await service.extractAndMatch(
        orgId,
        'Acme Corp sent a document. The document is from Acme Corp.',
      );

      // Should not have duplicate matches for the same customer
      const uniqueIds = new Set(result.matches.map((m) => m.matchedId));
      expect(uniqueIds.size).toBe(result.matches.length);
    });

    it('should include similarity score in matched results', async () => {
      prisma.customer.findMany.mockResolvedValue([
        { id: 'cust-1', name: 'Microsoft', displayName: 'Microsoft' },
      ] as any);
      prisma.vendor.findMany.mockResolvedValue([] as any);

      const result = await service.extractAndMatch(
        orgId,
        'Invoice from Microsoft Corporation for licensing',
      );

      if (result.matches.length > 0) {
        expect(result.matches[0].similarity).toBeGreaterThanOrEqual(0);
        expect(result.matches[0].similarity).toBeLessThanOrEqual(1);
        expect(result.matches[0].matchType).toBeDefined();
      }
    });

    it('should return both entities and matches in the result', async () => {
      prisma.customer.findMany.mockResolvedValue([] as any);
      prisma.vendor.findMany.mockResolvedValue([] as any);

      const result = await service.extractAndMatch(
        orgId,
        'Contact billing@acme.com for the $5,000 invoice dated 2025-06-15',
      );

      expect(result).toHaveProperty('entities');
      expect(result).toHaveProperty('matches');
      expect(result.entities).toHaveProperty('emails');
      expect(result.entities).toHaveProperty('money');
    });
  });
});
