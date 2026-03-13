import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { buildEntityExtractionPrompt } from '../prompts/nlp.prompts';
import { PredictionMethod } from '../types/prediction-method.type';
import { findBestMatch } from '../utils/text-similarity.util';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nlp = require('compromise');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const compromiseDates = require('compromise-dates');
nlp.plugin(compromiseDates);

/**
 * Types of entities that can be extracted from text.
 */
export type EntityType = 'person' | 'organization' | 'date' | 'place' | 'money' | 'email' | 'phone';

export interface ExtractedEntity {
  text: string;
  type: EntityType;
  start?: number;
  end?: number;
}

export interface ExtractionResult {
  people: ExtractedEntity[];
  organizations: ExtractedEntity[];
  dates: ExtractedEntity[];
  places: ExtractedEntity[];
  money: ExtractedEntity[];
  emails: ExtractedEntity[];
  phones: ExtractedEntity[];
  predictionMethod?: PredictionMethod;
}

export interface MatchedEntity {
  entity: ExtractedEntity;
  matchType: 'customer' | 'vendor';
  matchedName: string;
  matchedId: string;
  similarity: number;
}

export interface ExtractionAndMatchResult {
  entities: ExtractionResult;
  matches: MatchedEntity[];
  predictionMethod?: PredictionMethod;
}

/** Type for a compromise NLP document */
type NlpDocument = ReturnType<typeof nlp>;

/** Minimum similarity threshold for entity matching */
const MATCH_THRESHOLD = 0.6;

/** Regex patterns for structured entity extraction */
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/g;
const MONEY_REGEX =
  /(?:[$\u00A3\u20AC\u00A5]|USD|EUR|GBP|SAR|AED|EGP)\s?[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s?(?:USD|EUR|GBP|SAR|AED|EGP|dollars?|pounds?|euros?)/gi;

@Injectable()
export class EntityExtractionService {
  private readonly logger = new Logger(EntityExtractionService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: OllamaInferenceGateway,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Extract named entities from raw text (async).
   * Tries Ollama first; falls back to compromise + regex.
   */
  async extractEntitiesAsync(text: string): Promise<ExtractionResult> {
    if (!text || text.trim().length === 0) {
      return this.emptyResult();
    }

    // --- Ollama-first inference path ---
    try {
      const prompt = buildEntityExtractionPrompt(text);
      const ollamaResult = await this.gateway.infer<{
        people: string[];
        organizations: string[];
        dates: string[];
        places: string[];
        money: Array<{ amount: number; currency: string }>;
        emails: string[];
        phones: string[];
      }>(prompt);

      if (ollamaResult) {
        const d = ollamaResult.data;
        const result: ExtractionResult = {
          people: (d.people || []).map((t) => ({ text: t, type: 'person' as const })),
          organizations: (d.organizations || []).map((t) => ({
            text: t,
            type: 'organization' as const,
          })),
          dates: (d.dates || []).map((t) => ({ text: t, type: 'date' as const })),
          places: (d.places || []).map((t) => ({ text: t, type: 'place' as const })),
          money: (d.money || []).map((m) => ({
            text: `${m.currency} ${m.amount}`,
            type: 'money' as const,
          })),
          emails: (d.emails || []).map((t) => ({ text: t, type: 'email' as const })),
          phones: (d.phones || []).map((t) => ({ text: t, type: 'phone' as const })),
          predictionMethod: 'OLLAMA',
        };

        return result;
      }
    } catch (error) {
      this.logger.warn(
        `Ollama entity extraction failed, falling back to compromise/regex: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // --- Existing compromise + regex fallback ---
    return { ...this.extractEntities(text), predictionMethod: 'RULE_BASED' };
  }

  /**
   * Extract named entities from raw text.
   * Uses `compromise` NLP for people, organizations, dates, and places.
   * Uses regex patterns for emails, phones, and monetary amounts.
   */
  extractEntities(text: string): ExtractionResult {
    if (!text || text.trim().length === 0) {
      return this.emptyResult();
    }

    const doc = nlp(text);

    const people = this.extractPeople(doc, text);
    const organizations = this.extractOrganizations(doc, text);
    const dates = this.extractDates(doc, text);
    const places = this.extractPlaces(doc, text);
    const money = this.extractMoney(text);
    const emails = this.extractEmails(text);
    const phones = this.extractPhones(text);

    return {
      people,
      organizations,
      dates,
      places,
      money,
      emails,
      phones,
    };
  }

  /**
   * Extract entities from text and match extracted people/organizations
   * against existing Customer and Vendor records in the database.
   * Uses fuzzy string matching via `findBestMatch` from text-similarity util.
   */
  async extractAndMatch(organizationId: string, text: string): Promise<ExtractionAndMatchResult> {
    const entities = await this.extractEntitiesAsync(text);
    const matches: MatchedEntity[] = [];

    // Fetch all customer and vendor names for matching
    const [customers, vendors] = await Promise.all([
      this.prisma.customer.findMany({
        where: { organizationId },
        select: { id: true, name: true, displayName: true },
      }),
      this.prisma.vendor.findMany({
        where: { organizationId },
        select: { id: true, name: true, displayName: true },
      }),
    ]);

    const customerNames = customers.map((c) => c.displayName || c.name);
    const vendorNames = vendors.map((v) => v.displayName || v.name);

    // Match extracted people against customers and vendors
    for (const person of entities.people) {
      const customerMatch = this.matchEntity(person, customerNames, customers, 'customer');
      if (customerMatch) {
        matches.push(customerMatch);
        continue;
      }

      const vendorMatch = this.matchEntity(person, vendorNames, vendors, 'vendor');
      if (vendorMatch) {
        matches.push(vendorMatch);
      }
    }

    // Match extracted organizations against customers and vendors
    for (const org of entities.organizations) {
      const customerMatch = this.matchEntity(org, customerNames, customers, 'customer');
      if (customerMatch) {
        matches.push(customerMatch);
        continue;
      }

      const vendorMatch = this.matchEntity(org, vendorNames, vendors, 'vendor');
      if (vendorMatch) {
        matches.push(vendorMatch);
      }
    }

    // Deduplicate matches by matchedId
    const uniqueMatches = this.deduplicateMatches(matches);

    return {
      entities,
      matches: uniqueMatches,
      predictionMethod: entities.predictionMethod,
    };
  }

  // ---------------------------------------------------------------------------
  // Private extraction helpers
  // ---------------------------------------------------------------------------

  /**
   * Extract person names using compromise NLP.
   */
  private extractPeople(doc: NlpDocument, originalText: string): ExtractedEntity[] {
    const people: ExtractedEntity[] = [];
    const found = doc.people().out('array') as string[];

    for (const name of found) {
      const trimmed = name.trim();
      if (trimmed.length < 2) continue;

      const position = this.findPosition(originalText, trimmed);
      people.push({
        text: trimmed,
        type: 'person',
        ...position,
      });
    }

    return this.deduplicateEntities(people);
  }

  /**
   * Extract organization names using compromise NLP.
   */
  private extractOrganizations(doc: NlpDocument, originalText: string): ExtractedEntity[] {
    const orgs: ExtractedEntity[] = [];
    const found = doc.organizations().out('array') as string[];

    for (const orgName of found) {
      const trimmed = orgName.trim();
      if (trimmed.length < 2) continue;

      const position = this.findPosition(originalText, trimmed);
      orgs.push({
        text: trimmed,
        type: 'organization',
        ...position,
      });
    }

    return this.deduplicateEntities(orgs);
  }

  /**
   * Extract dates using regex (compromise core has no .dates() plugin).
   */
  private extractDates(doc: NlpDocument, originalText: string): ExtractedEntity[] {
    const dates: ExtractedEntity[] = [];
    const dateRegex =
      /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s*\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b/gi;
    const found: string[] = originalText.match(dateRegex) || [];

    for (const dateStr of found) {
      const trimmed = dateStr.trim();
      if (trimmed.length < 3) continue;

      const position = this.findPosition(originalText, trimmed);
      dates.push({
        text: trimmed,
        type: 'date',
        ...position,
      });
    }

    // Also extract ISO-style dates via regex that compromise might miss
    const isoDateRegex = /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g;
    let match: RegExpExecArray | null;
    while ((match = isoDateRegex.exec(originalText)) !== null) {
      const dateText = match[0];
      // Avoid duplicating dates already found by compromise
      if (!dates.some((d) => d.text === dateText)) {
        dates.push({
          text: dateText,
          type: 'date',
          start: match.index,
          end: match.index + dateText.length,
        });
      }
    }

    return this.deduplicateEntities(dates);
  }

  /**
   * Extract place names using compromise NLP.
   */
  private extractPlaces(doc: NlpDocument, originalText: string): ExtractedEntity[] {
    const places: ExtractedEntity[] = [];
    const found = doc.places().out('array') as string[];

    for (const place of found) {
      const trimmed = place.trim();
      if (trimmed.length < 2) continue;

      const position = this.findPosition(originalText, trimmed);
      places.push({
        text: trimmed,
        type: 'place',
        ...position,
      });
    }

    return this.deduplicateEntities(places);
  }

  /**
   * Extract monetary amounts using regex.
   */
  private extractMoney(text: string): ExtractedEntity[] {
    const money: ExtractedEntity[] = [];
    let match: RegExpExecArray | null;
    const regex = new RegExp(MONEY_REGEX.source, MONEY_REGEX.flags);

    while ((match = regex.exec(text)) !== null) {
      money.push({
        text: match[0].trim(),
        type: 'money',
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    return this.deduplicateEntities(money);
  }

  /**
   * Extract email addresses using regex.
   */
  private extractEmails(text: string): ExtractedEntity[] {
    const emails: ExtractedEntity[] = [];
    let match: RegExpExecArray | null;
    const regex = new RegExp(EMAIL_REGEX.source, EMAIL_REGEX.flags);

    while ((match = regex.exec(text)) !== null) {
      emails.push({
        text: match[0],
        type: 'email',
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    return this.deduplicateEntities(emails);
  }

  /**
   * Extract phone numbers using regex.
   * Filters out numbers that are too short to be valid phone numbers.
   */
  private extractPhones(text: string): ExtractedEntity[] {
    const phones: ExtractedEntity[] = [];
    let match: RegExpExecArray | null;
    const regex = new RegExp(PHONE_REGEX.source, PHONE_REGEX.flags);

    while ((match = regex.exec(text)) !== null) {
      const phoneText = match[0].trim();
      // Filter out numbers that are too short (likely not phone numbers)
      const digitsOnly = phoneText.replace(/\D/g, '');
      if (digitsOnly.length < 7) continue;

      phones.push({
        text: phoneText,
        type: 'phone',
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    return this.deduplicateEntities(phones);
  }

  // ---------------------------------------------------------------------------
  // Matching helpers
  // ---------------------------------------------------------------------------

  /**
   * Try to match an extracted entity against a list of known names.
   */
  private matchEntity(
    entity: ExtractedEntity,
    names: string[],
    records: Array<{ id: string; name: string; displayName?: string | null }>,
    matchType: 'customer' | 'vendor',
  ): MatchedEntity | null {
    if (names.length === 0) return null;

    const result = findBestMatch(entity.text, names, MATCH_THRESHOLD);

    if (!result.match || result.index < 0) {
      return null;
    }

    const matchedRecord = records[result.index];

    return {
      entity,
      matchType,
      matchedName: result.match,
      matchedId: matchedRecord.id,
      similarity: Math.round(result.similarity * 1000) / 1000,
    };
  }

  // ---------------------------------------------------------------------------
  // Utility helpers
  // ---------------------------------------------------------------------------

  /**
   * Find the start and end position of a substring in the original text.
   */
  private findPosition(text: string, substring: string): { start?: number; end?: number } {
    const index = text.indexOf(substring);
    if (index === -1) {
      // Try case-insensitive search
      const lowerIndex = text.toLowerCase().indexOf(substring.toLowerCase());
      if (lowerIndex === -1) return {};
      return { start: lowerIndex, end: lowerIndex + substring.length };
    }
    return { start: index, end: index + substring.length };
  }

  /**
   * Remove duplicate entities (same text and type).
   */
  private deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    const seen = new Set<string>();
    return entities.filter((e) => {
      const key = `${e.type}:${e.text.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Remove duplicate matches (same matchedId).
   * Keeps the match with the highest similarity score.
   */
  private deduplicateMatches(matches: MatchedEntity[]): MatchedEntity[] {
    const bestByKey = new Map<string, MatchedEntity>();

    for (const match of matches) {
      const key = `${match.matchType}:${match.matchedId}`;
      const existing = bestByKey.get(key);
      if (!existing || match.similarity > existing.similarity) {
        bestByKey.set(key, match);
      }
    }

    return [...bestByKey.values()];
  }

  /**
   * Return an empty extraction result.
   */
  private emptyResult(): ExtractionResult {
    return {
      people: [],
      organizations: [],
      dates: [],
      places: [],
      money: [],
      emails: [],
      phones: [],
    };
  }
}
