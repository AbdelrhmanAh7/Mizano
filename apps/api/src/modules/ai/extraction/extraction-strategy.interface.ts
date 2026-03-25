import { DocumentExtractionResult } from '../services/ollama.service';

/** Strategy names for document extraction. */
export type ExtractionStrategyName = 'vlm' | 'ocr-llm' | 'hybrid';

/** Configurable strategy selection (includes auto mode). */
export type ExtractionStrategyOption = ExtractionStrategyName | 'auto';

/** Context passed to every extraction strategy. */
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

/** Sub-path taken within a composite strategy. */
export type ExtractionSubPath = 'ocr-fast' | 'vlm-fallback';

/** Result wrapper with metadata about which strategy was used. */
export interface StrategyExtractionResult {
  extraction: DocumentExtractionResult;
  strategyUsed: ExtractionStrategyName;
  /** For hybrid: which sub-path was taken */
  subPathUsed?: ExtractionSubPath;
  /** OCR confidence from PaddleOCR (0-100), if OCR was used */
  ocrRawConfidence?: number;
  /** Total wall-clock time for the strategy */
  totalTimeMs: number;
}

/** Interface that all extraction strategies must implement. */
export interface ExtractionStrategy {
  readonly name: ExtractionStrategyName;

  /** Returns true if this strategy can handle the given context. */
  canHandle(context: ExtractionContext): boolean;

  /** Execute the extraction. Returns null if extraction fails. */
  extract(context: ExtractionContext): Promise<StrategyExtractionResult | null>;
}
