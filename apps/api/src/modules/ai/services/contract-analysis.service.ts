import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { buildContractAnalysisPrompt } from '../prompts/nlp.prompts';
import { PredictionMethod } from '../types/prediction-method.type';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nlp = require('compromise');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const natural = require('natural');

/**
 * Classification labels for contract clauses.
 */
export type ClauseType =
  | 'payment_terms'
  | 'penalty'
  | 'termination'
  | 'renewal'
  | 'liability'
  | 'confidentiality'
  | 'general';

export interface ContractParty {
  name: string;
  role?: string;
}

export interface ContractDate {
  label: string;
  text: string;
  parsed?: Date | null;
}

export interface KeyTerm {
  term: string;
  tfidf: number;
}

export interface ContractClause {
  text: string;
  type: ClauseType;
  confidence: number;
}

export interface ContractAnalysisResult {
  parties: ContractParty[];
  dates: ContractDate[];
  keyTerms: KeyTerm[];
  clauses: ContractClause[];
  summary: {
    totalClauses: number;
    clauseBreakdown: Record<ClauseType, number>;
  };
  predictionMethod?: PredictionMethod;
}

export interface ObligationResult {
  clauses: ContractClause[];
  summary: Record<ClauseType, number>;
}

export interface RiskFactor {
  factor: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface RiskAnalysisResult {
  overallRisk: 'low' | 'medium' | 'high';
  riskScore: number;
  factors: RiskFactor[];
  recommendations: string[];
}

/**
 * Keywords that indicate specific clause types.
 * Each key maps to an array of keyword patterns to check (case-insensitive).
 */
const CLAUSE_KEYWORDS: Record<Exclude<ClauseType, 'general'>, string[]> = {
  payment_terms: [
    'payment',
    'due',
    'net 30',
    'net 60',
    'net 90',
    'invoice',
    'payable',
    'remittance',
    'billing cycle',
    'payment schedule',
    'installment',
  ],
  penalty: [
    'penalty',
    'liquidated damages',
    'late fee',
    'interest on overdue',
    'fine',
    'damages',
    'breach',
    'forfeiture',
  ],
  termination: [
    'terminate',
    'cancellation',
    'exit',
    'end of agreement',
    'notice period',
    'termination for cause',
    'termination for convenience',
    'right to terminate',
  ],
  renewal: [
    'renew',
    'extend',
    'automatic renewal',
    'auto-renew',
    'extension',
    'continuation',
    'evergreen',
    'rollover',
  ],
  liability: [
    'liability',
    'indemnif',
    'hold harmless',
    'limitation of liability',
    'cap on liability',
    'consequential damages',
    'negligence',
    'warranti',
  ],
  confidentiality: [
    'confidential',
    'non-disclosure',
    'proprietary',
    'trade secret',
    'nda',
    'sensitive information',
    'restricted information',
    'not disclose',
  ],
};

/**
 * Keywords that suggest party role designations in contracts.
 */
const PARTY_ROLE_KEYWORDS: Record<string, string[]> = {
  client: ['client', 'buyer', 'purchaser', 'customer', 'principal'],
  provider: [
    'provider',
    'seller',
    'vendor',
    'supplier',
    'contractor',
    'consultant',
    'service provider',
  ],
};

/**
 * Date label keywords for contract date extraction.
 */
const DATE_LABEL_KEYWORDS: Record<string, string[]> = {
  'start date': ['effective date', 'commencement date', 'start date', 'begins on'],
  'end date': ['expiration date', 'end date', 'expires on', 'terminates on', 'valid until'],
  'renewal date': ['renewal date', 'renews on', 'auto-renew date'],
  deadline: ['deadline', 'due by', 'no later than', 'submission date'],
};

@Injectable()
export class ContractAnalysisService {
  private readonly logger = new Logger(ContractAnalysisService.name);
  private readonly tokenizer: { tokenize(text: string): string[] };

  constructor(
    private prisma: PrismaService,
    private gateway: OllamaInferenceGateway,
  ) {
    this.tokenizer = new natural.SentenceTokenizer();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Perform a full analysis of a contract text.
   * Extracts parties, dates, key terms, and classifies all clauses.
   */
  async analyzeContract(organizationId: string, text: string): Promise<ContractAnalysisResult> {
    this.logger.log(`Analyzing contract for org ${organizationId} (${text.length} chars)`);

    // --- Ollama-first inference path ---
    try {
      const prompt = buildContractAnalysisPrompt(text);
      const ollamaResult = await this.gateway.infer<{
        parties: Array<{ name: string; role?: string }>;
        dates: Array<{ label: string; value: string }>;
        clauses: Array<{ type: string; text: string; risk_level?: string }>;
        risks: Array<{ description: string; severity: string; recommendation: string }>;
        summary: string;
      }>(prompt);

      if (ollamaResult) {
        const d = ollamaResult.data;

        const parties: ContractParty[] = (d.parties || []).map((p) => ({
          name: p.name,
          role: p.role,
        }));

        const dates: ContractDate[] = (d.dates || []).map((dt) => ({
          label: dt.label,
          text: dt.value,
          parsed: this.tryParseDate(dt.value),
        }));

        const ollamaClauses: ContractClause[] = (d.clauses || []).map((c) => ({
          text: c.text,
          type: (c.type as ClauseType) || 'general',
          confidence: 0.8,
        }));

        const clauseBreakdown: Record<ClauseType, number> = {
          payment_terms: 0,
          penalty: 0,
          termination: 0,
          renewal: 0,
          liability: 0,
          confidentiality: 0,
          general: 0,
        };
        for (const clause of ollamaClauses) {
          if (clause.type in clauseBreakdown) {
            clauseBreakdown[clause.type]++;
          }
        }

        const result: ContractAnalysisResult = {
          parties,
          dates,
          keyTerms: this.extractKeyTerms(text),
          clauses: ollamaClauses,
          summary: {
            totalClauses: ollamaClauses.length,
            clauseBreakdown,
          },
          predictionMethod: 'OLLAMA',
        };

        return result;
      }
    } catch (error) {
      this.logger.warn(
        `Ollama contract analysis failed, falling back to NLP/regex: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // --- Existing NLP/regex fallback ---
    const [parties, dates, keyTerms, clauses] = await Promise.all([
      Promise.resolve(this.extractParties(text)),
      Promise.resolve(this.extractDates(text)),
      Promise.resolve(this.extractKeyTerms(text)),
      Promise.resolve(this.extractObligations(text)),
    ]);

    // Build clause breakdown summary
    const clauseBreakdown: Record<ClauseType, number> = {
      payment_terms: 0,
      penalty: 0,
      termination: 0,
      renewal: 0,
      liability: 0,
      confidentiality: 0,
      general: 0,
    };

    for (const clause of clauses.clauses) {
      clauseBreakdown[clause.type]++;
    }

    return {
      parties,
      dates,
      keyTerms,
      clauses: clauses.clauses,
      summary: {
        totalClauses: clauses.clauses.length,
        clauseBreakdown,
      },
      predictionMethod: 'RULE_BASED',
    };
  }

  /**
   * Extract important dates from contract text.
   * Uses regex-based date extraction plus keyword patterns for labeled dates.
   */
  extractDates(text: string): ContractDate[] {
    const dates: ContractDate[] = [];

    // Extract dates via regex instead of compromise plugin (compromise core has no .dates())
    const dateRegex =
      /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s*\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b/gi;
    const nlpDates: string[] = text.match(dateRegex) || [];

    for (const dateStr of nlpDates) {
      const label = this.inferDateLabel(text, dateStr);
      const parsed = this.tryParseDate(dateStr);
      dates.push({
        label,
        text: dateStr.trim(),
        parsed,
      });
    }

    // Also extract labeled dates using keyword patterns
    const sentences = this.tokenizer.tokenize(text) as string[];
    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();

      for (const [label, keywords] of Object.entries(DATE_LABEL_KEYWORDS)) {
        for (const keyword of keywords) {
          if (lowerSentence.includes(keyword)) {
            // Try to extract a date from this sentence
            const dateMatch = sentence.match(
              /\b\d{1,2}[\s/.-]\w{3,9}[\s/.-]\d{2,4}\b|\b\w{3,9}\s+\d{1,2},?\s*\d{4}\b|\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/i,
            );

            if (dateMatch) {
              const dateText = dateMatch[0].trim();
              // Avoid duplicates
              if (!dates.some((d) => d.text === dateText && d.label === label)) {
                dates.push({
                  label,
                  text: dateText,
                  parsed: this.tryParseDate(dateText),
                });
              }
            }
            break;
          }
        }
      }
    }

    return dates;
  }

  /**
   * Extract and classify obligations/clauses from contract text.
   * Splits text into sentences and classifies each one by type.
   */
  extractObligations(text: string): ObligationResult {
    const sentences = this.tokenizer.tokenize(text) as string[];
    const clauses: ContractClause[] = [];
    const summary: Record<ClauseType, number> = {
      payment_terms: 0,
      penalty: 0,
      termination: 0,
      renewal: 0,
      liability: 0,
      confidentiality: 0,
      general: 0,
    };

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length < 10) continue;

      const classification = this.classifyClause(trimmed);
      clauses.push(classification);
      summary[classification.type]++;
    }

    return { clauses, summary };
  }

  /**
   * Perform risk analysis on a contract.
   * Evaluates the presence/absence of important clause types
   * and identifies specific risk factors.
   */
  riskAnalysis(text: string): RiskAnalysisResult {
    const obligations = this.extractObligations(text);
    const factors: RiskFactor[] = [];
    const recommendations: string[] = [];
    let riskScore = 0;

    // Check for missing important clauses
    if (obligations.summary.termination === 0) {
      factors.push({
        factor: 'Missing termination clause',
        severity: 'high',
        description:
          'No termination clause found. Without clear exit terms, either party may face difficulty ending the agreement.',
      });
      recommendations.push(
        'Add a termination clause specifying conditions, notice period, and consequences.',
      );
      riskScore += 25;
    }

    if (obligations.summary.liability === 0) {
      factors.push({
        factor: 'Missing liability clause',
        severity: 'high',
        description:
          'No liability or indemnification clause found. This leaves parties exposed to unlimited liability.',
      });
      recommendations.push(
        'Add a limitation of liability clause and mutual indemnification terms.',
      );
      riskScore += 25;
    }

    if (obligations.summary.confidentiality === 0) {
      factors.push({
        factor: 'Missing confidentiality clause',
        severity: 'medium',
        description:
          'No confidentiality or non-disclosure terms found. Sensitive information may not be protected.',
      });
      recommendations.push('Consider adding confidentiality provisions or a separate NDA.');
      riskScore += 15;
    }

    if (obligations.summary.payment_terms === 0) {
      factors.push({
        factor: 'Missing payment terms',
        severity: 'medium',
        description:
          'No clear payment terms found. This can lead to disputes about when and how payment is due.',
      });
      recommendations.push(
        'Specify payment amounts, schedule, method, and late payment consequences.',
      );
      riskScore += 15;
    }

    // Check for penalty clauses (not missing, but presence adds risk)
    if (obligations.summary.penalty > 0) {
      const penaltyClauses = obligations.clauses.filter((c) => c.type === 'penalty');
      factors.push({
        factor: 'Penalty clauses present',
        severity: 'medium',
        description: `Found ${penaltyClauses.length} penalty-related clause(s). Review to ensure penalty terms are reasonable and proportionate.`,
      });
      recommendations.push(
        'Review penalty clauses to ensure they are enforceable and proportionate.',
      );
      riskScore += 10;
    }

    // Check for automatic renewal
    if (obligations.summary.renewal > 0) {
      const hasAutoRenewal = obligations.clauses.some(
        (c) =>
          c.type === 'renewal' &&
          (c.text.toLowerCase().includes('automatic') ||
            c.text.toLowerCase().includes('auto-renew') ||
            c.text.toLowerCase().includes('evergreen')),
      );

      if (hasAutoRenewal) {
        factors.push({
          factor: 'Automatic renewal clause',
          severity: 'low',
          description:
            'Contract contains automatic renewal terms. Ensure you track renewal dates to avoid unintended extensions.',
        });
        recommendations.push('Set a calendar reminder before the renewal notice deadline.');
        riskScore += 5;
      }
    }

    // Check contract length / complexity
    const sentences = this.tokenizer.tokenize(text) as string[];
    if (sentences.length < 5) {
      factors.push({
        factor: 'Very short contract',
        severity: 'medium',
        description: 'The contract is unusually short and may lack important provisions.',
      });
      recommendations.push('Review whether all necessary terms and conditions are covered.');
      riskScore += 10;
    }

    // Determine overall risk level
    const overallRisk: 'low' | 'medium' | 'high' =
      riskScore >= 50 ? 'high' : riskScore >= 25 ? 'medium' : 'low';

    // Cap the score at 100
    riskScore = Math.min(riskScore, 100);

    return {
      overallRisk,
      riskScore,
      factors,
      recommendations,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Extract party names from contract text using compromise NLP.
   * Looks for people and organizations and attempts to assign roles.
   */
  private extractParties(text: string): ContractParty[] {
    const doc = nlp(text);
    const parties: ContractParty[] = [];
    const seen = new Set<string>();

    // Extract organizations
    const orgs = doc.organizations().out('array') as string[];
    for (const org of orgs) {
      const trimmed = org.trim();
      if (trimmed.length < 2 || seen.has(trimmed.toLowerCase())) continue;
      seen.add(trimmed.toLowerCase());

      const role = this.inferPartyRole(text, trimmed);
      parties.push({ name: trimmed, role: role || undefined });
    }

    // Extract people (often signatories)
    const people = doc.people().out('array') as string[];
    for (const person of people) {
      const trimmed = person.trim();
      if (trimmed.length < 2 || seen.has(trimmed.toLowerCase())) continue;
      seen.add(trimmed.toLowerCase());

      const role = this.inferPartyRole(text, trimmed);
      parties.push({ name: trimmed, role: role || undefined });
    }

    // Also look for "between X and Y" patterns common in contracts
    const betweenPattern =
      /between\s+["']?([^"']+?)["']?\s+(?:and|&)\s+["']?([^"']+?)["']?\s*(?:[,(.]|$)/gi;
    let match: RegExpExecArray | null;

    while ((match = betweenPattern.exec(text)) !== null) {
      const party1 = match[1].trim();
      const party2 = match[2].trim();

      for (const name of [party1, party2]) {
        if (name.length >= 2 && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          const role = this.inferPartyRole(text, name);
          parties.push({ name, role: role || undefined });
        }
      }
    }

    return parties;
  }

  /**
   * Extract key terms from contract text using TF-IDF.
   * Returns the top 20 terms ordered by TF-IDF score.
   */
  private extractKeyTerms(text: string): KeyTerm[] {
    const tfidf = new natural.TfIdf();
    tfidf.addDocument(text);

    const terms = tfidf.listTerms(0) as Array<{ term: string; tfidf: number }>;

    // Filter out very short terms and common stop words
    const stopWords = new Set([
      'the',
      'and',
      'for',
      'that',
      'this',
      'with',
      'from',
      'shall',
      'will',
      'not',
      'any',
      'all',
      'are',
      'was',
      'were',
      'been',
      'have',
      'has',
      'had',
      'but',
      'its',
      'may',
      'can',
      'such',
      'which',
      'their',
      'other',
      'each',
      'than',
      'upon',
      'into',
    ]);

    return terms
      .filter(
        (t) => t.term.length > 2 && !stopWords.has(t.term.toLowerCase()) && !/^\d+$/.test(t.term),
      )
      .slice(0, 20)
      .map((t) => ({
        term: t.term,
        tfidf: Math.round(t.tfidf * 1000) / 1000,
      }));
  }

  /**
   * Classify a single clause/sentence into a clause type.
   * Checks the sentence against keyword lists for each clause type.
   */
  private classifyClause(sentence: string): ContractClause {
    const lowerSentence = sentence.toLowerCase();
    let bestType: ClauseType = 'general';
    let bestScore = 0;

    for (const [type, keywords] of Object.entries(CLAUSE_KEYWORDS)) {
      let matchCount = 0;
      for (const keyword of keywords) {
        if (lowerSentence.includes(keyword.toLowerCase())) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        // Score is based on how many keywords matched relative to total keywords
        const score = matchCount / keywords.length;
        if (score > bestScore) {
          bestScore = score;
          bestType = type as ClauseType;
        }
      }
    }

    // Confidence: if multiple keywords match, confidence is higher
    const confidence = bestType === 'general' ? 0.1 : Math.min(0.5 + bestScore * 0.5, 1.0);

    return {
      text: sentence,
      type: bestType,
      confidence: Math.round(confidence * 1000) / 1000,
    };
  }

  /**
   * Infer the role of a party based on surrounding context.
   */
  private inferPartyRole(text: string, partyName: string): string | null {
    // Find the sentence containing the party name
    const lowerText = text.toLowerCase();
    const lowerName = partyName.toLowerCase();
    const nameIndex = lowerText.indexOf(lowerName);

    if (nameIndex === -1) return null;

    // Look at a window of text around the party name
    const start = Math.max(0, nameIndex - 100);
    const end = Math.min(text.length, nameIndex + partyName.length + 100);
    const context = lowerText.substring(start, end);

    for (const [role, keywords] of Object.entries(PARTY_ROLE_KEYWORDS)) {
      for (const keyword of keywords) {
        if (context.includes(keyword)) {
          return role;
        }
      }
    }

    return null;
  }

  /**
   * Infer a date label based on surrounding context in the contract text.
   */
  private inferDateLabel(text: string, dateStr: string): string {
    const lowerText = text.toLowerCase();
    const dateIndex = lowerText.indexOf(dateStr.toLowerCase());

    if (dateIndex === -1) return 'date';

    // Look at context before the date
    const contextStart = Math.max(0, dateIndex - 80);
    const context = lowerText.substring(contextStart, dateIndex);

    for (const [label, keywords] of Object.entries(DATE_LABEL_KEYWORDS)) {
      for (const keyword of keywords) {
        if (context.includes(keyword)) {
          return label;
        }
      }
    }

    return 'date';
  }

  /**
   * Attempt to parse a date string into a Date object.
   * Returns null if parsing fails.
   */
  private tryParseDate(dateStr: string): Date | null {
    try {
      const parsed = new Date(dateStr);
      if (isNaN(parsed.getTime())) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
