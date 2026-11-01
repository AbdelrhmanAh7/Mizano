import { AiErrorCode } from '../account/ai-features';
import { DocumentExtractionResult } from './extraction-result';

/** Readers: the CPU rules reader, or the organization's own AI provider. */
export type ExtractionStrategyName = 'ai' | 'rules';

/** Why the CPU reader ran: an AI error code, or one of these two. */
export type ReaderFallbackReason = AiErrorCode | 'AI_OFF' | 'RULES_ONLY';

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
  /** AI reading: which provider and model read the document. */
  provider?: string;
  model?: string;
  /** Rules reading: why the AI did not read it (an AiErrorCode, or a reason below). */
  fallbackReason?: ReaderFallbackReason;
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
