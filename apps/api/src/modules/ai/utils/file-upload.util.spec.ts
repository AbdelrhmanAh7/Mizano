import { BadRequestException } from '@nestjs/common';
import {
  OCR_ALLOWED_MIMES,
  OCR_FILE_TYPE_ERROR,
  EXTENSION_TO_MIME,
  resolveMimeFromExtension,
  createOcrFileFilter,
} from './file-upload.util';

describe('file-upload.util', () => {
  describe('OCR_ALLOWED_MIMES', () => {
    it('should contain 13 MIME types', () => {
      expect(OCR_ALLOWED_MIMES).toHaveLength(13);
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
    it('contains readable Arabic repair text', () => {
      expect(OCR_FILE_TYPE_ERROR).toContain('صورة مدعومة');
      expect(OCR_FILE_TYPE_ERROR).not.toContain('???');
    });
    it('should mention DOCX in the error message', () => {
      expect(OCR_FILE_TYPE_ERROR).toContain('DOCX');
    });

    it('should mention all major formats', () => {
      expect(OCR_FILE_TYPE_ERROR).toContain('supported image');
      expect(OCR_FILE_TYPE_ERROR).toContain('DOCX');
      expect(OCR_FILE_TYPE_ERROR).toContain('PDF');
      expect(OCR_FILE_TYPE_ERROR).toContain('PDF');
    });
  });

  describe('EXTENSION_TO_MIME', () => {
    it('should have 15 entries', () => {
      expect(Object.keys(EXTENSION_TO_MIME)).toHaveLength(15);
    });

    it.each([
      ['.jpg', 'image/jpeg'],
      ['.jpeg', 'image/jpeg'],
      ['.png', 'image/png'],
      ['.gif', 'image/gif'],
      ['.webp', 'image/webp'],
      ['.tiff', 'image/tiff'],
      ['.tif', 'image/tiff'],
      ['.heic', 'image/heic'],
      ['.heif', 'image/heif'],
      ['.bmp', 'image/bmp'],
      ['.avif', 'image/avif'],
      ['.jxl', 'image/jxl'],
      ['.pdf', 'application/pdf'],
    ])('should map %s to %s', (ext, mime) => {
      expect(EXTENSION_TO_MIME[ext]).toBe(mime);
    });
  });

  describe('resolveMimeFromExtension', () => {
    it('should resolve .heic to image/heic', () => {
      expect(resolveMimeFromExtension('photo.heic')).toBe('image/heic');
    });

    it('should be case-insensitive (.HEIC)', () => {
      expect(resolveMimeFromExtension('photo.HEIC')).toBe('image/heic');
    });

    it('should resolve .pdf to application/pdf', () => {
      expect(resolveMimeFromExtension('document.pdf')).toBe('application/pdf');
    });

    it('should return undefined for unknown extension', () => {
      expect(resolveMimeFromExtension('file.exe')).toBeUndefined();
    });

    it('should return undefined for no extension', () => {
      expect(resolveMimeFromExtension('noext')).toBeUndefined();
    });

    it('should handle files with multiple dots', () => {
      expect(resolveMimeFromExtension('invoice.2024.01.heic')).toBe('image/heic');
    });
  });

  describe('createOcrFileFilter', () => {
    const filter = createOcrFileFilter();

    const createFile = (mimetype: string, originalname = 'test.file'): Express.Multer.File =>
      ({ mimetype, originalname }) as Express.Multer.File;

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
      let callbackErr: unknown = 'not-called';
      let callbackAccepted: boolean | undefined;

      filter({}, createFile(mime), (err: unknown, accepted: boolean) => {
        callbackErr = err;
        callbackAccepted = accepted;
      });

      expect(callbackErr).toBeNull();
      expect(callbackAccepted).toBe(true);
    });

    it.each(['text/plain', 'application/zip', 'video/mp4', 'application/json', 'image/svg+xml'])(
      'should reject %s',
      (mime: string) => {
        let callbackErr: unknown = 'not-called';
        let callbackAccepted: boolean | undefined;

        filter({}, createFile(mime), (err: unknown, accepted: boolean) => {
          callbackErr = err;
          callbackAccepted = accepted;
        });

        expect(callbackErr).toBeInstanceOf(BadRequestException);
        expect((callbackErr as Error).message).toBe(OCR_FILE_TYPE_ERROR);
        expect(callbackAccepted).toBe(false);
      },
    );

    it.each([
      ['application/msword', 'legacy.doc'],
      ['application/octet-stream', 'legacy.DOC'],
      ['', 'legacy.doc'],
      ['application/pdf', 'legacy.doc'],
    ])('rejects legacy %s/%s with bilingual repair', (mime, name) => {
      const cb = jest.fn();
      filter({}, createFile(mime, name), cb);
      expect(cb).toHaveBeenCalledWith(expect.any(BadRequestException), false);
      expect((cb.mock.calls[0][0] as Error).message).toContain('INTAKE_UNSUPPORTED_LEGACY_DOC');
      expect((cb.mock.calls[0][0] as Error).message).toContain('Save the file as DOCX or PDF');
      expect((cb.mock.calls[0][0] as Error).message).toMatch(/[\u0600-\u06ff]/);
    });
    it('sniffs an OLE buffer when supplied to the filter', () => {
      const cb = jest.fn();
      filter(
        {},
        {
          ...createFile('application/pdf', 'forged.pdf'),
          buffer: Buffer.from('d0cf11e0a1b11ae1', 'hex'),
        },
        cb,
      );
      expect(cb).toHaveBeenCalledWith(expect.any(BadRequestException), false);
    });
    describe('extension-based MIME fallback', () => {
      it.each([
        ['.heic', 'image/heic'],
        ['.HEIC', 'image/heic'],
        ['.heif', 'image/heif'],
        ['.tiff', 'image/tiff'],
        ['.tif', 'image/tiff'],
        ['.pdf', 'application/pdf'],
        ['.jpg', 'image/jpeg'],
        ['.png', 'image/png'],
      ])(
        'should accept application/octet-stream with %s extension and patch mimetype to %s',
        (ext: string, expectedMime: string) => {
          const file = createFile('application/octet-stream', `upload${ext}`);
          let callbackErr: unknown = 'not-called';
          let callbackAccepted: boolean | undefined;

          filter({}, file, (err: unknown, accepted: boolean) => {
            callbackErr = err;
            callbackAccepted = accepted;
          });

          expect(callbackErr).toBeNull();
          expect(callbackAccepted).toBe(true);
          expect(file.mimetype).toBe(expectedMime);
        },
      );

      it('should accept empty mimetype with .heic extension', () => {
        const file = createFile('', 'photo.heic');
        let callbackErr: unknown = 'not-called';
        let callbackAccepted: boolean | undefined;

        filter({}, file, (err: unknown, accepted: boolean) => {
          callbackErr = err;
          callbackAccepted = accepted;
        });

        expect(callbackErr).toBeNull();
        expect(callbackAccepted).toBe(true);
        expect(file.mimetype).toBe('image/heic');
      });

      it('should reject application/octet-stream with unknown extension (.exe)', () => {
        let callbackErr: unknown = 'not-called';
        let callbackAccepted: boolean | undefined;

        filter(
          {},
          createFile('application/octet-stream', 'malware.exe'),
          (err: unknown, accepted: boolean) => {
            callbackErr = err;
            callbackAccepted = accepted;
          },
        );

        expect(callbackErr).toBeInstanceOf(BadRequestException);
        expect(callbackAccepted).toBe(false);
      });

      it('should reject application/octet-stream with no extension', () => {
        let callbackErr: unknown = 'not-called';
        let callbackAccepted: boolean | undefined;

        filter(
          {},
          createFile('application/octet-stream', 'noext'),
          (err: unknown, accepted: boolean) => {
            callbackErr = err;
            callbackAccepted = accepted;
          },
        );

        expect(callbackErr).toBeInstanceOf(BadRequestException);
        expect(callbackAccepted).toBe(false);
      });

      it('should NOT fall back for non-octet-stream wrong MIME (video/mp4 + .heic)', () => {
        let callbackErr: unknown = 'not-called';
        let callbackAccepted: boolean | undefined;

        filter({}, createFile('video/mp4', 'fake.heic'), (err: unknown, accepted: boolean) => {
          callbackErr = err;
          callbackAccepted = accepted;
        });

        expect(callbackErr).toBeInstanceOf(BadRequestException);
        expect(callbackAccepted).toBe(false);
      });

      it('should handle files with multiple dots (invoice.2024.01.heic)', () => {
        const file = createFile('application/octet-stream', 'invoice.2024.01.heic');
        let callbackErr: unknown = 'not-called';
        let callbackAccepted: boolean | undefined;

        filter({}, file, (err: unknown, accepted: boolean) => {
          callbackErr = err;
          callbackAccepted = accepted;
        });

        expect(callbackErr).toBeNull();
        expect(callbackAccepted).toBe(true);
        expect(file.mimetype).toBe('image/heic');
      });
    });
  });
});
