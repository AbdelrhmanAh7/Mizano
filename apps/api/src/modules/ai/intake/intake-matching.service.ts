import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { DocumentIntakeResult, VendorCandidate } from '../services/document-intake.service';
import { levenshteinSimilarity, normalizeText } from '../utils/text-similarity.util';

/** Same thresholds as the legacy in-process pipeline. */
const CANDIDATE_THRESHOLD = 0.4;
const MATCH_THRESHOLD = 0.6;
const MAX_CANDIDATES = 5;
/** Bounds the quadratic edit-distance work, which runs on the worker's event loop. */
const MAX_NAME_CHARS = 200;
const AMOUNT_TOLERANCE = new Prisma.Decimal('0.01');
const DUPLICATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type DuplicateWarning = NonNullable<DocumentIntakeResult['duplicateWarning']>;

interface VendorMatch {
  vendorCandidates: VendorCandidate[];
  matchedVendor: VendorCandidate | null;
  /** At least two vendors tie for the best, strong similarity, so none is matched. */
  ambiguous: boolean;
}

/**
 * Tenant-scoped, read-only matching for the dedicated worker. It needs the database, so it runs
 * in the worker process after the extraction child has closed. No model or AI module is involved:
 * vendors are matched on the extracted name alone (the legacy pipeline also used NLP entity
 * matches, which need the model gateway). Customers are not matched: the rules extract no
 * customer, and the accountant flow is purchase invoices.
 */
@Injectable()
export class IntakeMatchingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fills the vendor candidates, the matched vendor, the duplicate warning and the create-vendor
   * suggestion of an extraction result. Whatever the child claimed for these fields is replaced:
   * only the database decides.
   */
  async enrich(
    organizationId: string,
    extracted: DocumentIntakeResult,
  ): Promise<DocumentIntakeResult> {
    const fields = extracted.extractedFields;
    // A name that normalizes to nothing (blank, symbols only) is not a vendor name at all.
    const vendorName = typeof fields.vendorName === 'string' ? fields.vendorName.trim() : '';
    const target = normalizeText(vendorName.slice(0, MAX_NAME_CHARS));
    const { vendorCandidates, matchedVendor, ambiguous } = await this.matchVendors(
      organizationId,
      target,
    );
    const duplicateWarning =
      matchedVendor && (fields.documentNumber || fields.total)
        ? await this.findDuplicate(
            organizationId,
            matchedVendor.id,
            fields.documentNumber,
            fields.total,
          )
        : null;
    return {
      ...extracted,
      matchedVendor,
      vendorCandidates,
      matchedCustomer: null,
      customerCandidates: [],
      duplicateWarning,
      // Never suggest a new vendor next to an existing one the accountant has to choose between.
      suggestCreateVendor:
        target && !matchedVendor && !ambiguous
          ? {
              name: vendorName,
              address: fields.vendorAddress,
              phone: fields.vendorPhone,
              email: fields.vendorEmail,
              taxId: fields.vendorTaxId,
            }
          : null,
    };
  }

  /**
   * One clear best candidate at or above the match threshold becomes the matched vendor. Two
   * vendors with the same best similarity are ambiguous: both stay candidates and nothing is
   * matched, because a guess would pick the supplier of a bill that a batch approval posts.
   */
  private async matchVendors(organizationId: string, target: string): Promise<VendorMatch> {
    if (!target) return { vendorCandidates: [], matchedVendor: null, ambiguous: false };

    const vendors = await this.prisma.vendor.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true, displayName: true },
    });
    const candidates: VendorCandidate[] = [];
    for (const vendor of vendors) {
      const name = vendor.displayName || vendor.name;
      const normalized = normalizeText(name.slice(0, MAX_NAME_CHARS));
      // Two names that normalize to nothing compare as identical, which is not a match.
      if (!normalized) continue;
      const similarity = levenshteinSimilarity(target, normalized);
      if (similarity >= CANDIDATE_THRESHOLD) {
        candidates.push({ id: vendor.id, name, similarity: Math.round(similarity * 1000) / 1000 });
      }
    }
    candidates.sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id));

    const [best, second] = candidates;
    const strong = best !== undefined && best.similarity >= MATCH_THRESHOLD;
    const ambiguous = strong && second !== undefined && second.similarity === best.similarity;
    return {
      vendorCandidates: candidates.slice(0, MAX_CANDIDATES),
      matchedVendor: strong && !ambiguous ? best : null,
      ambiguous,
    };
  }

  /** The vendor's own bill with the same number, else a recent bill with the same amount. */
  private async findDuplicate(
    organizationId: string,
    vendorId: string,
    documentNumber: string | null,
    total: string | null,
  ): Promise<DuplicateWarning | null> {
    if (documentNumber) {
      const existing = await this.prisma.bill.findFirst({
        where: { organizationId, vendorId, billNumber: documentNumber, deletedAt: null },
        select: { id: true },
      });
      if (existing) {
        return {
          isDuplicate: true,
          existingId: existing.id,
          matchType: 'exact_number',
          similarity: 1.0,
        };
      }
    }

    // `total` is the 4-dp string of the result boundary: compare as Decimal, not float.
    if (typeof total === 'string' && total.trim() !== '') {
      const amount = new Prisma.Decimal(total);
      if (amount.gt(0) && amount.isFinite()) {
        const recent = await this.prisma.bill.findMany({
          where: {
            organizationId,
            vendorId,
            deletedAt: null,
            createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
          },
          select: { id: true, grandTotal: true },
        });
        const same = recent.find((bill) => bill.grandTotal.sub(amount).abs().lt(AMOUNT_TOLERANCE));
        if (same) {
          return {
            isDuplicate: true,
            existingId: same.id,
            matchType: 'amount_match',
            similarity: 0.9,
          };
        }
      }
    }
    return null;
  }
}
