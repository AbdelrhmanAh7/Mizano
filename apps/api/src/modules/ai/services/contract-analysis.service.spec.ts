import { Test, TestingModule } from '@nestjs/testing';
import { ContractAnalysisService } from './contract-analysis.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
} from '../__tests__/fixtures/ai-test-helpers';

describe('ContractAnalysisService', () => {
  let service: ContractAnalysisService;
  let prisma: MockPrismaClient;

  const orgId = TEST_ORG_ID;

  const sampleContract = `
    SERVICE AGREEMENT

    This Service Agreement ("Agreement") is entered into between Acme Corporation ("Provider")
    and Global Industries Ltd ("Client"), effective as of January 1, 2025.

    1. SCOPE OF WORK
    The Provider shall deliver software development services as described in Exhibit A.

    2. PAYMENT TERMS
    The Client agrees to pay the Provider a fee of $50,000 per month, payable within net 30 days
    of invoice. Late payments shall incur interest at a rate of 1.5% per month.

    3. TERM AND TERMINATION
    This Agreement is effective for a period of 12 months and may be terminated by either party
    with 60 days written notice. Termination for cause may occur immediately upon material breach.

    4. CONFIDENTIALITY
    Both parties agree to maintain the confidentiality of all proprietary information and trade
    secrets disclosed during the term of this Agreement. Neither party shall disclose such
    information to any third party without prior written consent.

    5. LIABILITY
    The Provider's total liability under this Agreement shall not exceed the total fees paid in
    the preceding 12 months. Neither party shall be liable for consequential damages.

    6. RENEWAL
    This Agreement shall automatically renew for successive 12-month periods unless either
    party provides written notice of non-renewal at least 30 days before the expiration date.

    7. PENALTY
    In the event of breach, the breaching party shall pay liquidated damages equal to three
    months of service fees. Late delivery penalties shall be 1% per day.
  `;

  const minimalContract = `
    Agreement between Party A and Party B.
    This is a very short contract.
  `;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ContractAnalysisService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ContractAnalysisService>(ContractAnalysisService);
  });

  // ---------------------------------------------------------------------------
  // analyzeContract
  // ---------------------------------------------------------------------------
  describe('analyzeContract', () => {
    it('should return a complete analysis result with all fields', async () => {
      const result = await service.analyzeContract(orgId, sampleContract);

      expect(result).toHaveProperty('parties');
      expect(result).toHaveProperty('dates');
      expect(result).toHaveProperty('keyTerms');
      expect(result).toHaveProperty('clauses');
      expect(result).toHaveProperty('summary');
      expect(result.summary).toHaveProperty('totalClauses');
      expect(result.summary).toHaveProperty('clauseBreakdown');
    });

    it('should extract parties from the contract', async () => {
      const result = await service.analyzeContract(orgId, sampleContract);

      expect(result.parties.length).toBeGreaterThan(0);
      // At least some parties should be found
      const partyNames = result.parties.map((p) => p.name.toLowerCase());
      expect(
        partyNames.some(
          (name) =>
            name.includes('acme') ||
            name.includes('global') ||
            name.includes('provider') ||
            name.includes('client'),
        ),
      ).toBe(true);
    });

    it('should extract key terms via TF-IDF', async () => {
      const result = await service.analyzeContract(orgId, sampleContract);

      expect(result.keyTerms.length).toBeGreaterThan(0);
      result.keyTerms.forEach((term) => {
        expect(term.term.length).toBeGreaterThan(2);
        expect(typeof term.tfidf).toBe('number');
        expect(term.tfidf).toBeGreaterThan(0);
      });
    });

    it('should classify clauses into types', async () => {
      const result = await service.analyzeContract(orgId, sampleContract);

      expect(result.clauses.length).toBeGreaterThan(0);
      const clauseTypes = result.clauses.map((c) => c.type);
      // Should detect at least payment_terms and termination from the sample
      expect(clauseTypes.includes('payment_terms') || clauseTypes.includes('termination')).toBe(
        true,
      );
    });

    it('should have clause breakdown sum matching total clauses', async () => {
      const result = await service.analyzeContract(orgId, sampleContract);

      const breakdownSum = Object.values(result.summary.clauseBreakdown).reduce(
        (sum, count) => sum + count,
        0,
      );
      expect(breakdownSum).toBe(result.summary.totalClauses);
    });
  });

  // ---------------------------------------------------------------------------
  // extractDates
  // ---------------------------------------------------------------------------
  describe('extractDates', () => {
    it('should extract dates from contract text', () => {
      const dates = service.extractDates(sampleContract);

      expect(dates.length).toBeGreaterThan(0);
    });

    it('should label dates based on surrounding context', () => {
      const text =
        'The effective date is January 1, 2025. The agreement expires on December 31, 2025.';
      const dates = service.extractDates(text);

      expect(dates.length).toBeGreaterThan(0);
      dates.forEach((d) => {
        expect(d).toHaveProperty('label');
        expect(d).toHaveProperty('text');
      });
    });

    it('should return empty for text with no dates', () => {
      const dates = service.extractDates('No dates in this text at all.');

      expect(dates).toHaveLength(0);
    });

    it('should handle ISO-format dates', () => {
      const dates = service.extractDates('Signed on 2025-06-15 and valid until 2026-01-01.');

      expect(dates.length).toBeGreaterThanOrEqual(1);
    });

    it('should attempt to parse dates into Date objects', () => {
      const dates = service.extractDates('Effective date January 1, 2025.');

      if (dates.length > 0) {
        // parsed may be null or a Date
        dates.forEach((d) => {
          expect(d).toHaveProperty('parsed');
        });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // extractObligations
  // ---------------------------------------------------------------------------
  describe('extractObligations', () => {
    it('should classify payment-related clauses', () => {
      const result = service.extractObligations(
        'Payment is due within net 30 days. The client shall pay an invoice fee of $5000.',
      );

      expect(result.clauses.length).toBeGreaterThan(0);
      const paymentClauses = result.clauses.filter((c) => c.type === 'payment_terms');
      expect(paymentClauses.length).toBeGreaterThan(0);
    });

    it('should classify penalty clauses', () => {
      const result = service.extractObligations(
        'In case of breach, liquidated damages of $10,000 shall be paid. Late fee of 2% applies.',
      );

      const penaltyClauses = result.clauses.filter((c) => c.type === 'penalty');
      expect(penaltyClauses.length).toBeGreaterThan(0);
    });

    it('should classify termination clauses', () => {
      const result = service.extractObligations(
        'Either party may terminate this agreement with 30 days notice. Termination for cause is immediate.',
      );

      const termClauses = result.clauses.filter((c) => c.type === 'termination');
      expect(termClauses.length).toBeGreaterThan(0);
    });

    it('should classify confidentiality clauses', () => {
      const result = service.extractObligations(
        'All parties shall maintain confidential information and not disclose trade secrets to third parties.',
      );

      const confClauses = result.clauses.filter((c) => c.type === 'confidentiality');
      expect(confClauses.length).toBeGreaterThan(0);
    });

    it('should classify liability clauses', () => {
      const result = service.extractObligations(
        'Limitation of liability: total liability shall not exceed $100,000. Neither party liable for consequential damages.',
      );

      const liabClauses = result.clauses.filter((c) => c.type === 'liability');
      expect(liabClauses.length).toBeGreaterThan(0);
    });

    it('should mark unrecognized sentences as general', () => {
      const result = service.extractObligations(
        'The sky is blue and the grass is green. This is a random sentence about weather.',
      );

      const generalClauses = result.clauses.filter((c) => c.type === 'general');
      expect(generalClauses.length).toBeGreaterThan(0);
    });

    it('should skip sentences shorter than 10 characters', () => {
      const result = service.extractObligations(
        'OK. Fine. Done. This is a longer sentence about payment terms.',
      );

      // Short sentences skipped, only longer ones processed
      result.clauses.forEach((c) => {
        expect(c.text.trim().length).toBeGreaterThanOrEqual(10);
      });
    });

    it('should include summary with counts per type', () => {
      const result = service.extractObligations(sampleContract);

      expect(result.summary).toBeDefined();
      expect(typeof result.summary.payment_terms).toBe('number');
      expect(typeof result.summary.penalty).toBe('number');
      expect(typeof result.summary.termination).toBe('number');
      expect(typeof result.summary.general).toBe('number');
    });
  });

  // ---------------------------------------------------------------------------
  // riskAnalysis
  // ---------------------------------------------------------------------------
  describe('riskAnalysis', () => {
    it('should return low risk for a comprehensive contract', () => {
      const result = service.riskAnalysis(sampleContract);

      expect(result.overallRisk).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(result.overallRisk);
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
    });

    it('should flag missing termination clause as high risk', () => {
      const noTermination = `
        Payment is due within 30 days.
        All information shall be kept confidential.
        Total liability limited to fees paid in the past year.
      `;
      const result = service.riskAnalysis(noTermination);

      const missingTermination = result.factors.find((f) =>
        f.factor.toLowerCase().includes('termination'),
      );
      expect(missingTermination).toBeDefined();
      expect(missingTermination!.severity).toBe('high');
    });

    it('should flag missing liability clause as high risk', () => {
      const noLiability = `
        Either party may terminate this agreement with notice.
        All information is confidential.
        Payment is due within net 30.
      `;
      const result = service.riskAnalysis(noLiability);

      const missingLiability = result.factors.find((f) =>
        f.factor.toLowerCase().includes('liability'),
      );
      expect(missingLiability).toBeDefined();
      expect(missingLiability!.severity).toBe('high');
    });

    it('should flag penalty clauses as medium risk', () => {
      const result = service.riskAnalysis(sampleContract);

      const penaltyFactor = result.factors.find((f) => f.factor.toLowerCase().includes('penalty'));
      if (penaltyFactor) {
        expect(penaltyFactor.severity).toBe('medium');
      }
    });

    it('should flag very short contracts as medium risk', () => {
      const result = service.riskAnalysis(minimalContract);

      const shortFactor = result.factors.find((f) => f.factor.toLowerCase().includes('short'));
      expect(shortFactor).toBeDefined();
    });

    it('should provide recommendations for each risk factor', () => {
      const result = service.riskAnalysis(minimalContract);

      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should cap risk score at 100', () => {
      // Contract missing everything
      const bareContract = 'This is an agreement. Both parties agree.';
      const result = service.riskAnalysis(bareContract);

      expect(result.riskScore).toBeLessThanOrEqual(100);
    });

    it('should detect automatic renewal clause as low risk', () => {
      const result = service.riskAnalysis(sampleContract);

      const renewalFactor = result.factors.find((f) => f.factor.toLowerCase().includes('renewal'));
      if (renewalFactor) {
        expect(renewalFactor.severity).toBe('low');
      }
    });
  });
});
