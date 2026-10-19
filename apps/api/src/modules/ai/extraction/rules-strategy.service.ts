import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createWorker } from 'tesseract.js';
import Decimal from 'decimal.js';
import { accessSync, constants } from 'fs';
import { resolve } from 'path';
import { describeError } from '../../../common/utils/redact';
import { checkTextLimit, IntakeFormatError } from '../intake/format-error';
import { renderPdfPage } from '../utils/pdf-extractor.util';
import { preprocessForOcr } from '../utils/image-preprocessor.util';
import {
  ExtractionContext,
  ExtractionStrategy,
  StrategyExtractionResult,
  CpuDocumentExtractionResult,
} from './extraction-strategy.interface';
import { extractInvoiceFields, RuleField, RulesExtraction } from './rules/invoice-rules-extractor';

const MIN_TEXT_LENGTH = 10;
const WORKER_INIT_TIMEOUT_MS = 30_000;

interface TesseractWorker {
  terminate(): Promise<unknown>;
  recognize(
    buffer: Buffer,
    options?: { rotateAuto: boolean },
  ): Promise<{ data: { text: string; confidence: number } }>;
}

/** Preserve exact money through extraction and JSON transport. */
function money(field: RuleField<Decimal> | null): string | null {
  return field ? field.value.toFixed(4) : null;
}

/** Map rule output onto the shared extraction shape. */
export function toExtractionResult(
  rules: RulesExtraction,
  rawText: string,
  processingTimeMs: number,
): CpuDocumentExtractionResult {
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
export class RulesStrategy implements ExtractionStrategy, OnModuleDestroy {
  readonly name = 'rules' as const;
  private readonly logger = new Logger(RulesStrategy.name);
  private readonly workers = new Map<string, Promise<TesseractWorker>>();
  private readonly recognitionTails = new Map<string, Promise<void>>();

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled(
      [...this.workers.values()].map(async (pending) => (await pending).terminate()),
    );
    this.workers.clear();
    this.recognitionTails.clear();
  }

  canHandle(_context: ExtractionContext): boolean {
    return true;
  }

  async extract(context: ExtractionContext): Promise<StrategyExtractionResult | null> {
    const start = Date.now();
    let text = '';
    let textConfidence = 0;
    let mixedContent = false;

    if (context.documentText !== undefined) {
      text = context.documentText;
      textConfidence = 0.95;
    } else if (context.isPdf) {
      if (context.pdfPages) {
        const parts: string[] = [];
        textConfidence = 0.95;
        for (const page of context.pdfPages) {
          if (page.isNativeText) {
            parts.push(page.text);
          } else {
            const image = await renderPdfPage(context.fileBuffer, page.page);
            const ocr = await this.readCpuImage(
              await preprocessForOcr(image, 'image/png'),
              context.language,
            );
            if (ocr.text.trim().length < MIN_TEXT_LENGTH || ocr.confidence < 40) {
              throw new IntakeFormatError('UNREADABLE');
            }
            // Keep the native evidence even if the OCR misses it. Both sources
            // require review when a page mixes text and raster content.
            if (page.text.trim()) {
              parts.push(page.text);
              mixedContent = true;
            }
            parts.push(ocr.text);
            textConfidence = Math.min(textConfidence, ocr.confidence / 100);
          }
          checkTextLimit(parts.join('\n'));
        }
        text = parts.join('\n');
      } else {
        text = context.pdfText ?? '';
        textConfidence = context.pdfIsNativeText ? 0.95 : 0.3;
      }
    } else {
      try {
        const buffer = await preprocessForOcr(context.fileBuffer, context.mimeType);
        const ocr = await this.readCpuImage(buffer, context.language);
        if (ocr.text.trim().length < MIN_TEXT_LENGTH || ocr.confidence < 40) {
          throw new IntakeFormatError('UNREADABLE');
        }
        text = ocr.text;
        textConfidence = ocr.confidence / 100;
      } catch (error) {
        if (error instanceof IntakeFormatError) throw error;
        this.logger.error(
          `Tesseract OCR failed: ${describeError(error, { includeMessage: false })}`,
        );
        throw new IntakeFormatError('TOOL_UNAVAILABLE');
      }
    }

    checkTextLimit(text);
    if (text.trim().length < MIN_TEXT_LENGTH) {
      throw new IntakeFormatError('UNREADABLE');
    }

    const rules = extractInvoiceFields(text, textConfidence);
    if (mixedContent) rules.warnings.push('PDF_MIXED_CONTENT');
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

  private async readCpuImage(
    imageBuffer: Buffer,
    language: string,
  ): Promise<{ text: string; confidence: number }> {
    try {
      return await this.runTesseract(imageBuffer, language);
    } catch (error) {
      if (error instanceof IntakeFormatError) throw error;
      this.logger.error(`CPU OCR unavailable: ${describeError(error, { includeMessage: false })}`);
      throw new IntakeFormatError('TOOL_UNAVAILABLE');
    }
  }

  private async runTesseract(
    imageBuffer: Buffer,
    language: string,
  ): Promise<{ text: string; confidence: number }> {
    const requestedLanguages = language
      .trim()
      .toLowerCase()
      .replace(/\ben\b/g, 'eng')
      .replace(/\bar\b/g, 'ara')
      .split('+');
    // Only the bundled EN/AR assets are supported. Canonicalize combinations
    // so caller-controlled permutations cannot grow the worker cache.
    if (requestedLanguages.some((lang) => lang !== 'eng' && lang !== 'ara')) {
      throw new IntakeFormatError('UNSUPPORTED_LANGUAGE');
    }
    const lang = ['eng', 'ara'].filter((item) => requestedLanguages.includes(item)).join('+');
    let pending = this.workers.get(lang);
    if (!pending) {
      const tessdataDir = process.env.INTAKE_TESSDATA_DIR;
      if (!tessdataDir) throw new Error('Local OCR assets are required');
      // Resolve as a filesystem path, never a URL: missing local assets must fail offline.
      const localPath = tessdataDir ? resolve(tessdataDir) : undefined;
      if (localPath) {
        for (const assetLanguage of lang.split('+')) {
          if (!/^[a-z][a-z0-9_]*$/.test(assetLanguage)) {
            throw new Error('Invalid OCR language');
          }
          accessSync(resolve(localPath, `${assetLanguage}.traineddata`), constants.R_OK);
        }
      }
      pending = new Promise<TesseractWorker>((done, reject) => {
        let failed = false;
        const fail = () => {
          failed = true;
          clearTimeout(timer);
          reject(new Error('OCR worker initialization failed'));
        };
        const timer = setTimeout(fail, WORKER_INIT_TIMEOUT_MS);
        Promise.resolve()
          .then(() =>
            createWorker(lang, undefined, {
              ...(localPath
                ? {
                    langPath: localPath,
                    cachePath: localPath,
                    cacheMethod: 'readOnly',
                    gzip: false,
                  }
                : {}),
              errorHandler: fail,
            }),
          )
          .then((worker: TesseractWorker) => {
            clearTimeout(timer);
            if (failed) {
              void worker.terminate().catch(() => undefined);
            } else {
              done(worker);
            }
          }, fail);
      });
      this.workers.set(lang, pending);
      void pending.catch(() => this.workers.delete(lang));
    }
    // Tesseract workers accept one recognition at a time. Queue callers sharing a language.
    const operation = (this.recognitionTails.get(lang) ?? Promise.resolve()).then(async () => {
      // A preceding queued recognition may have terminated this worker. Never reuse it.
      if (this.workers.get(lang) !== pending) throw new IntakeFormatError('TOOL_UNAVAILABLE');
      const worker = await pending;
      let timer: NodeJS.Timeout | undefined;
      try {
        const result = await Promise.race([
          worker.recognize(imageBuffer, { rotateAuto: true }),
          new Promise<never>((_done, reject) => {
            timer = setTimeout(() => reject(new IntakeFormatError('TOO_LARGE')), 30_000);
          }),
        ]);
        return { text: result.data.text || '', confidence: result.data.confidence || 0 };
      } catch (error) {
        this.workers.delete(lang);
        await worker.terminate().catch(() => undefined);
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
      }
    });
    this.recognitionTails.set(
      lang,
      operation.then(
        () => undefined,
        () => undefined,
      ),
    );
    return operation;
  }
}
