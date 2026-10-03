import { BadRequestException } from '@nestjs/common';
import { IntakeFormatError } from '../intake/format-error';
import { rejectLegacyWord } from '../intake/format-validation';

/** MIME types accepted by OCR/document-intake file upload endpoints. */
export const OCR_ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/tiff',
  'image/heic',
  'image/heif',
  'image/bmp',
  'image/x-bmp',
  'image/avif',
  'image/jxl',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/** Human-readable error shown when an unsupported file type is uploaded. */
export const OCR_FILE_TYPE_ERROR = new IntakeFormatError('UNSUPPORTED').message;

/** Maps common file extensions to their canonical MIME types. */
export const EXTENSION_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.jxl': 'image/jxl',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/**
 * Resolves a MIME type from a filename's extension using the EXTENSION_TO_MIME map.
 * Returns `undefined` if the extension is unknown or the filename has no extension.
 */
export function resolveMimeFromExtension(originalname: string): string | undefined {
  const lastDot = originalname.lastIndexOf('.');
  if (lastDot === -1) return undefined;
  return EXTENSION_TO_MIME[originalname.slice(lastDot).toLowerCase()];
}

/**
 * Creates a multer-compatible fileFilter that accepts OCR_ALLOWED_MIMES.
 * Use as the `fileFilter` option in FileInterceptor / FilesInterceptor.
 *
 * When the browser sends `application/octet-stream` or an empty MIME type
 * (common for HEIC files on Chrome/Windows/Linux), the filter falls back to
 * resolving the MIME from the file extension. If the resolved MIME is allowed,
 * `file.mimetype` is patched so downstream consumers receive the correct value.
 */
export function createOcrFileFilter() {
  return (
    req: Record<string, unknown>,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    try {
      rejectLegacyWord(file.buffer, file.mimetype);
      if (resolveMimeFromExtension(file.originalname) === 'application/msword') {
        throw new IntakeFormatError('UNSUPPORTED_LEGACY_DOC');
      }
    } catch (error) {
      cb(
        new BadRequestException(
          error instanceof IntakeFormatError ? error.message : OCR_FILE_TYPE_ERROR,
        ),
        false,
      );
      return;
    }
    if (OCR_ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
      return;
    }

    if (file.mimetype === 'application/octet-stream' || !file.mimetype) {
      const resolved = resolveMimeFromExtension(file.originalname);
      if (resolved && OCR_ALLOWED_MIMES.includes(resolved)) {
        file.mimetype = resolved;
        cb(null, true);
        return;
      }
    }

    cb(new BadRequestException(OCR_FILE_TYPE_ERROR), false);
  };
}
