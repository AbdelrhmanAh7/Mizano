import * as sharp from 'sharp';
import { rejectLegacyWord, validateIntakeFormat } from './format-validation';
import { checkTextLimit, MAX_INTAKE_BYTES, MAX_INTAKE_TEXT } from './format-error';
import { DOCX_MIME } from './word-reader';

describe('intake format limits and sniffing', () => {
  it('preserves text after character 4000 and rejects rather than truncates the limit', () => {
    const text = 'x'.repeat(5000) + '\nGrand total: 228.0000';
    expect(checkTextLimit(text)).toBe(text);
    expect(() => checkTextLimit('x'.repeat(MAX_INTAKE_TEXT + 1))).toThrow('INTAKE_TOO_LARGE');
  });
  it('rejects oversized and empty input with repair messages', async () => {
    await expect(
      validateIntakeFormat(Buffer.alloc(MAX_INTAKE_BYTES + 1), 'application/pdf'),
    ).rejects.toThrow('Split it into smaller files');
    await expect(validateIntakeFormat(Buffer.alloc(0), 'application/pdf')).rejects.toThrow(
      'INTAKE_CORRUPT',
    );
  });
  it.each(['application/pdf', DOCX_MIME, 'image/png'])('rejects a forged %s MIME', async (mime) => {
    await expect(validateIntakeFormat(Buffer.from('not a document'), mime)).rejects.toThrow(
      'INTAKE_CORRUPT',
    );
  });
  it.each(['application/msword', DOCX_MIME, 'application/pdf', 'image/png'])(
    'rejects OLE2 mislabeled as %s synchronously',
    (mime) => {
      expect(() => rejectLegacyWord(Buffer.from('d0cf11e0a1b11ae1', 'hex'), mime)).toThrow(
        'INTAKE_UNSUPPORTED_LEGACY_DOC',
      );
    },
  );
  it('rejects legacy MIME even without an OLE signature', async () => {
    await expect(
      validateIntakeFormat(Buffer.from('not Word'), 'application/msword'),
    ).rejects.toThrow('INTAKE_UNSUPPORTED_LEGACY_DOC');
  });
  it('checks actual image encoding and accepts a single bounded image', async () => {
    const image = await sharp({
      create: { width: 10, height: 10, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    await expect(validateIntakeFormat(image, 'image/png')).resolves.toBeUndefined();
    await expect(validateIntakeFormat(image, 'image/jpeg')).rejects.toThrow('INTAKE_CORRUPT');
    await expect(validateIntakeFormat(image, 'application/zip')).rejects.toThrow(
      'INTAKE_UNSUPPORTED',
    );
  });
});
