/**
 * Image preprocessing for the two readers: OCR-optimized (crisp text) for the CPU rules reader,
 * and compressed JPEG for the organization's AI provider (smaller upload, within every
 * provider's image limits).
 */

import { Logger } from '@nestjs/common';
import { describeError } from '../../../common/utils/redact';

const logger = new Logger('ImagePreprocessor');

// ---------------------------------------------------------------------------
// AI provider preset
// ---------------------------------------------------------------------------

/** Images up to this size in a format every provider reads are sent unchanged. */
const AI_MAX_IMAGE_BYTES = 1536 * 1024;
const AI_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AI_INITIAL_MAX_DIM = 2048;
const AI_INITIAL_JPEG_QUALITY = 85;

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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sharp = require('sharp');
    const result = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
    logger.log(
      `HEIC → JPEG (sharp): ${(buffer.length / 1024).toFixed(0)}KB → ${(result.length / 1024).toFixed(0)}KB`,
    );
    return result;
  } catch {
    // sharp unavailable or can't decode HEIC
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const convert = require('heic-convert');
    const result = await convert({ buffer, format: 'JPEG', quality: 0.9 });
    const converted = Buffer.from(result);
    logger.log(
      `HEIC → JPEG (heic-convert): ${(buffer.length / 1024).toFixed(0)}KB → ${(converted.length / 1024).toFixed(0)}KB`,
    );
    return converted;
  } catch (err) {
    throw new Error(
      `HEIC conversion failed: ${err instanceof Error ? err.message : err}. Please convert to JPEG before uploading.`,
    );
  }
}

// ---------------------------------------------------------------------------
// AI provider preprocessing
// ---------------------------------------------------------------------------

/**
 * An image an AI provider accepts: JPEG, PNG or WebP within AI_MAX_IMAGE_BYTES as is; anything
 * else (HEIC, large photos) converted to a compressed JPEG. Null when it cannot be converted.
 */
export async function prepareImageForAi(
  buffer: Buffer,
  mimeType: string,
): Promise<{ data: Buffer; mimeType: string } | null> {
  if (AI_IMAGE_TYPES.has(mimeType) && buffer.length <= AI_MAX_IMAGE_BYTES) {
    return { data: buffer, mimeType };
  }
  try {
    const heic = mimeType === 'image/heic' || mimeType === 'image/heif';
    const source = heic ? await convertHeicToJpeg(buffer) : buffer;
    const compressed = await compressToTarget(
      source,
      heic ? 'image/jpeg' : mimeType,
      AI_MAX_IMAGE_BYTES,
      AI_INITIAL_MAX_DIM,
      AI_INITIAL_JPEG_QUALITY,
    );
    return compressed ? { data: compressed, mimeType: 'image/jpeg' } : null;
  } catch (err) {
    logger.warn(`AI image preprocessing failed: ${describeError(err, { includeMessage: false })}`);
    return null;
  }
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

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let sharp: ReturnType<typeof require>;
  try {
    sharp = require('sharp');
  } catch {
    logger.warn('sharp not available for OCR preprocessing');
    return jpegBuffer;
  }

  try {
    const result = await sharp(jpegBuffer)
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
    logger.warn(`OCR preprocessing failed: ${describeError(err)}`);
    return jpegBuffer;
  }
}

// ---------------------------------------------------------------------------
// Shared compression helper
// ---------------------------------------------------------------------------

/**
 * Progressively resize and reduce JPEG quality until the image is ≤ maxBytes.
 * Returns null if sharp is unavailable.
 */
async function compressToTarget(
  buffer: Buffer,
  originalMimeType: string,
  maxBytes: number,
  initialMaxDim: number,
  initialQuality: number,
): Promise<Buffer | null> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let sharp: ReturnType<typeof require>;
  try {
    sharp = require('sharp');
  } catch {
    logger.warn('sharp not available for compression');
    return null;
  }

  try {
    const meta = await sharp(buffer).metadata();
    const origW = meta.width ?? 0;
    const origH = meta.height ?? 0;
    const origDim = Math.max(origW, origH);

    // Small JPEGs pass; any other format is re-encoded so the caller always gets a JPEG.
    if (buffer.length <= maxBytes && originalMimeType === 'image/jpeg') {
      return buffer;
    }

    let maxDim = Math.min(origDim, initialMaxDim);
    let quality = initialQuality;
    let result: Buffer;
    let iteration = 0;

    // eslint-disable-next-line no-constant-condition
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
    logger.warn(`compression failed: ${describeError(err)}`);
    return null;
  }
}
