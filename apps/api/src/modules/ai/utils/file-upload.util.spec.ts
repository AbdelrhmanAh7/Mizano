import { BadRequestException } from '@nestjs/common';
import { OCR_ALLOWED_MIMES, OCR_FILE_TYPE_ERROR, createOcrFileFilter } from './file-upload.util';

describe('file-upload.util', () => {
  describe('OCR_ALLOWED_MIMES', () => {
    it('should contain 8 MIME types', () => {
      expect(OCR_ALLOWED_MIMES).toHaveLength(8);
    });

    it.each([
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/tiff',
      'image/heic',
      'image/heif',
      'application/pdf',
    ])('should include %s', (mime) => {
      expect(OCR_ALLOWED_MIMES).toContain(mime);
    });
  });

  describe('OCR_FILE_TYPE_ERROR', () => {
    it('should mention HEIC in the error message', () => {
      expect(OCR_FILE_TYPE_ERROR).toContain('HEIC');
    });

    it('should mention all major formats', () => {
      expect(OCR_FILE_TYPE_ERROR).toContain('JPEG');
      expect(OCR_FILE_TYPE_ERROR).toContain('PNG');
      expect(OCR_FILE_TYPE_ERROR).toContain('PDF');
      expect(OCR_FILE_TYPE_ERROR).toContain('TIFF');
    });
  });

  describe('createOcrFileFilter', () => {
    const filter = createOcrFileFilter();

    const createFile = (mimetype: string): Express.Multer.File =>
      ({ mimetype, originalname: 'test.file' }) as Express.Multer.File;

    it.each([
      ['image/jpeg', 'JPEG'],
      ['image/png', 'PNG'],
      ['image/gif', 'GIF'],
      ['image/webp', 'WebP'],
      ['image/tiff', 'TIFF'],
      ['image/heic', 'HEIC'],
      ['image/heif', 'HEIF'],
      ['application/pdf', 'PDF'],
    ])('should accept %s (%s)', (mime: string) => {
      let callbackErr: any = 'not-called';
      let callbackAccepted: boolean | undefined;

      filter({}, createFile(mime), (err: any, accepted: boolean) => {
        callbackErr = err;
        callbackAccepted = accepted;
      });

      expect(callbackErr).toBeNull();
      expect(callbackAccepted).toBe(true);
    });

    it.each(['text/plain', 'application/zip', 'video/mp4', 'application/json', 'image/svg+xml'])(
      'should reject %s',
      (mime: string) => {
        let callbackErr: any = 'not-called';
        let callbackAccepted: boolean | undefined;

        filter({}, createFile(mime), (err: any, accepted: boolean) => {
          callbackErr = err;
          callbackAccepted = accepted;
        });

        expect(callbackErr).toBeInstanceOf(BadRequestException);
        expect(callbackErr.message).toBe(OCR_FILE_TYPE_ERROR);
        expect(callbackAccepted).toBe(false);
      },
    );
  });
});
