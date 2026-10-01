/**
 * PaddleOCR service — calls RapidOCR (ONNX runtime) via Python subprocess.
 *
 * Features:
 *  - Arabic-optimized recognition model (PP-OCRv3 Arabic, auto-downloaded)
 *  - PDF → image conversion via PyMuPDF for scanned PDFs
 *  - RTL text reordering for Arabic output
 *
 * Setup:
 *   pip install rapidocr-onnxruntime PyMuPDF arabic-reshaper python-bidi --target C:/paddleocr_pkg
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { describeError, redactText } from '../../../common/utils/redact';
import {
  createSecureTempDir,
  removeSecureTempDir,
  secureTempFilePath,
  withSecureTempDir,
  writeSecureFile,
} from '../utils/secure-temp.util';

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

/** stderr lines written by our own Python scripts that are safe to log (no document content). */
const SAFE_PYTHON_STDERR =
  /^(Downloading Arabic |Using Arabic recognition model|Arabic models unavailable|Arabic model download failed|PyMuPDF \(fitz\) not installed)/;

/** Environment variables the Python OCR subprocess may inherit (platform basics + proxies). */
const PYTHON_ENV_ALLOWLIST = [
  'PATH',
  'Path',
  'PATHEXT',
  'SYSTEMROOT',
  'SystemRoot',
  'WINDIR',
  'TEMP',
  'TMP',
  'TMPDIR',
  'HOME',
  'USERPROFILE',
  'LOCALAPPDATA',
  'APPDATA',
  'LANG',
  'LC_ALL',
  'PYTHONHOME',
  'VIRTUAL_ENV',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'SSL_CERT_FILE',
  'REQUESTS_CA_BUNDLE',
];

function pickEnv(source: NodeJS.ProcessEnv, keys: string[]): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) picked[key] = value;
  }
  return picked;
}

// ---------------------------------------------------------------------------
// Python script — Arabic OCR with PDF support
// ---------------------------------------------------------------------------

const PYTHON_OCR_SCRIPT = `
import sys, json, os, tempfile, uuid, shutil, atexit
from pathlib import Path

# ── Arabic model setup ───────────────────────────────────────────────────────
MODELS_DIR = os.environ.get("PADDLE_OCR_MODELS_DIR",
    os.path.join(tempfile.gettempdir(), "mizano_ocr_models"))

def ensure_arabic_models():
    rec_path = os.path.join(MODELS_DIR, "arabic_rec.onnx")
    dict_path = os.path.join(MODELS_DIR, "arabic_dict.txt")
    if os.path.exists(rec_path) and os.path.exists(dict_path):
        return rec_path, dict_path
    os.makedirs(MODELS_DIR, mode=0o700, exist_ok=True)
    import urllib.request
    base = "https://huggingface.co/monkt/paddleocr-onnx/resolve/main"
    try:
        if not os.path.exists(rec_path):
            sys.stderr.write(f"Downloading Arabic rec model to {rec_path}...\\n")
            urllib.request.urlretrieve(f"{base}/languages/arabic/rec.onnx", rec_path)
        if not os.path.exists(dict_path):
            sys.stderr.write(f"Downloading Arabic dict to {dict_path}...\\n")
            urllib.request.urlretrieve(f"{base}/languages/arabic/dict.txt", dict_path)
        return rec_path, dict_path
    except Exception as e:
        sys.stderr.write(f"Arabic model download failed: {e}\\n")
        return None, None

def create_arabic_engine(rec_path, dict_path):
    """Create RapidOCR engine with Arabic recognition model via config patching."""
    from rapidocr_onnxruntime.rapid_ocr_api import RapidOCR, LoadImage
    from rapidocr_onnxruntime.utils import read_yaml, concat_model_path

    # Find the rapidocr_onnxruntime package root
    import rapidocr_onnxruntime
    root = Path(rapidocr_onnxruntime.__file__).parent
    config = read_yaml(str(root / "config.yaml"))
    config = concat_model_path(config)

    # Patch recognition model + dictionary for Arabic
    config["Rec"]["model_path"] = rec_path
    config["Rec"]["keys_path"] = dict_path

    # Build engine manually with patched config
    engine = RapidOCR.__new__(RapidOCR)
    g = config["Global"]
    engine.print_verbose = g["print_verbose"]
    engine.text_score = g["text_score"]
    engine.min_height = g["min_height"]
    engine.width_height_ratio = g["width_height_ratio"]
    engine.use_text_det = g["use_text_det"]
    engine.use_angle_cls = g["use_angle_cls"]

    # Detection (language-agnostic, works for Arabic)
    Det = engine.init_module(config["Det"]["module_name"], config["Det"]["class_name"])
    engine.text_detector = Det(config["Det"])

    # Recognition (Arabic model)
    Rec = engine.init_module(config["Rec"]["module_name"], config["Rec"]["class_name"])
    engine.text_recognizer = Rec(config["Rec"])

    # Classifier (optional)
    if g["use_angle_cls"]:
        Cls = engine.init_module(config["Cls"]["module_name"], config["Cls"]["class_name"])
        engine.text_cls = Cls(config["Cls"])

    engine.load_img = LoadImage()
    return engine

# ── RTL text fixing ──────────────────────────────────────────────────────────
try:
    import arabic_reshaper
    from bidi.algorithm import get_display
    def fix_arabic(text):
        try:
            reshaped = arabic_reshaper.reshape(text)
            return get_display(reshaped)
        except Exception:
            return text
except ImportError:
    def fix_arabic(text):
        return text

# ── PDF to images ────────────────────────────────────────────────────────────
PAGE_DIRS = []
atexit.register(lambda: [shutil.rmtree(d, ignore_errors=True) for d in PAGE_DIRS])

def pdf_to_images(pdf_path, dpi=300):
    try:
        import fitz
    except ImportError:
        sys.stderr.write("PyMuPDF (fitz) not installed\\n")
        return []
    doc = fitz.open(pdf_path)
    images = []
    # Private (0700) directory + random names: never predictable paths in the shared temp dir.
    page_dir = tempfile.mkdtemp(prefix="mizano-pdfpages-")
    PAGE_DIRS.append(page_dir)
    for i in range(len(doc)):
        pix = doc[i].get_pixmap(dpi=dpi)
        img_path = os.path.join(page_dir, f"{uuid.uuid4().hex}.png")
        pix.save(img_path)
        images.append(img_path)
    doc.close()
    return images

# ── Main ─────────────────────────────────────────────────────────────────────
file_path = sys.argv[1]

# Load Arabic models (auto-download on first run)
rec_path, dict_path = ensure_arabic_models()
use_arabic = rec_path is not None and dict_path is not None

if use_arabic:
    engine = create_arabic_engine(rec_path, dict_path)
    sys.stderr.write(f"Using Arabic recognition model: {rec_path}\\n")
else:
    from rapidocr_onnxruntime import RapidOCR
    engine = RapidOCR()
    sys.stderr.write("Arabic models unavailable — using default (Chinese+English)\\n")

# Handle PDF or image input
is_pdf = file_path.lower().endswith('.pdf')
if is_pdf:
    image_paths = pdf_to_images(file_path)
    if not image_paths:
        print(json.dumps({"regions": [], "text": "", "confidence": 0}))
        sys.exit(0)
else:
    image_paths = [file_path]

# OCR each page/image
all_regions = []
all_lines = []
total_conf = 0.0
total_count = 0

for page_path in image_paths:
    result, elapse = engine(page_path)
    if result:
        for item in result:
            bbox_pts, text, score = item
            if use_arabic:
                text = fix_arabic(text)
            conf = float(score) if score else 0.0
            x_coords = [p[0] for p in bbox_pts]
            y_coords = [p[1] for p in bbox_pts]
            bbox = [int(min(x_coords)), int(min(y_coords)),
                    int(max(x_coords) - min(x_coords)), int(max(y_coords) - min(y_coords))]
            all_regions.append({"text": text, "bbox": bbox, "confidence": round(conf * 100, 1)})
            all_lines.append(text)
            total_conf += conf
            total_count += 1

# Temp page images are removed by the atexit hook registered above (also runs on errors)

output = {
    "regions": all_regions,
    "text": "\\n".join(all_lines),
    "confidence": round((total_conf / total_count) * 100, 1) if total_count > 0 else 0
}

print(json.dumps(output, ensure_ascii=False))
`;

// ---------------------------------------------------------------------------
// Python script — PDF page to PNG image (for VLM strategy)
// ---------------------------------------------------------------------------

const PYTHON_PDF_TO_IMAGE_SCRIPT = `
import sys, fitz
pdf_path = sys.argv[1]
out_path = sys.argv[2]
page_num = int(sys.argv[3]) if len(sys.argv) > 3 else 0
dpi = int(sys.argv[4]) if len(sys.argv) > 4 else 300
doc = fitz.open(pdf_path)
if page_num >= len(doc):
    page_num = 0
pix = doc[page_num].get_pixmap(dpi=dpi)
pix.save(out_path)
doc.close()
print("ok")
`;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class PaddleOcrService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaddleOcrService.name);

  private readonly pythonPath: string;
  private readonly defaultLang: string;
  private readonly timeoutMs: number;
  private readonly pythonPkgPath: string;
  private readonly modelsDir: string;

  /** Private (0700) directory holding the generated Python helper scripts. */
  private scriptDir: string | null = null;
  private ocrScriptPath: string = '';
  private pdfScriptPath: string = '';
  private ocrAvailable = false;
  private pdfRenderAvailable = false;

  constructor(private configService: ConfigService) {
    this.pythonPath = this.configService.get<string>('PYTHON_PATH', 'python');
    this.pythonPkgPath = this.configService.get<string>('PADDLE_OCR_PKG_PATH', 'C:/paddleocr_pkg');
    this.modelsDir = this.configService.get<string>(
      'PADDLE_OCR_MODELS_DIR',
      path.join(os.tmpdir(), 'mizano_ocr_models'),
    );
    this.defaultLang = this.configService.get<string>('PADDLE_OCR_LANG', 'ar');
    this.timeoutMs = parseInt(
      this.configService.get<string>('PADDLE_OCR_TIMEOUT_MS', '120000'),
      10,
    );
  }

  async onModuleInit(): Promise<void> {
    // Write the Python helper scripts into a private temp directory. A fixed name in the
    // shared temp dir would let another local user replace a script we then execute.
    this.scriptDir = await createSecureTempDir('mizano-ocr-scripts-');
    this.ocrScriptPath = path.join(this.scriptDir, 'paddleocr.py');
    this.pdfScriptPath = path.join(this.scriptDir, 'pdf_to_image.py');
    await writeSecureFile(this.ocrScriptPath, PYTHON_OCR_SCRIPT, 'utf-8');
    await writeSecureFile(this.pdfScriptPath, PYTHON_PDF_TO_IMAGE_SCRIPT, 'utf-8');

    // Check RapidOCR
    try {
      await this.execPython(
        ['-c', 'from rapidocr_onnxruntime import RapidOCR; print("ok")'],
        15000,
      );
      this.ocrAvailable = true;
      this.logger.log('RapidOCR (PaddleOCR ONNX) is available');
    } catch (err) {
      this.ocrAvailable = false;
      this.logger.warn(
        `RapidOCR not available. Install: pip install rapidocr-onnxruntime --target ${this.pythonPkgPath}. ` +
          `Error: ${describeError(err)}`,
      );
    }

    // Check PyMuPDF (for PDF rendering)
    try {
      await this.execPython(['-c', 'import fitz; print("ok")'], 10000);
      this.pdfRenderAvailable = true;
      this.logger.log('PyMuPDF (fitz) is available — PDF page rendering enabled');
    } catch {
      this.pdfRenderAvailable = false;
      this.logger.warn(
        `PyMuPDF not available — PDF page rendering disabled. Install: pip install PyMuPDF --target ${this.pythonPkgPath}`,
      );
    }

    // Check Arabic text deps (informational only)
    try {
      await this.execPython(
        ['-c', 'import arabic_reshaper; from bidi.algorithm import get_display; print("ok")'],
        10000,
      );
      this.logger.log('Arabic text reshaping (arabic-reshaper + python-bidi) available');
    } catch {
      this.logger.warn(
        `Arabic RTL text fixing not available. Install: pip install arabic-reshaper python-bidi --target ${this.pythonPkgPath}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.scriptDir) {
      await removeSecureTempDir(this.scriptDir);
      this.scriptDir = null;
    }
  }

  /** Check if PaddleOCR Python package is installed and working. */
  async isAvailable(): Promise<boolean> {
    return this.ocrAvailable;
  }

  /** Check if PDF page → image rendering is available (PyMuPDF). */
  canRenderPdf(): boolean {
    return this.pdfRenderAvailable;
  }

  /**
   * Recognize text from an image or PDF buffer.
   * For PDFs: converts pages to images via PyMuPDF, then OCR each page.
   * Uses Arabic recognition model (auto-downloaded on first run).
   */
  async recognize(fileBuffer: Buffer, isPdf: boolean = false): Promise<OcrResult> {
    const startTime = Date.now();

    if (!this.ocrAvailable) {
      return { text: '', confidence: 0, regions: [], processingTimeMs: 0 };
    }

    if (isPdf && !this.pdfRenderAvailable) {
      this.logger.warn('[OCR] PDF input but PyMuPDF not available — cannot render pages');
      return { text: '', confidence: 0, regions: [], processingTimeMs: 0 };
    }

    const ext = isPdf ? '.pdf' : '.jpg';

    try {
      return await withSecureTempDir('mizano-ocr-', async (dir) => {
        const tmpFile = secureTempFilePath(dir, ext);
        await writeSecureFile(tmpFile, fileBuffer);

        this.logger.log(`[OCR] Running PaddleOCR (lang=${this.defaultLang}, pdf=${isPdf})...`);

        const output = await this.execPython([this.ocrScriptPath, tmpFile], this.timeoutMs);

        const processingTimeMs = Date.now() - startTime;

        // Parse JSON output (last line of stdout)
        const jsonStr = output.trim().split('\n').pop() || '{}';
        const result = JSON.parse(jsonStr) as {
          text: string;
          confidence: number;
          regions: OcrRegion[];
        };

        // Counters only: region text is document content and is never logged.
        this.logger.log(
          `[OCR] PaddleOCR result: regions=${result.regions.length}, confidence=${result.confidence}%, ` +
            `textLen=${result.text.length}, time=${processingTimeMs}ms`,
        );

        return {
          text: result.text,
          confidence: result.confidence,
          regions: result.regions,
          processingTimeMs,
        };
      });
    } catch (err) {
      const processingTimeMs = Date.now() - startTime;
      this.logger.error(`[OCR] PaddleOCR failed (${processingTimeMs}ms): ${describeError(err)}`);
      return { text: '', confidence: 0, regions: [], processingTimeMs };
    }
  }

  /**
   * Convert a single PDF page to a PNG image buffer.
   * Used by VLM strategy to send PDF pages as images to the vision model.
   *
   * @returns PNG image buffer, or null if conversion fails
   */
  async pdfPageToImage(
    pdfBuffer: Buffer,
    page: number = 0,
    dpi: number = 300,
  ): Promise<Buffer | null> {
    if (!this.pdfRenderAvailable) {
      this.logger.warn('pdfPageToImage: PyMuPDF not available');
      return null;
    }

    try {
      return await withSecureTempDir('mizano-pdf-', async (dir) => {
        const tmpPdf = secureTempFilePath(dir, '.pdf');
        const tmpImg = secureTempFilePath(dir, '.png');
        await writeSecureFile(tmpPdf, pdfBuffer);

        await this.execPython(
          [this.pdfScriptPath, tmpPdf, tmpImg, String(page), String(dpi)],
          30000,
        );

        if (!fs.existsSync(tmpImg)) {
          this.logger.warn('pdfPageToImage: output image not created');
          return null;
        }

        const imageBuffer = await fs.promises.readFile(tmpImg);
        this.logger.log(
          `pdfPageToImage: page=${page}, dpi=${dpi}, size=${(imageBuffer.length / 1024).toFixed(0)}KB`,
        );
        return imageBuffer;
      });
    } catch (err) {
      this.logger.error(`pdfPageToImage failed: ${describeError(err)}`);
      return null;
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
            // Allowlist only: the OCR subprocess must not inherit JWT/DB/SMTP secrets
            ...pickEnv(process.env, PYTHON_ENV_ALLOWLIST),
            PYTHONIOENCODING: 'utf-8',
            PYTHONPATH: this.pythonPkgPath,
            PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: 'True',
            PADDLE_OCR_MODELS_DIR: this.modelsDir,
          },
        },
        (error, stdout, stderr) => {
          if (stderr) {
            // Python stderr may quote the document (tracebacks, library warnings): only our own
            // status lines (model download / model selection) are logged, as debug.
            for (const line of stderr.split('\n').filter(Boolean)) {
              if (SAFE_PYTHON_STDERR.test(line)) {
                this.logger.debug(`[Python] ${redactText(line, 200)}`);
              }
            }
          }
          if (error) {
            // Surface only the last stderr line (the exception summary), redacted and capped.
            const lines = (stderr || error.message).split('\n').filter((l) => l.trim());
            const summary = lines[lines.length - 1] ?? 'Python process failed';
            reject(new Error(redactText(summary, 200)));
            return;
          }
          resolve(stdout);
        },
      );
    });
  }
}
