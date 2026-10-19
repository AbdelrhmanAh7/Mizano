import * as sharp from 'sharp';
import { DOCX_MIME } from './word-reader';
import { IntakeFormatError, MAX_INTAKE_BYTES } from './format-error';
const OLE_MAGIC = Buffer.from('d0cf11e0a1b11ae1', 'hex');

/** Synchronous upload guard: no legacy job or original is persisted. */
export function rejectLegacyWord(buffer: Buffer | undefined, mime: string): void {
  if (mime === 'application/msword' || buffer?.subarray(0, 8).equals(OLE_MAGIC)) {
    throw new IntakeFormatError('UNSUPPORTED_LEGACY_DOC');
  }
}

/** MIME is only a hint: verify container signatures and bound decoded pixels. */
export async function validateIntakeFormat(buffer: Buffer, mime: string): Promise<void> {
  if (buffer.length > MAX_INTAKE_BYTES) throw new IntakeFormatError('TOO_LARGE');
  rejectLegacyWord(buffer, mime);
  if (!buffer.length) throw new IntakeFormatError('CORRUPT');
  if (mime === 'application/pdf') {
    if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new IntakeFormatError('CORRUPT');
    return;
  }
  if (mime === DOCX_MIME) {
    if (!buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4])))
      throw new IntakeFormatError('CORRUPT');
    return;
  }
  const formats: Record<string, string> = {
    'image/jpeg': 'jpeg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/tiff': 'tiff',
    'image/bmp': 'bmp',
    'image/x-bmp': 'bmp',
    'image/heic': 'heif',
    'image/heif': 'heif',
    'image/avif': 'heif',
    'image/jxl': 'jxl',
  };
  if (!formats[mime]) throw new IntakeFormatError('UNSUPPORTED');
  try {
    const meta = await sharp(buffer, { limitInputPixels: 24_000_000 }).metadata();
    if (meta.format !== formats[mime]) throw new IntakeFormatError('CORRUPT');
    if ((meta.pages ?? 1) > 1) throw new IntakeFormatError('UNSUPPORTED');
    if ((meta.width ?? 0) * (meta.height ?? 0) > 24_000_000)
      throw new IntakeFormatError('TOO_LARGE');
  } catch (error) {
    if (error instanceof IntakeFormatError) throw error;
    throw new IntakeFormatError(
      error instanceof Error && /pixel limit/i.test(error.message) ? 'TOO_LARGE' : 'CORRUPT',
    );
  }
}
