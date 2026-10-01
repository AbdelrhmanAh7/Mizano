/**
 * PaddleOCR Cloud API service — calls Baidu AIStudio's PaddleOCR endpoint.
 *
 * Uses the hosted PP-OCRv5 model (109 languages, including Arabic).
 * Much more accurate than local ONNX inference.
 *
 * Setup:
 *  1. Go to https://aistudio.baidu.com/paddleocr/task
 *  2. Get your API_URL and TOKEN
 *  3. Set PADDLE_OCR_API_URL and PADDLE_OCR_API_TOKEN in .env.local
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { describeError, redactText } from '../../../common/utils/redact';

export interface PaddleOcrApiResult {
  text: string;
  confidence: number;
  processingTimeMs: number;
  markdown?: string;
}

@Injectable()
export class PaddleOcrApiService {
  private readonly logger = new Logger(PaddleOcrApiService.name);

  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly timeoutMs: number;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.apiUrl = this.configService.get<string>('PADDLE_OCR_API_URL', '');
    this.apiToken = this.configService.get<string>('PADDLE_OCR_API_TOKEN', '');
    this.timeoutMs = parseInt(
      this.configService.get<string>('PADDLE_OCR_API_TIMEOUT_MS', '60000'),
      10,
    );

    if (this.apiUrl && this.apiToken) {
      this.logger.log('PaddleOCR Cloud API configured');
    } else {
      this.logger.warn(
        'PaddleOCR Cloud API not configured. Set PADDLE_OCR_API_URL and PADDLE_OCR_API_TOKEN in .env.local. ' +
          'Get them from https://aistudio.baidu.com/paddleocr/task',
      );
    }
  }

  /** Check if the cloud API is configured. */
  isAvailable(): boolean {
    return Boolean(this.apiUrl && this.apiToken);
  }

  /**
   * Recognize text from an image buffer using the PaddleOCR Cloud API.
   */
  async recognize(imageBuffer: Buffer): Promise<PaddleOcrApiResult> {
    const startTime = Date.now();

    if (!this.isAvailable()) {
      return { text: '', confidence: 0, processingTimeMs: 0 };
    }

    const base64 = imageBuffer.toString('base64');

    this.logger.log(
      `[API] Sending image to PaddleOCR Cloud (${(base64.length / 1024).toFixed(0)}KB base64)...`,
    );

    try {
      const response = await lastValueFrom(
        this.httpService.post(
          this.apiUrl,
          {
            file: base64,
            fileType: 1, // 1 = image
            useDocOrientationClassify: true,
            useDocUnwarping: false,
          },
          {
            headers: {
              Authorization: `token ${this.apiToken}`,
              'Content-Type': 'application/json',
            },
            timeout: this.timeoutMs,
          },
        ),
      );

      const processingTimeMs = Date.now() - startTime;
      const data = response.data;

      if (data.errorCode !== 0) {
        this.logger.error(
          `[API] PaddleOCR API error: code=${data.errorCode}, msg=${redactText(String(data.errorMsg ?? ''), 200)}`,
        );
        return { text: '', confidence: 0, processingTimeMs };
      }

      // Extract text from layout parsing results
      const results = data.result?.layoutParsingResults || [];
      const markdownTexts: string[] = [];

      for (const page of results) {
        const md = page?.markdown?.text || '';
        if (md) markdownTexts.push(md);
      }

      const fullText = markdownTexts.join('\n\n');

      // Also try ocrResults if available (plain OCR without layout)
      let plainText = fullText;
      if (!plainText && data.result?.ocrResults) {
        const ocrLines: string[] = [];
        for (const page of data.result.ocrResults) {
          if (Array.isArray(page)) {
            for (const line of page) {
              if (line?.text) ocrLines.push(line.text);
            }
          }
        }
        plainText = ocrLines.join('\n');
      }

      const confidence = plainText.length > 0 ? 95 : 0; // Cloud API is high quality

      this.logger.log(
        `[API] PaddleOCR Cloud result: textLen=${plainText.length}, time=${processingTimeMs}ms`,
      );

      return {
        text: plainText,
        confidence,
        processingTimeMs,
        markdown: fullText || undefined,
      };
    } catch (err) {
      const processingTimeMs = Date.now() - startTime;
      this.logger.error(`[API] PaddleOCR Cloud API call failed: ${describeError(err)}`);
      return { text: '', confidence: 0, processingTimeMs };
    }
  }
}
