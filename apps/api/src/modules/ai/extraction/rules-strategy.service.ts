import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { resolve } from 'path';
import { describeError } from '../../../common/utils/redact';
import { DocumentExtractionResult } from '../services/ollama.service';
import { preprocessForOcr } from '../utils/image-preprocessor.util';
import {
  ExtractionContext,
  ExtractionStrategy,
  StrategyExtractionResult,
} from './extraction-strategy.interface';
import { extractInvoiceFields, RuleField, RulesExtraction } from './rules/invoice-rules-extractor';

const MIN_TEXT_LENGTH = 10;

interface TesseractWorker {
  recognize(buffer: Buffer): Promise<{ data: { text: string; confidence: number } }>;
}

/** Decimal -> number only at the legacy extraction-result boundary (4 dp). */
function money(field: RuleField<Decimal> | null): number | null {
  return field ? Number(field.value.toFixed(4)) : null;
}

/** Map rule output onto the shared extraction shape. */
export function toExtractionResult(
  rules: RulesExtraction,
  rawText: string,
  processingTimeMs: number,
): DocumentExtractionResult {
  const fieldConfidence: Record<string, number> = {};
  const fieldEvidence: Record<string, { text: string; lineIndex: number }> = {};
  const entries: Array<[string, RuleField<unknown> | null]> = [
    ['invoiceNumber', rules.invoiceNumber],
    ['date', rules.date],
    ['dueDate', rules.dueDate],
    ['vendorName', rules.vendorName],
    ['vendorTaxId', rules.vendorTaxId],
    ['subtotal', rules.subtotal],
    ['tax', rules.tax],
    ['total', rules.total],
    ['currency', rules.currency],
  ];
  for (const [name, field] of entries) {
    if (!field) continue;
    fieldConfidence[name] = field.confidence;
    fieldEvidence[name] = field.evidence;
  }
  return {
    vendorName: rules.vendorName?.value ?? null,
    vendorAddress: null,
    vendorPhone: null,
    vendorEmail: null,
    vendorTaxId: rules.vendorTaxId?.value ?? null,
    invoiceNumber: rules.invoiceNumber?.value ?? null,
    date: rules.date?.value ?? null,
    dueDate: rules.dueDate?.value ?? null,
    total: money(rules.total),
    subtotal: money(rules.subtotal),
    tax: money(rules.tax),
    discount: null,
    currency: rules.currency?.value ?? null,
    paymentTerms: null,
    notes: null,
    lineItems: [],
    rawText,
    ocrConfidence: rules.overallConfidence,
    fieldConfidence,
    fieldEvidence,
    extractionWarnings: rules.warnings,
    documentCategory: null,
    accountingEntry: null,
    processingTimeMs,
  };
}

/**
 * CPU-only, no-LLM extraction: PDF text layer or Tesseract OCR, then the
 * deterministic rule extractor. Works with every AI endpoint unreachable.
 */
@Injectable()
export class RulesStrategy implements ExtractionStrategy {
  readonly name = 'rules' as const;
  private readonly logger = new Logger(RulesStrategy.name);
  private readonly workers = new Map<string, Promise<TesseractWorker>>();

  canHandle(_context: ExtractionContext): boolean {
    return true;
  }

  async extract(context: ExtractionContext): Promise<StrategyExtractionResult | null> {
    const start = Date.now();
    let text = '';
    let textConfidence = 0;

    if (context.isPdf) {
      text = context.pdfText ?? '';
      textConfidence = context.pdfIsNativeText ? 0.95 : 0.3;
    } else {
      try {
        const buffer = await preprocessForOcr(context.fileBuffer, context.mimeType).catch(
          () => context.fileBuffer,
        );
        const ocr = await this.runTesseract(buffer, context.language);
        text = ocr.text;
        textConfidence = ocr.confidence / 100;
      } catch (error) {
        this.logger.error(`Tesseract OCR failed: ${describeError(error)}`);
      }
    }

    if (text.trim().length < MIN_TEXT_LENGTH) {
      this.logger.warn('Rules strategy: no usable text');
      return null;
    }

    const rules = extractInvoiceFields(text, textConfidence);
    // Metadata only: text, amounts and tax ids are document content.
    this.logger.log(
      `Rules extraction: textLen=${text.length} textConfidence=${textConfidence.toFixed(2)} ` +
        `confidence=${rules.overallConfidence} warnings=${rules.warnings.join(',') || 'none'}`,
    );
    const elapsed = Date.now() - start;
    return {
      extraction: toExtractionResult(rules, text, elapsed),
      strategyUsed: 'rules',
      ocrRawConfidence: textConfidence * 100,
      totalTimeMs: elapsed,
    };
  }

  private async runTesseract(
    imageBuffer: Buffer,
    language: string,
  ): Promise<{ text: string; confidence: number }> {
    const lang = language
      .trim()
      .toLowerCase()
      .replace(/\ben\b/g, 'eng')
      .replace(/\bar\b/g, 'ara');
    let pending = this.workers.get(lang);
    if (!pending) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Tesseract = require('tesseract.js');
      const tessdataDir = process.env.INTAKE_TESSDATA_DIR;
      // Resolve as a filesystem path, never a URL: missing local assets must fail offline.
      const localPath = tessdataDir ? resolve(tessdataDir) : undefined;
      pending = Tesseract.createWorker(
        lang,
        undefined,
        localPath
          ? {
              langPath: localPath,
              cachePath: localPath,
              cacheMethod: 'readOnly',
              gzip: false,
            }
          : undefined,
      ) as Promise<TesseractWorker>;
      this.workers.set(lang, pending);
      void pending.catch(() => this.workers.delete(lang));
    }
    const result = await (await pending).recognize(imageBuffer);
    return { text: result.data.text || '', confidence: result.data.confidence || 0 };
  }
}
