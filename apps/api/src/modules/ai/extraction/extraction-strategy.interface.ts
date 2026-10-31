import { DocumentExtractionResult } from './extraction-result';

/** Readers: the CPU rules reader, or the organization's own AI provider. */
export type ExtractionStrategyName = 'ai' | 'rules';

/** Context passed to every reader. */
export interface ExtractionContext {
  fileBuffer: Buffer;
  mimeType: string;
  filename?: string;
  /** OCR languages, e.g. 'ara+en' */
  language: string;
  isPdf: boolean;
  /** For PDFs: raw text from pdf-parse */
  pdfText?: string;
  /** true if PDF has native embedded text (not a scanned image) */
  pdfIsNativeText?: boolean;
  pdfPageCount?: number;
}

/** Result wrapper with metadata about which reader produced it. */
export interface StrategyExtractionResult {
  extraction: DocumentExtractionResult;
  strategyUsed: ExtractionStrategyName;
  /** OCR confidence (0-100), if OCR was used */
  ocrRawConfidence?: number;
  /** Total wall-clock time for the reader */
  totalTimeMs: number;
}

/** Interface that every reader implements. */
export interface ExtractionStrategy {
  readonly name: ExtractionStrategyName;

  /** Returns true if this reader can handle the given context. */
  canHandle(context: ExtractionContext): boolean;

  /** Execute the extraction. Returns null if extraction fails. */
  extract(context: ExtractionContext): Promise<StrategyExtractionResult | null>;
}
