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
  'application/pdf',
];

/** Human-readable error shown when an unsupported file type is uploaded. */
export const OCR_FILE_TYPE_ERROR =
  'Invalid file type. Allowed: JPEG, PNG, GIF, WebP, TIFF, HEIC, PDF';

/**
 * Creates a multer-compatible fileFilter that accepts OCR_ALLOWED_MIMES.
 * Use as the `fileFilter` option in FileInterceptor / FilesInterceptor.
 */
export function createOcrFileFilter() {
  return (req: any, file: Express.Multer.File, cb: any) => {
    if (OCR_ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestException(OCR_FILE_TYPE_ERROR), false);
    }
  };
}
