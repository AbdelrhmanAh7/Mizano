/**
 * Shared image preprocessing utilities for OCR and VLM extraction.
 *
 * Extracted from OllamaService to be reused across extraction strategies.
 * Two presets: OCR-optimized (crisp text) vs VLM-optimized (compressed for model).
 */

import { Logger } from '@nestjs/common';
import { describeError } from '../../../common/utils/redact';
import * as sharp from 'sharp';
import { estimateDeskew } from './deskew.util';
import { IntakeFormatError } from '../intake/format-error';

const logger = new Logger('ImagePreprocessor');

// ---------------------------------------------------------------------------
// VLM Preset (existing behavior from OllamaService)
// ---------------------------------------------------------------------------

/** Max file size for VLM-processed images (300KB). */
const VLM_MAX_IMAGE_BYTES = 300 * 1024;
/** Starting max dimension for VLM. */
const VLM_INITIAL_MAX_DIM = 2048;
/** Starting JPEG quality for VLM. */
const VLM_INITIAL_JPEG_QUALITY = 90;

// ---------------------------------------------------------------------------
// OCR Preset
// ---------------------------------------------------------------------------

/** Max dimension for OCR-processed images (crisp text). */
const OCR_MAX_DIM = 2048;
/** JPEG quality for OCR (high — text needs clarity). */
const OCR_JPEG_QUALITY = 95;

// ---------------------------------------------------------------------------
// HEIC Conversion (shared)
// ---------------------------------------------------------------------------

/** Convert HEIC/HEIF buffer to JPEG. Tries sharp first, falls back to heic-convert. */
export async function convertHeicToJpeg(buffer: Buffer): Promise<Buffer> {
  try {
    const result = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
    logger.log(
      `HEIC → JPEG (sharp): ${(buffer.length / 1024).toFixed(0)}KB → ${(result.length / 1024).toFixed(0)}KB`,
    );
    return result;
  } catch {
    // sharp unavailable or can't decode HEIC
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- CJS decoder has no bundled TypeScript declarations.
    const convert = require('heic-convert') as (options: {
      buffer: Buffer;
      format: 'JPEG';
      quality: number;
    }) => Promise<ArrayBuffer | Uint8Array>;
    const result = await convert({ buffer, format: 'JPEG', quality: 0.9 });
    const converted = Buffer.from(result instanceof Uint8Array ? result : new Uint8Array(result));
    logger.log(
      `HEIC → JPEG (heic-convert): ${(buffer.length / 1024).toFixed(0)}KB → ${(converted.length / 1024).toFixed(0)}KB`,
    );
    return converted;
  } catch {
    throw new IntakeFormatError('CORRUPT');
  }
}

// ---------------------------------------------------------------------------
// VLM Preprocessing
// ---------------------------------------------------------------------------

/**
 * Preprocess an image for Ollama Vision model.
 * Preserves colors, resizes + compresses to ≤300KB.
 */
export async function preprocessForVlm(buffer: Buffer, mimeType: string): Promise<Buffer> {
  const isHeic = mimeType === 'image/heic' || mimeType === 'image/heif';

  let jpegBuffer = buffer;
  if (isHeic) {
    jpegBuffer = await convertHeicToJpeg(buffer);
  }

  const compressed = await compressToTarget(
    jpegBuffer,
    mimeType,
    VLM_MAX_IMAGE_BYTES,
    VLM_INITIAL_MAX_DIM,
    VLM_INITIAL_JPEG_QUALITY,
  );
  return compressed ?? jpegBuffer;
}

// ---------------------------------------------------------------------------
// OCR Preprocessing
// ---------------------------------------------------------------------------

/**
 * Preprocess an image for OCR (PaddleOCR).
 * Sharpens and normalizes contrast for crisp text. Does NOT binarize
 * (PaddleOCR handles that internally).
 */
export async function preprocessForOcr(buffer: Buffer, mimeType: string): Promise<Buffer> {
  const isHeic = mimeType === 'image/heic' || mimeType === 'image/heif';

  let jpegBuffer = buffer;
  if (isHeic) {
    jpegBuffer = await convertHeicToJpeg(buffer);
  }

  try {
    const upright = await sharp(jpegBuffer, { limitInputPixels: 24_000_000 })
      .rotate()
      .flatten({ background: '#ffffff' })
      .png()
      .toBuffer();
    const preview = await sharp(upright)
      .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
      .greyscale()
      .normalize()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (!preview.data.length || preview.data.every((pixel) => pixel === preview.data[0])) {
      throw new IntakeFormatError('UNREADABLE');
    }
    const angle = estimateDeskew(preview.data, preview.info.width, preview.info.height);
    const result = await sharp(upright)
      .rotate(angle, { background: '#ffffff' })
      .resize(OCR_MAX_DIM, OCR_MAX_DIM, { fit: 'inside', withoutEnlargement: true })
      .sharpen({ sigma: 1.5 })
      .normalize()
      .jpeg({ quality: OCR_JPEG_QUALITY })
      .toBuffer();

    logger.log(
      `OCR preprocess: ${(jpegBuffer.length / 1024).toFixed(0)}KB → ${(result.length / 1024).toFixed(0)}KB`,
    );
    return result;
  } catch (err) {
    if (err instanceof IntakeFormatError) throw err;
    logger.warn(`OCR preprocessing failed: ${describeError(err, { includeMessage: false })}`);
    throw new IntakeFormatError(
      err instanceof Error && /pixel limit/i.test(err.message) ? 'TOO_LARGE' : 'CORRUPT',
    );
  }
}

// ---------------------------------------------------------------------------
// Shared compression helper
// ---------------------------------------------------------------------------

/**
 * Progressively resize and reduce JPEG quality until the image is ≤ maxBytes.
 * Returns null when the image cannot be decoded or compressed.
 */
async function compressToTarget(
  buffer: Buffer,
  originalMimeType: string,
  maxBytes: number,
  initialMaxDim: number,
  initialQuality: number,
): Promise<Buffer | null> {
  try {
    const meta = await sharp(buffer).metadata();
    const origW = meta.width ?? 0;
    const origH = meta.height ?? 0;
    const origDim = Math.max(origW, origH);

    if (buffer.length <= maxBytes) {
      return buffer;
    }

    let maxDim = Math.min(origDim, initialMaxDim);
    let quality = initialQuality;
    let result: Buffer;
    let iteration = 0;

    // eslint-disable-next-line no-constant-condition -- Byte, quality and dimension bounds below terminate the loop.
    while (true) {
      iteration++;
      result = await sharp(buffer)
        .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();

      logger.debug(
        `compressToTarget iteration ${iteration}: ${maxDim}px q${quality} → ${(result.length / 1024).toFixed(0)}KB`,
      );

      if (result.length <= maxBytes) break;

      if (quality > 30) {
        quality -= 10;
      } else if (maxDim > 400) {
        maxDim = Math.round(maxDim * 0.7);
        quality = initialQuality;
      } else {
        break;
      }
    }

    logger.log(
      `Compressed: ${origW}x${origH} (${originalMimeType}) → JPEG ${maxDim}px q${quality} ` +
        `(${(buffer.length / 1024).toFixed(0)}KB → ${(result.length / 1024).toFixed(0)}KB)`,
    );
    return result;
  } catch (err) {
    logger.warn(`compression failed: ${describeError(err, { includeMessage: false })}`);
    return null;
  }
}

/**
 * Convert a raw image buffer to a pixel data array for ONNX inference.
 * Returns Float32Array in CHW format, normalized to [0,1].
 *
 * @param bgr  If true, output channels are BGR (PaddleOCR expects BGR). Default: false (RGB).
 */
export async function imageToFloat32CHW(
  buffer: Buffer,
  targetWidth: number,
  targetHeight: number,
  bgr = false,
): Promise<{ data: Float32Array; width: number; height: number }> {
  const { data, info } = await sharp(buffer)
    .resize(targetWidth, targetHeight, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data);
  const float32 = new Float32Array(3 * info.width * info.height);
  const hw = info.width * info.height;

  // HWC (RGB from sharp) → CHW, optionally swap to BGR
  const ch0 = bgr ? 2 : 0; // B or R
  const ch2 = bgr ? 0 : 2; // R or B
  for (let i = 0; i < hw; i++) {
    float32[i] = pixels[i * 3 + ch0] / 255.0; // channel 0
    float32[hw + i] = pixels[i * 3 + 1] / 255.0; // G (always middle)
    float32[2 * hw + i] = pixels[i * 3 + ch2] / 255.0; // channel 2
  }

  return { data: float32, width: info.width, height: info.height };
}

/**
 * Resize an image for PaddleOCR recognition: fixed height, aspect-ratio-preserved width.
 * Returns the resized buffer + actual dimensions.
 */
export async function resizeForRecognition(
  buffer: Buffer,
  targetHeight: number,
  maxWidth: number,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const meta = await sharp(buffer).metadata();
  const origW = meta.width ?? 1;
  const origH = meta.height ?? 1;

  // Preserve aspect ratio: new_width = orig_width * (target_height / orig_height)
  let newW = Math.round(origW * (targetHeight / origH));
  newW = Math.max(newW, 10); // minimum width
  newW = Math.min(newW, maxWidth); // cap at max

  const resized = await sharp(buffer)
    .resize(newW, targetHeight, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: Buffer.from(resized.data),
    width: resized.info.width,
    height: resized.info.height,
  };
}

/**
 * Crop a region from an image buffer.
 */
export async function cropRegion(
  buffer: Buffer,
  left: number,
  top: number,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(buffer)
    .extract({
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(width),
      height: Math.round(height),
    })
    .toBuffer();
}

/**
 * Get image dimensions.
 */
export async function getImageDimensions(
  buffer: Buffer,
): Promise<{ width: number; height: number }> {
  const meta = await sharp(buffer).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}
