import { BadRequestException } from '@nestjs/common';

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
];

/** Human-readable error shown when an unsupported file type is uploaded. */
export const OCR_FILE_TYPE_ERROR =
  'Invalid file type. Allowed: JPEG, PNG, BMP, WebP, TIFF, HEIC, AVIF, PDF';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (
    req: Record<string, unknown>,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
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
