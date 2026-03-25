/**
 * PaddleOCR service — calls the Python `paddleocr` package via subprocess.
 *
 * This gives identical results to https://aistudio.baidu.com/paddleocr
 * because it uses the exact same models and preprocessing code.
 *
 * Setup: pip install paddleocr
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OcrRegion {
  text: string;
  bbox: [number, number, number, number];
  confidence: number;
}

export interface OcrResult {
  text: string;
  confidence: number;
  regions: OcrRegion[];
  processingTimeMs: number;
}

// ---------------------------------------------------------------------------
// Python script that runs PaddleOCR and outputs JSON
// ---------------------------------------------------------------------------

const PYTHON_SCRIPT = `
import sys, json
from rapidocr_onnxruntime import RapidOCR

img_path = sys.argv[1]
engine = RapidOCR()
result, elapse = engine(img_path)

output = {"regions": [], "text": "", "confidence": 0}

if result:
    lines = []
    total_conf = 0
    count = 0
    for item in result:
        bbox_pts, text, score = item
        conf = float(score) if score else 0.0
        x_coords = [p[0] for p in bbox_pts]
        y_coords = [p[1] for p in bbox_pts]
        bbox = [int(min(x_coords)), int(min(y_coords)),
                int(max(x_coords) - min(x_coords)), int(max(y_coords) - min(y_coords))]
        output["regions"].append({
            "text": text,
            "bbox": bbox,
            "confidence": round(conf * 100, 1)
        })
        lines.append(text)
        total_conf += conf
        count += 1
    output["text"] = "\\n".join(lines)
    output["confidence"] = round((total_conf / count) * 100, 1) if count > 0 else 0

print(json.dumps(output, ensure_ascii=False))
`;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class PaddleOcrService implements OnModuleInit {
  private readonly logger = new Logger(PaddleOcrService.name);

  private readonly pythonPath: string;
  private readonly defaultLang: string;
  private readonly timeoutMs: number;
  private scriptPath: string = '';
  private available = false;

  private readonly pythonPkgPath: string;

  constructor(private configService: ConfigService) {
    this.pythonPath = this.configService.get<string>('PYTHON_PATH', 'python');
    this.pythonPkgPath = this.configService.get<string>('PADDLE_OCR_PKG_PATH', 'C:/paddleocr_pkg');
    this.defaultLang = this.configService.get<string>('PADDLE_OCR_LANG', 'ar');
    this.timeoutMs = parseInt(
      this.configService.get<string>('PADDLE_OCR_TIMEOUT_MS', '120000'),
      10,
    );
  }

  async onModuleInit(): Promise<void> {
    // Write the Python script to a temp file
    this.scriptPath = path.join(os.tmpdir(), 'mizano_paddleocr.py');
    fs.writeFileSync(this.scriptPath, PYTHON_SCRIPT, 'utf-8');

    // Check if rapidocr-onnxruntime is installed
    try {
      await this.execPython(
        ['-c', 'from rapidocr_onnxruntime import RapidOCR; print("ok")'],
        15000,
      );
      this.available = true;
      this.logger.log(`RapidOCR (PaddleOCR ONNX) is available (pkg: ${this.pythonPkgPath})`);
    } catch (err) {
      this.available = false;
      this.logger.warn(
        `RapidOCR not available. Install: pip install rapidocr-onnxruntime --target C:/paddleocr_pkg. ` +
          `Error: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Check if PaddleOCR Python package is installed and working. */
  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  /**
   * Recognize text from an image buffer.
   * Writes the image to a temp file, calls Python PaddleOCR, parses JSON output.
   */
  async recognize(imageBuffer: Buffer): Promise<OcrResult> {
    const startTime = Date.now();

    if (!this.available) {
      return { text: '', confidence: 0, regions: [], processingTimeMs: 0 };
    }

    // Write image to temp file
    const tmpImage = path.join(os.tmpdir(), `mizano_ocr_${Date.now()}.jpg`);

    try {
      fs.writeFileSync(tmpImage, imageBuffer);

      this.logger.log(`[OCR] Running PaddleOCR (lang=${this.defaultLang})...`);

      const output = await this.execPython(
        [this.scriptPath, tmpImage, this.defaultLang],
        this.timeoutMs,
      );

      const processingTimeMs = Date.now() - startTime;

      // Parse JSON output
      const jsonStr = output.trim().split('\n').pop() || '{}';
      const result = JSON.parse(jsonStr) as {
        text: string;
        confidence: number;
        regions: OcrRegion[];
      };

      this.logger.log(
        `[OCR] PaddleOCR result: regions=${result.regions.length}, confidence=${result.confidence}%, textLen=${result.text.length}, time=${processingTimeMs}ms`,
      );

      // Log each region for debugging
      for (const region of result.regions) {
        this.logger.debug(
          `  [${region.bbox.join(',')}] conf=${region.confidence}%: "${region.text}"`,
        );
      }

      return {
        text: result.text,
        confidence: result.confidence,
        regions: result.regions,
        processingTimeMs,
      };
    } catch (err) {
      const processingTimeMs = Date.now() - startTime;
      this.logger.error(
        `[OCR] PaddleOCR failed (${processingTimeMs}ms): ${err instanceof Error ? err.message : err}`,
      );
      return { text: '', confidence: 0, regions: [], processingTimeMs };
    } finally {
      // Clean up temp image
      try {
        if (fs.existsSync(tmpImage)) fs.unlinkSync(tmpImage);
      } catch {
        // ignore
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private execPython(args: string[], timeout = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        this.pythonPath,
        args,
        {
          timeout,
          maxBuffer: 10 * 1024 * 1024, // 10MB
          env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            PYTHONPATH: this.pythonPkgPath,
            PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: 'True',
          },
        },
        (error, stdout, stderr) => {
          if (error) {
            const msg = stderr || error.message;
            reject(new Error(msg.slice(0, 500)));
            return;
          }
          resolve(stdout);
        },
      );
    });
  }
}
