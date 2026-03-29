import { Injectable, Logger } from '@nestjs/common';
import {
  ExtractionStrategy,
  ExtractionContext,
  StrategyExtractionResult,
} from './extraction-strategy.interface';
import { OllamaService } from '../services/ollama.service';
import { PaddleOcrService } from '../services/paddle-ocr.service';

/**
 * VLM Strategy — sends image directly to Ollama vision model (qwen3-vl:8b).
 *
 * For PDFs: converts the first page to an image via PyMuPDF, then sends it.
 * Best quality for handwritten text, poor scans, and complex layouts.
 */
@Injectable()
export class VlmStrategy implements ExtractionStrategy {
  readonly name = 'vlm' as const;
  private readonly logger = new Logger(VlmStrategy.name);

  constructor(
    private readonly ollamaService: OllamaService,
    private readonly paddleOcrService: PaddleOcrService,
  ) {}

  canHandle(context: ExtractionContext): boolean {
    // Images: always supported
    if (!context.isPdf) return true;
    // PDFs: supported only if PyMuPDF can render pages to images
    return this.paddleOcrService.canRenderPdf();
  }

  async extract(context: ExtractionContext): Promise<StrategyExtractionResult | null> {
    const startTime = Date.now();

    let imageBuffer = context.fileBuffer;
    let mimeType = context.mimeType;

    // For PDFs, convert the first page to an image
    if (context.isPdf) {
      this.logger.log('VLM: converting PDF first page to image...');
      const pageImage = await this.paddleOcrService.pdfPageToImage(context.fileBuffer, 0, 300);
      if (!pageImage) {
        this.logger.warn('VLM: failed to convert PDF page to image');
        return null;
      }
      imageBuffer = pageImage;
      mimeType = 'image/png';
      this.logger.log(`VLM: PDF page rendered — ${(pageImage.length / 1024).toFixed(0)}KB PNG`);
    }

    this.logger.log(`VLM extraction: mime=${mimeType}, size=${imageBuffer.length}`);

    const extraction = await this.ollamaService.extractFromImageVision(
      imageBuffer,
      mimeType,
      context.modelOverride,
    );

    if (!extraction) {
      this.logger.warn('VLM extraction returned null');
      return null;
    }

    return {
      extraction,
      strategyUsed: 'vlm',
      totalTimeMs: Date.now() - startTime,
    };
  }
}
